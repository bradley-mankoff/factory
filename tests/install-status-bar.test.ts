/**
 * The status bar app, ArchonWorkflowStatusBar, is a repo of its own (fac-2na; fac-s6f), and
 * the Factory neither builds it nor writes its login job. The seam is installation:
 * scripts/install.sh runs on a temporary Mac that already has the app and its job, and the
 * test reads back that app and job as they were, and the old RunBar app and job that no
 * install may write.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac, type Mac } from "./fixtures/install-mac.ts";

const label = "com.bradley-mankoff.archon-workflow-status-bar";

const appPath = (mac: Mac): string => join(mac.home, "Applications", "ArchonWorkflowStatusBar.app");
const binaryPath = (mac: Mac): string => join(appPath(mac), "Contents", "MacOS", "ArchonWorkflowStatusBar");
const jobPath = (mac: Mac): string => join(mac.home, "Library", "LaunchAgents", `${label}.plist`);

test("installing the Factory leaves the status bar app and its login job alone", () => {
	const mac = makeMac();
	try {
		// The app the status bar's own install.sh leaves: its binary, its Info.plist, and the
		// login job that opens it, loaded as it is on a Mac running that job.
		const binary = binaryPath(mac);
		mkdirSync(dirname(binary), { recursive: true });
		writeFileSync(binary, "#!/bin/sh\nexit 0\n");
		writeFileSync(join(appPath(mac), "Contents", "Info.plist"), `<plist>${label}</plist>\n`);
		const job = `<plist><string>${binary}</string></plist>\n`;
		writeFileSync(jobPath(mac), job);
		writeFileSync(join(mac.home, ".launchctl-loaded"), `${label}\n`);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(readFileSync(binary, "utf8"), "#!/bin/sh\nexit 0\n", "the installed app is not replaced");
		assert.equal(readFileSync(join(appPath(mac), "Contents", "Info.plist"), "utf8"), `<plist>${label}</plist>\n`);
		assert.equal(readFileSync(jobPath(mac), "utf8"), job, "the login job is not rewritten");
		assert.doesNotMatch(logOf(mac.logs.launchctl), new RegExp(`bootout gui/\\d+/${label}`), "the loaded job is left running");
		assert.equal(logOf(mac.logs.swift), "", "the Factory builds no app");
		assert.equal(logOf(mac.logs.codesign), "", "the Factory signs no app");

		// The old app and job the Factory used to install stay gone.
		assert.equal(existsSync(join(mac.home, "Applications", "RunBar.app")), false, "no old app is installed");
		assert.equal(
			existsSync(join(mac.home, "Library", "LaunchAgents", "com.bradley-mankoff.runbar.plist")),
			false,
			"no old login job is written",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
