/**
 * bin/worktrees is the read-only report of a repo's worktrees (fac-2jm): one row each,
 * naming whether the Run's work is still live and the exact command that would remove it.
 * The seam is the command: a scratch Mac with a real repo, a bare remote as origin and real
 * linked worktrees, plus a stand-in for the Archon CLI on PATH that answers `workflow runs`
 * from a fixture, so the Run's recorded base and status come from the test. Nothing here
 * looks inside bin/worktrees.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const worktreesCommand = join(root, "bin", "worktrees");

/** One Run as `archon workflow runs --all --json` reports it, cut to the fields the report reads. */
type Run = { id: string; status: string; path: string; base?: string };

/** One row of the report, as `--json` prints it. */
type Row = {
	path: string;
	branch: string | null;
	verdict: "KEEP" | "REVIEW" | "LANE" | "DEAD";
	destinations: string[];
	run: { id: string; status: string } | null;
	dirty: number | null;
	ignored: number | null;
	ignored_files: string[];
	unpushed: number | null;
	content: "landed" | "unlanded" | "unknown";
	command: string;
};

type Mac = {
	dir: string;
	main: string;
	git: (args: string[], cwd?: string) => string;
	/** Adds a linked worktree on a new branch cut from main, and returns its folder. */
	worktree: (branch: string) => string;
	/** The Runs the stand-in Archon reports. */
	runs: (runs: Run[]) => void;
	/** Runs bin/worktrees in a folder of the Mac, as a person or Project Manager would. */
	report: (options?: { cwd?: string; json?: boolean }) => { status: number; stdout: string; stderr: string };
	/** The rows of a --json report, run in the main checkout unless a folder is named. */
	rows: (cwd?: string) => Row[];
	/** The one row for a worktree in the main checkout's report. */
	row: (folder: string) => Row;
};

/** One scratch Mac: a repo with main pushed to a bare remote, and a stand-in Archon. */
function makeMac(): Mac {
	const dir = mkdtempSync(join(tmpdir(), "factory-worktrees-"));
	const home = join(dir, "home");
	const bin = join(dir, "bin");
	const remote = join(dir, "remote.git");
	const main = join(dir, "repo");
	const fixture = join(dir, "runs.json");
	mkdirSync(home, { recursive: true });
	mkdirSync(bin, { recursive: true });

	const git = (args: string[], cwd = main) =>
		execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

	execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
	execFileSync("git", ["init", "-q", "-b", "main", main]);
	git(["config", "user.email", "test@example.com"]);
	git(["config", "user.name", "Test"]);
	writeFileSync(join(main, "file.txt"), "one\n");
	git(["add", "file.txt"]);
	git(["commit", "-qm", "first"]);
	git(["remote", "add", "origin", remote]);
	git(["push", "-qu", "origin", "main"]);
	git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);

	// Archon at the edge: it prints the Runs the test made up.
	writeFileSync(
		join(bin, "archon"),
		`#!/bin/sh
cat "$ARCHON_FIXTURE"
`,
	);
	execFileSync("chmod", ["+x", join(bin, "archon")]);
	const runs = (list: Run[]) => {
		writeFileSync(
			fixture,
			JSON.stringify({
				runs: list.map((run) => ({
					id: run.id,
					status: run.status,
					working_path: run.path,
					metadata: { dispatch: { base_branch: run.base ?? "" } },
				})),
			}),
		);
	};
	runs([]);

	const worktree = (branch: string) => {
		const folder = join(dir, branch);
		git(["worktree", "add", "-q", "-b", branch, folder]);
		return folder;
	};

	const report = (options: { cwd?: string; json?: boolean } = {}) =>
		spawnSync(worktreesCommand, options.json ? ["--json"] : [], {
			cwd: options.cwd ?? main,
			encoding: "utf8",
			env: {
				...process.env,
				HOME: home,
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				ARCHON_FIXTURE: fixture,
			},
		});

	const rows = (cwd?: string) => {
		const result = report({ cwd, json: true });
		assert.equal(result.status, 0, result.stderr);
		return JSON.parse(result.stdout) as Row[];
	};

	const row = (folder: string) => {
		const found = rows().find((each) => each.path === realpathSync(folder));
		assert.ok(found, `the report has a row for ${folder}`);
		return found;
	};

	return { dir, main, git, worktree, runs, report, rows, row };
}

/** Squashes a worktree branch into `target` in the main checkout, then pushes it, the way
 * bin/land's squash landing does on the work Mac. */
function squashInto(mac: Mac, target: string, branch: string): void {
	mac.git(["checkout", "-q", target]);
	mac.git(["merge", "-q", "--squash", branch]);
	mac.git(["commit", "-qm", `squash ${branch} into ${target}`]);
	mac.git(["push", "-q", "origin", target]);
	mac.git(["checkout", "-q", "main"]);
}

test("a worktree whose branch was squash-landed into its recorded base reads DEAD with the removal command", () => {
	const mac = makeMac();
	// The Run's base is a lane branch, not the repo's default: a report that guessed main
	// would call this unlanded.
	mac.git(["branch", "lane", "main"]);
	mac.git(["push", "-q", "-u", "origin", "lane"]);
	const wt = mac.worktree("factory-build-1795000000001");
	writeFileSync(join(wt, "file.txt"), "one\ntwo\n");
	writeFileSync(join(wt, "second.txt"), "new\n");
	mac.git(["add", "-A"], wt);
	mac.git(["commit", "-qm", "run change one"], wt);
	writeFileSync(join(wt, "second.txt"), "new\nand more\n");
	mac.git(["commit", "-qam", "run change two"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000001"], wt);
	squashInto(mac, "lane", "factory-build-1795000000001");
	mac.runs([{ id: "run-1", status: "completed", path: wt, base: "lane" }]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "DEAD");
	assert.deepEqual(row.destinations, ["lane"], "the destination is the Run's recorded base");
	assert.equal(row.content, "landed");
	assert.equal(row.command, "archon complete factory-build-1795000000001");
	assert.equal(row.unpushed, 0, "the branch is pushed, so the plain removal command is enough");
});

test("a clean branch whose content is in no destination reads REVIEW and offers no removal", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000002");
	writeFileSync(join(wt, "file.txt"), "one\nunlanded\n");
	mac.git(["commit", "-qam", "unlanded change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000002"], wt);
	mac.runs([{ id: "run-2", status: "completed", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "REVIEW", "the work is in no destination, so only a person can remove it");
	assert.equal(row.content, "unlanded");
	assert.equal(row.command, "", "the report never offers a removal for live content");
});

test("a clean branch with uncommitted work reads REVIEW and is never offered a removal", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000003");
	writeFileSync(join(wt, "file.txt"), "one\nlanded\n");
	mac.git(["commit", "-qam", "landed change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000003"], wt);
	squashInto(mac, "main", "factory-build-1795000000003");
	// Work a person made after the Run, still only in the checkout.
	writeFileSync(join(wt, "notes.txt"), "handle this\n");
	mac.runs([{ id: "run-3", status: "completed", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "REVIEW", "uncommitted work is live whatever the branch holds");
	assert.equal(row.dirty, 1);
	assert.equal(row.command, "", "a dirty worktree is never passed a complete or a forcing command");
});

test("ignored files are printed under their row and never counted as work", () => {
	const mac = makeMac();
	writeFileSync(join(mac.main, ".gitignore"), ".env\n");
	mac.git(["add", ".gitignore"]);
	mac.git(["commit", "-qm", "ignore the local environment"]);
	mac.git(["push", "-q", "origin", "main"]);
	const wt = mac.worktree("factory-build-1795000000004");
	writeFileSync(join(wt, "file.txt"), "one\nlanded\n");
	mac.git(["commit", "-qam", "landed change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000004"], wt);
	squashInto(mac, "main", "factory-build-1795000000004");
	writeFileSync(join(wt, ".env"), "TOKEN=local\n");
	mac.runs([{ id: "run-4", status: "completed", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.dirty, 0, "an ignored file is not uncommitted work");
	assert.equal(row.ignored, 1);
	assert.deepEqual(row.ignored_files, [".env"]);
	assert.equal(row.verdict, "DEAD", "an ignored file does not make a landed worktree live");

	const text = mac.report().stdout;
	assert.match(text, /ignored: \.env/, "the report prints the ignored path for a person to judge");
});

test("the main checkout reads LANE", () => {
	const mac = makeMac();

	const row = mac.row(mac.main);
	assert.equal(row.verdict, "LANE");
	assert.equal(row.command, "");
});

test("a locked worktree reads LANE", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000005");
	mac.git(["worktree", "lock", wt]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "LANE");
});

test("a detached worktree reads LANE", () => {
	const mac = makeMac();
	const wt = join(mac.dir, "detached");
	mac.git(["worktree", "add", "-q", "--detach", wt, "main"]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "LANE");
	assert.equal(row.branch, null);
});

test("a prunable worktree, whose folder is gone, reads LANE", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000006");
	rmSync(wt, { recursive: true, force: true });

	// The folder is gone, so its path is named from the Mac's own root rather than resolved.
	const row = mac.rows().find((each) => each.path === join(realpathSync(mac.dir), "factory-build-1795000000006"));

	assert.ok(row);
	assert.equal(row.verdict, "LANE");
});

test("a bare repo reads as one LANE row", () => {
	const mac = makeMac();
	const bare = join(mac.dir, "bare.git");
	execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);

	const rows = mac.rows(bare);

	assert.equal(rows.length, 1);
	assert.equal(rows[0].verdict, "LANE");
});

test("a branch that another Run recorded as its base reads LANE, so a Project Manager's branch is never offered", () => {
	const mac = makeMac();
	const lane = mac.worktree("lane");
	const runWorktree = mac.worktree("factory-build-1795000000007");
	mac.runs([{ id: "run-7", status: "completed", path: runWorktree, base: "lane" }]);

	const row = mac.row(lane);
	assert.equal(row.verdict, "LANE", "its branch is where other Runs land, so it is a lane");
});

test("a running Run keeps its worktree KEEP and the row says to wait for it", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000008");
	writeFileSync(join(wt, "file.txt"), "one\nlanded\n");
	mac.git(["commit", "-qam", "landed change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000008"], wt);
	squashInto(mac, "main", "factory-build-1795000000008");
	mac.runs([{ id: "run-8", status: "running", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "KEEP", "a live Run vetoes the content test");
	assert.equal(row.command, "wait: Run run-8 is running");
	assert.equal(row.run?.status, "running");
});

test("a paused Run keeps its worktree KEEP and the row says to wait for the Human's answer", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000009");
	mac.runs([{ id: "run-9", status: "paused", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "KEEP");
	assert.equal(
		row.command,
		"wait: Run run-9 is paused at a Human gate or attention wait; the Human answers it",
		"a paused Run waits on the Human's answer, so the row never names a resume",
	);
});

test("a failed Run's dead worktree names the abandon before the complete", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000010");
	writeFileSync(join(wt, "file.txt"), "one\nlanded\n");
	mac.git(["commit", "-qam", "landed change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000010"], wt);
	squashInto(mac, "main", "factory-build-1795000000010");
	mac.runs([{ id: "run-10", status: "failed", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "DEAD", "the work landed, so the environment is dead once the Run is released");
	assert.equal(row.command, "archon workflow abandon run-10 && archon complete factory-build-1795000000010");
});

test("a failed Run whose work is in no destination names the abandon and offers no removal", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000011");
	writeFileSync(join(wt, "file.txt"), "one\nunlanded\n");
	mac.git(["commit", "-qam", "unlanded change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000011"], wt);
	mac.runs([{ id: "run-11", status: "failed", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.verdict, "REVIEW");
	assert.equal(row.content, "unlanded");
	assert.equal(row.command, "archon workflow abandon run-11", "the Run is released, the work is left for a person");
});

test("a squash the destination moved past still reads landed through the patch-id fallback", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000012");
	writeFileSync(join(wt, "file.txt"), "one\nrun\n");
	mac.git(["commit", "-qam", "run change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000012"], wt);
	squashInto(mac, "main", "factory-build-1795000000012");
	// The destination edits the same line after the squash, so a three-way merge conflicts.
	writeFileSync(join(mac.main, "file.txt"), "one\nlater\n");
	mac.git(["commit", "-qam", "destination moves on"]);
	mac.git(["push", "-q", "origin", "main"]);
	mac.runs([{ id: "run-12", status: "completed", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.content, "landed", "the patch-id proves the squash the tree merge could not");
	assert.equal(row.verdict, "DEAD");
});

test("unpushed commits add the force the content proof has earned", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000013");
	writeFileSync(join(wt, "file.txt"), "one\nlanded\n");
	mac.git(["commit", "-qam", "landed change"], wt);
	squashInto(mac, "main", "factory-build-1795000000013");
	mac.runs([{ id: "run-13", status: "completed", path: wt, base: "main" }]);

	const row = mac.row(wt);
	assert.equal(row.unpushed, 1);
	assert.equal(row.content, "landed");
	assert.equal(row.command, "archon complete --force factory-build-1795000000013");
});

test("a worktree named by Runs with two bases is dead when its work is in either one", () => {
	const mac = makeMac();
	mac.git(["branch", "lane", "main"]);
	mac.git(["push", "-q", "-u", "origin", "lane"]);
	const wt = mac.worktree("factory-build-1795000000014");
	writeFileSync(join(wt, "file.txt"), "one\nlanded\n");
	mac.git(["commit", "-qam", "landed change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000014"], wt);
	squashInto(mac, "lane", "factory-build-1795000000014");
	mac.runs([
		{ id: "run-14a", status: "completed", path: wt, base: "main" },
		{ id: "run-14b", status: "completed", path: wt, base: "lane" },
	]);

	const row = mac.row(wt);
	assert.deepEqual(row.destinations, ["main", "lane"], "every recorded base is named");
	assert.equal(row.content, "landed");
	assert.equal(row.verdict, "DEAD");
});

test("the text report prints one row per worktree", () => {
	const mac = makeMac();
	mac.worktree("factory-build-1795000000015");

	const text = mac.report();

	assert.equal(text.status, 0, text.stderr);
	const lines = text.stdout.split("\n").filter((line) => line && !line.startsWith(" "));
	assert.equal(lines.length, 2, "the main checkout and the Run's worktree, one row each");
});

test("a dead worktree's text row reads DEAD and ends with the command that removes it", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000015");
	writeFileSync(join(wt, "file.txt"), "one\nlanded\n");
	mac.git(["commit", "-qam", "landed change"], wt);
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000015"], wt);
	squashInto(mac, "main", "factory-build-1795000000015");
	mac.runs([{ id: "run-15", status: "completed", path: wt, base: "main" }]);

	const lines = mac.report().stdout.split("\n").filter((line) => line && !line.startsWith(" "));
	const dead = lines.find((line) => line.includes("factory-build-1795000000015"));

	assert.ok(dead, `the report has a row for the worktree: ${lines.join("\n")}`);
	assert.match(dead, /^DEAD /, "the row starts with its verdict");
	assert.ok(
		dead.endsWith("archon complete factory-build-1795000000015"),
		`the row ends with the exact command: ${dead}`,
	);
});

test("a folder that is not a git repo exits 0 and says so", () => {
	const mac = makeMac();
	const empty = join(mac.dir, "not-a-repo");
	mkdirSync(empty);

	const result = mac.report({ cwd: empty });

	assert.equal(result.status, 0, "the report exits 0 whatever it finds");
	assert.match(result.stderr, /not a git repo/);
});

test("the report writes nothing into the repo's objects", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000016");
	writeFileSync(join(wt, "file.txt"), "one\nunlanded\n");
	mac.git(["commit", "-qam", "unlanded change"], wt);
	mac.runs([{ id: "run-16", status: "completed", path: wt, base: "main" }]);
	const files = () =>
		execFileSync("find", [join(mac.main, ".git"), "-type", "f"], { encoding: "utf8" })
			.split("\n")
			.filter(Boolean)
			.sort();

	const before = files();
	mac.rows();
	assert.deepEqual(files(), before, "the content test leaves every object and index file as it was");
});

test("a worktree with no Run is tested against origin's HEAD, never against its own branch", () => {
	const mac = makeMac();
	const wt = mac.worktree("factory-build-1795000000017");
	writeFileSync(join(wt, "file.txt"), "one\nunlanded\n");
	mac.git(["commit", "-qam", "unlanded change"], wt);
	// Pushed under its own name, so its upstream is itself: a destination only if the report
	// fools itself.
	mac.git(["push", "-q", "-u", "origin", "factory-build-1795000000017"], wt);
	mac.runs([]);

	const row = mac.row(wt);
	assert.deepEqual(row.destinations, ["main"], "the repo's default branch is the fallback");
	assert.equal(row.content, "unlanded");
	assert.equal(row.verdict, "REVIEW", "a pushed branch is not landed just because it has an upstream");
});
