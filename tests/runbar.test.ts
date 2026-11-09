/**
 * RunBar, the menu bar item that lists the active Workflows (fac-s6f). The seam is
 * installation: scripts/install.sh runs on a temporary Mac with a stand-in Swift toolchain,
 * and the test reads back the app bundle, the login job that opens it, and what a Mac whose
 * toolchain cannot build it is told. What RunBar reads from Archon is covered by its own
 * tests, in runbar/Tests.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac, repoRoot as root } from "./fixtures/install-mac.ts";

const label = "com.bradley-mankoff.runbar";

test("install builds RunBar, puts it in ~/Applications and opens it at login", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		// The app bundle, signed ad hoc, with no Dock icon: the menu bar item is the app.
		const app = join(mac.home, "Applications", "RunBar.app");
		const info = readFileSync(join(app, "Contents", "Info.plist"), "utf8");
		assert.match(info, /<key>CFBundleIdentifier<\/key><string>com\.bradley-mankoff\.runbar<\/string>/);
		assert.match(info, /<key>LSUIElement<\/key><true\/>/);
		assert.ok(existsSync(join(app, "Contents", "MacOS", "RunBar")), "the built app is in the bundle");
		assert.match(logOf(mac.logs.codesign), new RegExp(`--sign - ${app}$`, "m"));

		// Built from this repo, with its products outside the checkout, which the Factory's
		// size count reads whole.
		assert.equal(
			logOf(mac.logs.swift).trim(),
			`build -c release --package-path ${root}/runbar --scratch-path ${mac.home}/.local/share/factory/runbar`
		);

		// The login job opens the app and starts it again if it dies.
		const job = readFileSync(join(mac.home, "Library", "LaunchAgents", `${label}.plist`), "utf8");
		assert.match(job, new RegExp(`<string>${app}/Contents/MacOS/RunBar</string>`));
		assert.match(job, /<key>RunAtLoad<\/key><true\/>/);
		assert.match(logOf(mac.logs.launchctl), new RegExp(`bootstrap gui/\\d+ .*${label}\\.plist`));
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a new RunBar binary restarts the login job, and the same one leaves it running", () => {
	const mac = makeMac();
	try {
		assert.equal(mac.install().status, 0);
		const boots = logOf(mac.logs.launchctl).split("\n").filter((line) => line.startsWith("bootout"));
		assert.equal(mac.install().status, 0, "a second install of the same build");
		assert.deepEqual(
			logOf(mac.logs.launchctl).split("\n").filter((line) => line.startsWith("bootout")),
			boots,
			"the job is left running while the binary is the one it started"
		);

		// launchd pins a loaded job to the binary it first saw, so a rebuild has to be
		// loaded again or the app dies on its next start (macOS 27).
		writeFileSync(join(mac.home, "Applications", "RunBar.app", "Contents", "MacOS", "RunBar"), "#!/bin/sh\nexit 0\n# rebuilt\n");
		assert.equal(mac.install().status, 0, "an install that rebuilds the app");
		assert.equal(
			logOf(mac.logs.launchctl).split("\n").filter((line) => line.startsWith("bootout")).length,
			boots.length + 1,
			"the job is loaded again with the new binary"
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a Mac whose Swift toolchain cannot build RunBar still installs, and says so", () => {
	const mac = makeMac();
	try {
		mac.env.SWIFT_FAIL = "1";

		const result = mac.install();

		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.equal(existsSync(join(mac.home, "Applications", "RunBar.app")), false, "no half-built app is left");
		assert.equal(existsSync(join(mac.home, "Library", "LaunchAgents", `${label}.plist`)), false, "no job asks for an app that is not there");
		assert.match(result.stderr, /RunBar did not install/, "install says the menu bar item is missing");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
