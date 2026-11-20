/**
 * The Factory depends on pi packages that live in repos of their own (fac-qpv.8.1); its own
 * pi extensions are the three a Project Manager loads, which install copies with the rest of
 * project-manager/ (fac-8xl). The seam is installation: scripts/install.sh runs with a
 * temporary HOME and stand-ins at the system's edges, `pi` among them, and the test reads
 * back the calls pi recorded and the files install leaves on that Mac. Nothing here looks
 * inside install.sh.
 */
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac, repoRoot } from "./fixtures/install-mac.ts";

/** The pi install commands install made, by the agent folder each ran for. */
const piCalls = (log: string): { folder: string; command: string }[] =>
	log
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [folder, command] = line.split("\t");
			return { folder, command };
		});

test("install installs each pi package into the pi folder that needs it", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const calls = piCalls(logOf(mac.logs.pi));
		const forFolder = (folder: string) =>
			calls.filter((call) => call.folder === folder).map((call) => call.command);
		// The Human's own pi gets the five packages Project Managers and his sessions use:
		// Beads, Bead links, Chains, the bash timeout and the ding that sounds a herdr
		// pane's turn (fac-o2r.1).
		assert.deepEqual(forFolder(join(mac.home, ".pi", "agent")), [
			"install git:github.com/bradley-mankoff/pi-beads",
			"install git:github.com/bradley-mankoff/pi-links",
			"install git:github.com/bradley-mankoff/pi-chains",
			"install git:github.com/bradley-mankoff/pi-bash-timeout",
			"install git:github.com/bradley-mankoff/pi-herdr-ding",
		]);
		// The Factory's pi folder, which every Run node reads, gets the Chains, Flows and bash
		// timeout.
		assert.deepEqual(forFolder(join(mac.home, ".local", "share", "factory", "pi-agent")), [
			"install git:github.com/bradley-mankoff/pi-chains",
			"install git:github.com/bradley-mankoff/pi-flows",
			"install git:github.com/bradley-mankoff/pi-bash-timeout",
		]);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the ding goes into the Human's pi folder alone, where a Project Manager loads it", () => {
	// pi-herdr-ding plays a herdr pane's turn sound, so it belongs in the Human's pi, which
	// every Project Manager and his own sessions read. A Run node has no screen and needs
	// no sound, and the package plays nothing there anyway (fac-o2r, fac-o2r.1).
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const folders = piCalls(logOf(mac.logs.pi))
			.filter((call) => call.command === "install git:github.com/bradley-mankoff/pi-herdr-ding")
			.map((call) => call.folder);
		assert.deepEqual(folders, [join(mac.home, ".pi", "agent")]);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a Run's pi folder keeps the bash timeout in the settings pi reads", () => {
	// install runs `pi install` and then merges the Factory's own settings.json over the file
	// pi wrote, so the Factory's file is the last word on which packages a Run loads. A
	// package missing there is fetched but never loaded.
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const settingsFile = join(mac.home, ".local", "share", "factory", "pi-agent", "settings.json");
		const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
		assert.ok(
			settings.packages.includes("git:github.com/bradley-mankoff/pi-bash-timeout"),
			`the merged settings list the bash timeout, so a hung bash call ends: ${JSON.stringify(settings.packages)}`,
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("both pi folders read the Chains file the Profile names", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const chains = join(mac.home, ".config", "factory", "chains.json");
		assert.equal(readlinkSync(join(mac.home, ".pi", "agent", "chains.json")), chains, "the Human's pi links to the Profile's Chains");
		assert.equal(
			readlinkSync(join(mac.home, ".local", "share", "factory", "pi-agent", "chains.json")),
			chains,
			"the Factory's pi links to the Profile's Chains, so a Run's nodes read the same Chains",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install makes no repairs for an earlier install, so a file it did not make is the Mac's own", () => {
	// The Factory is greenfield: install writes the Factory's own files and repairs nothing
	// an earlier install left. An old link into the pi-extensions folder and the old accounts
	// file stay as that Mac has them.
	const mac = makeMac();
	try {
		const extensions = join(mac.home, ".pi", "agent", "extensions");
		const old = join(mac.home, ".local", "share", "factory", "pi-extensions");
		mkdirSync(old, { recursive: true });
		writeFileSync(join(old, "bd-prime.ts"), "// an earlier install\n");
		mkdirSync(extensions, { recursive: true });
		symlinkSync(join(old, "bd-prime.ts"), join(extensions, "bd-prime.ts"));
		const own = join(extensions, "hide-tool-calls.ts");
		writeFileSync(own, "// the Human's own copy\n");
		const accounts = join(mac.home, ".local", "share", "factory", "accounts.json");
		writeFileSync(accounts, '{"claude-bridge": "an earlier install"}\n');

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(readlinkSync(join(extensions, "bd-prime.ts")), join(old, "bd-prime.ts"), "the old link is left as it is");
		assert.equal(readFileSync(own, "utf8"), "// the Human's own copy\n", "the Human's own extension file is left alone");
		assert.equal(readFileSync(accounts, "utf8"), '{"claude-bridge": "an earlier install"}\n', "the old accounts file is left alone");
		assert.equal(lstatSync(join(extensions, "subagent")).isSymbolicLink(), true, "the subagent extension stays a link install makes");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
