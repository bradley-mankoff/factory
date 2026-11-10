/**
 * The herdr login job starts the server with the PATH its sidebar needs (fac-0se).
 * herdr-sidebar renders Markdown by running glow by name, so a server launched by launchd
 * with launchd's bare PATH finds no glow and shows Markdown raw. The seam is installation:
 * scripts/install.sh runs on a temporary Mac, and the test reads back the launchd job it
 * wrote, the PATH launchd will hand the server, and asks that PATH where glow is. Nothing
 * here looks inside install.sh or herdr-sidebar.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { type Mac, makeMac, stub } from "./fixtures/install-mac.ts";

type Job = {
	Label: string;
	RunAtLoad: boolean;
	ProgramArguments: string[];
	EnvironmentVariables: Record<string, string>;
};

const jobPath = (mac: Mac): string => join(mac.home, "Library", "LaunchAgents", "factory.herdr.plist");

/** The launchd job as launchd reads it. */
const jobAt = (mac: Mac): Job =>
	JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", jobPath(mac)], { encoding: "utf8" }));

/** Where a PATH names one command, asked of a shell the way the sidebar's own lookup would. */
const which = (command: string, mac: Mac, path: string): string =>
	execFileSync("/bin/sh", ["-c", 'command -v "$1"', "sh", command], {
		encoding: "utf8",
		env: { HOME: mac.home, PATH: path },
	}).trim();

test("the herdr login job carries a PATH in which herdr-sidebar finds glow", () => {
	const mac = makeMac();
	try {
		// glow, as the Human has it beside herdr: installed by Homebrew, and reachable from the
		// person's own bin folder too. The temp Mac has no Homebrew, so only this copy exists
		// to be found, and the plist still has to name Homebrew's folder.
		const glow = join(mac.home, ".local", "bin", "glow");
		stub(glow, "exit 0");

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const job = jobAt(mac);
		assert.equal(job.Label, "factory.herdr");
		assert.equal(job.RunAtLoad, true, "the herdr server starts at login");

		const ours = ["/opt/homebrew/bin", join(mac.home, ".local", "bin")];
		const standard = ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
		const dirs = job.EnvironmentVariables.PATH.split(":");
		for (const dir of ours) {
			assert.ok(dirs.includes(dir), `the job's PATH names ${dir}: ${job.EnvironmentVariables.PATH}`);
			for (const other of standard) {
				assert.ok(
					dirs.indexOf(dir) < dirs.indexOf(other),
					`${dir} comes before ${other}: ${job.EnvironmentVariables.PATH}`,
				);
			}
		}
		// The machine running the test may have Homebrew's real glow, so the answer is checked as
		// the folder glow was found in, not as the temp Mac's copy.
		const found = which("glow", mac, job.EnvironmentVariables.PATH);
		assert.ok(ours.includes(dirname(found)), `the job's PATH finds glow, at ${found}: ${job.EnvironmentVariables.PATH}`);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
