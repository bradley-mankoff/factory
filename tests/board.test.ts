/**
 * The board starts at login and knows every Factory project (fac-qpv.7.3). The seam is
 * installation: scripts/install.sh runs on a temporary Mac with stand-ins at the edges
 * (beads-ui, launchd, herdr and the rest of the outside world), and the test reads back the
 * launchd job install wrote, runs that job the way launchd would, and reads what the board
 * was asked for in its stand-in's log. Nothing here looks inside install.sh or bin/board.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, type Mac, makeMac, shippedProfile, squashProfile } from "./fixtures/install-mac.ts";

type Job = {
	Label: string;
	RunAtLoad: boolean;
	ProgramArguments: string[];
	EnvironmentVariables: Record<string, string>;
};

const jobPath = (mac: Mac): string => join(mac.home, "Library", "LaunchAgents", "factory.bdui.plist");

/** The launchd job as launchd reads it. */
const jobAt = (mac: Mac): Job =>
	JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", jobPath(mac)], { encoding: "utf8" }));

/** Runs the job's program the way launchd would: this Mac's HOME and the PATH in the plist. */
const runJob = (mac: Mac): void => {
	const job = jobAt(mac);
	const [program, ...args] = job.ProgramArguments;
	const run = spawnSync(program, args, { encoding: "utf8", env: { ...mac.env, PATH: job.EnvironmentVariables.PATH } });
	assert.equal(run.status, 0, run.stderr || run.stdout);
};

/** Every start the board was asked for, as the folder it ran in and its arguments. */
const starts = (mac: Mac): { folder: string; args: string[] }[] =>
	logOf(mac.logs.bdui)
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [folder, args = ""] = line.split("\t");
			return { folder, args: args.split(" ") };
		});

const portOf = (start: { args: string[] }): string => start.args[start.args.indexOf("--port") + 1];

/** The projects the board knows, as beads-ui keeps them: one line per workspace. */
const workspaces = (mac: Mac): string[] => logOf(mac.logs.registered).split("\n").filter(Boolean).sort();

/** The jobs install loaded or booted out: what tells a second install from the first. */
const boots = (mac: Mac): string[] =>
	logOf(mac.logs.launchctl)
		.split("\n")
		.filter((line) => line.startsWith("bootstrap ") || line.startsWith("bootout "));

/** A project repo as install expects one: git, Beads, and its check command. */
const makeProject = (mac: Mac, name: string): string => {
	const repo = join(mac.home, "Developer", name);
	mkdirSync(join(repo, ".beads"), { recursive: true });
	execFileSync("git", ["init", "-q", repo]);
	mkdirSync(join(repo, ".archon"), { recursive: true });
	writeFileSync(join(repo, ".archon", ".env"), "FACTORY_CHECK=true\n");
	return repo;
};

const projectsFile = (mac: Mac): string => join(mac.home, ".config", "factory", "projects");

test("install writes a launchd job that starts the board at login and registers every project with it", () => {
	const mac = makeMac({ profile: squashProfile });
	try {
		const one = makeProject(mac, "one");
		const two = makeProject(mac, "two");
		writeFileSync(projectsFile(mac), `${one}\n${two}\n`);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const job = jobAt(mac);
		assert.equal(job.Label, "factory.bdui");
		assert.equal(job.RunAtLoad, true, "the board starts at login");
		assert.match(logOf(mac.logs.launchctl), /bootstrap gui\/\d+ .*factory\.bdui\.plist/, "install loads the job now");
		assert.deepEqual(workspaces(mac), [one, two], "the board knows every project in the list");

		// launchd hands the job a bare PATH, so the plist carries the folder beads-ui is in.
		assert.ok(
			job.EnvironmentVariables.PATH.split(":").some((dir) => existsSync(join(dir, "bdui"))),
			job.EnvironmentVariables.PATH,
		);
		const before = starts(mac).length;
		runJob(mac);
		const jobStarts = starts(mac).slice(before);
		assert.deepEqual([...new Set(jobStarts.map(portOf))], ["3917"], "the job starts the board on the Profile's port");
		const folders = new Set(jobStarts.map((start) => start.folder));
		for (const repo of [one, two]) assert.ok(folders.has(repo), `the job registers ${repo} with the board`);
		assert.deepEqual(workspaces(mac), [one, two], "the board knows each project once");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the board starts on the port the Mac's Profile names, and on 3917 when it names none", () => {
	// This Mac's Profile was written before the key existed, so it names no port.
	const nameless = makeMac({ profile: shippedProfile() });
	const named = makeMac({ profile: shippedProfile(), profileExtra: "BOARD_PORT=4400\n" });
	try {
		writeFileSync(nameless.profile, shippedProfile().replace(/^BOARD_PORT=.*$/m, ""));
		for (const mac of [nameless, named]) {
			const result = mac.install();
			assert.equal(result.status, 0, result.stderr || result.stdout);
		}
		assert.deepEqual([...new Set(starts(nameless).map(portOf))], ["3917"], "with no port in the Profile the board is on 3917");
		assert.deepEqual([...new Set(starts(named).map(portOf))], ["4400"], "the board is on the Port the Profile names");

		// At each login the job reads the Profile as it is then.
		const before = starts(named).length;
		runJob(named);
		assert.deepEqual([...new Set(starts(named).slice(before).map(portOf))], ["4400"], "the job starts the board on that port");
	} finally {
		for (const mac of [nameless, named]) rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("rerunning install changes nothing when the job and the registrations are in place", () => {
	const mac = makeMac({ profile: squashProfile });
	try {
		const one = makeProject(mac, "one");
		const two = makeProject(mac, "two");
		writeFileSync(projectsFile(mac), `${one}\n${two}\n`);
		assert.equal(mac.install().status, 0);

		const before = {
			job: readFileSync(jobPath(mac), "utf8"),
			boots: boots(mac),
			workspaces: workspaces(mac),
		};
		const again = mac.install();
		assert.equal(again.status, 0, again.stderr || again.stdout);

		assert.equal(readFileSync(jobPath(mac), "utf8"), before.job, "the job file is the one already there");
		assert.deepEqual(boots(mac), before.boots, "the job is left running, not started again");
		assert.deepEqual(workspaces(mac), before.workspaces, "the board knows the same projects, each once");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
