/**
 * A Profile may name extra pi extensions the Factory's pi folder loads (fac-pbg). The work
 * Mac's Chains reach GPT through two ChatGPT logins, registered by an extension that names
 * work accounts and so cannot ship here; the Profile's RUN_EXTENSIONS is how that Mac gets
 * the extension into every Run without a hand step no install repeats. The seam is
 * installation: scripts/install.sh runs with a temporary HOME, and the test reads back the
 * links install leaves in the Factory's pi folder. Nothing here looks inside install.sh.
 */
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { type Mac, makeMac, squashProfile } from "./fixtures/install-mac.ts";

/** A pi extension file on the Mac, outside the Factory, as a Mac's own extension is. */
const extensionFile = (mac: Mac, name: string): string => {
	const path = join(mac.home, "work", "extensions", name);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, "// this Mac's own extension\n");
	return path;
};

/** The extensions folder in the Factory's pi folder, where a Run's nodes load an extension from. */
const extensionsFolder = (mac: Mac): string =>
	join(mac.home, ".local", "share", "factory", "pi-agent", "extensions");

/** A Mac's extensions folder before install runs: a file of its own and a link it already had. */
type ExtensionsBefore = { own: string; target: string; link: string };

/**
 * The extensions folder as a Mac might already have it: a file of its own and a link an
 * earlier hand step made. Returns the file and the link's target, so a test can say both
 * are still there.
 */
const extensionsBefore = (mac: Mac): ExtensionsBefore => {
	const extensions = extensionsFolder(mac);
	mkdirSync(extensions, { recursive: true });
	const own = join(extensions, "hide-tool-calls.ts");
	writeFileSync(own, "// this Mac's own copy\n");
	const target = extensionFile(mac, "chatgpt-seats.ts");
	const link = join(extensions, "chatgpt-seats.ts");
	symlinkSync(target, link);
	return { own, target, link };
};

/** Asserts install left the extensions folder as that Mac had it. */
const assertExtensionsAsTheyWere = (before: ExtensionsBefore): void => {
	assert.equal(readFileSync(before.own, "utf8"), "// this Mac's own copy\n", "a file in the folder is left as it is");
	assert.equal(lstatSync(before.link).isSymbolicLink(), true, "the folder's link is still a link");
	assert.equal(readlinkSync(before.link), before.target, "the folder's link still points where it did");
};

test("a Profile that names an extra pi extension links it into the Factory's pi folder", () => {
	const mac = makeMac({ profile: squashProfile, profileExtra: "RUN_EXTENSIONS=$HOME/work/extensions/chatgpt-seats.ts\n" });
	try {
		const extension = extensionFile(mac, "chatgpt-seats.ts");

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(
			readlinkSync(join(extensionsFolder(mac), "chatgpt-seats.ts")),
			extension,
			"the named extension is linked into the Factory's pi folder",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a link in the Factory's pi folder to a path dropped from RUN_EXTENSIONS is removed", () => {
	const mac = makeMac({
		profile: squashProfile,
		profileExtra: 'RUN_EXTENSIONS="$HOME/work/extensions/chatgpt-seats.ts $HOME/work/extensions/old-seats.ts"\n',
	});
	try {
		const kept = extensionFile(mac, "chatgpt-seats.ts");
		const dropped = extensionFile(mac, "old-seats.ts");
		const first = mac.install();
		assert.equal(first.status, 0, first.stderr || first.stdout);
		assert.equal(readlinkSync(join(extensionsFolder(mac), "old-seats.ts")), dropped, "both listed extensions are linked first");

		// The Mac's Profile stops naming one of them.
		writeFileSync(mac.profile, squashProfile + "RUN_EXTENSIONS=$HOME/work/extensions/chatgpt-seats.ts\n");
		const second = mac.install();
		assert.equal(second.status, 0, second.stderr || second.stdout);

		assert.equal(existsSync(join(extensionsFolder(mac), "old-seats.ts")), false, "the dropped extension's link is gone");
		assert.equal(readlinkSync(join(extensionsFolder(mac), "chatgpt-seats.ts")), kept, "the kept extension stays linked");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("with RUN_EXTENSIONS unset, install leaves the extensions folder as it is", () => {
	const mac = makeMac({ profile: squashProfile });
	try {
		const before = extensionsBefore(mac);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assertExtensionsAsTheyWere(before);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("with RUN_EXTENSIONS empty, install leaves the extensions folder as it is", () => {
	const mac = makeMac({ profile: squashProfile, profileExtra: "RUN_EXTENSIONS=\n" });
	try {
		const before = extensionsBefore(mac);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assertExtensionsAsTheyWere(before);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
