/**
 * bin/land is how a Run lands its commits, the way the Mac's Profile says (GLOSSARY.md,
 * `Profile`; fac-qpv.6.4). The seam is the command: a real git repo with the Run in a
 * worktree and origin a bare remote beside it, made-up files, a Profile file for the Mac, a
 * check command, and a stand-in `gh` at the GitHub edge that writes down how it was called.
 * Nothing here looks inside bin/land.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { shippedProfile, squashProfile } from "./fixtures/install-mac.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type Mac = {
	dir: string;
	remote: string;
	artifacts: string;
	ghLog: string;
	land: (args?: string[]) => { status: number | null; stdout: string; stderr: string };
};

/**
 * One temporary Mac: a repo whose folder carries the name the Profile knows, the Run's
 * worktree on its own branch beside it, a bare remote as origin with main, develop and the
 * Project Manager's branch, the Mac's Profile, and a stand-in `gh`. The stand-in does
 * what GitHub does with the commands bin/land gives it, so the remote shows whether a
 * landing reached the base branch.
 */
const makeMac = (options: { profile: string; repo: string; base: string; check?: string }): Mac => {
	const dir = mkdtempSync(join(tmpdir(), "factory-land-"));
	const home = join(dir, "home");
	const bin = join(dir, "bin");
	const remote = join(dir, "remote.git");
	const main = join(dir, options.repo);
	const run = join(dir, `${options.repo}-run`);
	const artifacts = join(dir, "artifacts");
	const ghLog = join(dir, "gh.log");
	const ghOpen = join(dir, "gh-open");
	mkdirSync(join(home, ".config", "factory"), { recursive: true });
	writeFileSync(join(home, ".config", "factory", "profile"), options.profile);
	mkdirSync(bin, { recursive: true });
	mkdirSync(artifacts, { recursive: true });

	// GitHub, at the edge: it records each command, answers a pull request with a made-up
	// address, and lands a merge by moving the base branch on the remote, as a squash merge
	// would.
	writeFileSync(
		join(bin, "gh"),
		`#!/bin/sh
printf '%s\\n' "$*" >> "$GH_LOG"
case "$1 $2" in
	"pr create") printf 'https://github.com/example/${options.repo}/pull/7\\n'; : > "$GH_OPEN" ;;
	"pr view") [ -e "$GH_OPEN" ] && printf 'https://github.com/example/${options.repo}/pull/7\\n' || exit 1 ;;
	"pr merge") git -C "$REMOTE" update-ref "refs/heads/$BASE_BRANCH" "$(git rev-parse HEAD)" ;;
esac
exit 0
`,
		{ mode: 0o755 },
	);

	execFileSync("git", ["init", "-q", "-b", "main", main]);
	writeFileSync(join(main, "README.md"), "the starting tree\n");
	execFileSync("git", ["-C", main, "add", "README.md"]);
	execFileSync("git", ["-C", main, "commit", "-qm", "start"]);
	execFileSync("git", ["init", "-q", "--bare", remote]);
	execFileSync("git", ["-C", main, "remote", "add", "origin", remote]);
	execFileSync("git", ["-C", main, "push", "-q", "origin", "main"]);
	// The other branches the Mac may land on, all from the starting commit.
	for (const branch of ["develop", "pm/branch"]) {
		execFileSync("git", ["-C", main, "branch", branch, "main"]);
		execFileSync("git", ["-C", main, "push", "-q", "origin", branch]);
	}
	// The Run works in its own worktree, on its own branch, and commits there.
	execFileSync("git", ["-C", main, "worktree", "add", "-q", "-b", "run-1", run, options.base]);
	writeFileSync(join(run, "squash.txt"), "landed by the Run\n");
	execFileSync("git", ["-C", run, "add", "squash.txt"]);
	execFileSync("git", ["-C", run, "commit", "-qm", "Add squash.txt"]);
	writeFileSync(join(run, "squash.txt"), "landed by the Run, refined\n");
	execFileSync("git", ["-C", run, "commit", "-qam", "Refine squash.txt"]);

	const env: NodeJS.ProcessEnv = {
		...process.env,
		HOME: home,
		PATH: `${bin}:${process.env.PATH}`,
		BASE_BRANCH: options.base,
		// The check the Run's worktree already ran, run again on what lands. It passes only on
		// the squashed commit: the Run made two commits there, the squash is one over the base.
		FACTORY_CHECK: options.check ?? 'test "$(git rev-list --count HEAD)" = 2',
		ARTIFACTS_DIR: artifacts,
		WORKFLOW_ID: "run-123",
		ARGUMENTS: "pm-repo · fac-1",
		GH_LOG: ghLog,
		GH_OPEN: ghOpen,
		REMOTE: remote,
	};
	const land = (args: string[] = []) => spawnSync(join(root, "bin", "land"), args, { cwd: run, encoding: "utf8", env });

	return { dir, remote, artifacts, ghLog, land };
};

/** A branch's commit on the remote, as git sees it there. */
const ref = (mac: Mac, branch: string): string =>
	execFileSync("git", ["-C", mac.remote, "rev-parse", `refs/heads/${branch}`], { encoding: "utf8" }).trim();

/** A file's content at a branch on the remote. */
const fileAt = (mac: Mac, branch: string, path: string): string =>
	execFileSync("git", ["-C", mac.remote, "show", `${branch}:${path}`], { encoding: "utf8" });

/** The subject of a branch's tip commit on the remote. */
const subject = (mac: Mac, branch: string): string =>
	execFileSync("git", ["-C", mac.remote, "log", "-1", "--format=%s", branch], { encoding: "utf8" }).trim();

/** How the stand-in `gh` was called, one line per call. */
const ghCalls = (mac: Mac): string => (existsSync(mac.ghLog) ? readFileSync(mac.ghLog, "utf8") : "");

/** A note bin/land leaves in the Run's artifacts, or an empty string. */
const noteIn = (mac: Mac, name: string): string => {
	const path = join(mac.artifacts, name);
	return existsSync(path) ? readFileSync(path, "utf8") : "";
};
const landingNote = (mac: Mac): string => noteIn(mac, "landing");

test("under the squash landing a Run's commits are squashed onto the Project Manager's branch and pushed, with no pull request", () => {
	const mac = makeMac({ profile: squashProfile, repo: "myrepo", base: "pm/branch" });
	try {
		const before = { main: ref(mac, "main"), develop: ref(mac, "develop"), branch: ref(mac, "pm/branch") };

		const result = mac.land();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		// The Run's two commits reached the Project Manager's branch as one squashed commit.
		assert.notEqual(ref(mac, "pm/branch"), before.branch, "the Project Manager's branch moved");
		assert.equal(fileAt(mac, "pm/branch", "squash.txt"), "landed by the Run, refined\n");
		assert.equal(
			execFileSync("git", ["-C", mac.remote, "rev-list", "--count", "pm/branch"], { encoding: "utf8" }).trim(),
			"2",
			"the Run's commits are one commit over the base",
		);
		assert.equal(subject(mac, "pm/branch"), "Bead fac-1, landed by Archon Run run-123");

		assert.equal(ref(mac, "main"), before.main, "main never moves");
		assert.equal(ref(mac, "develop"), before.develop, "develop never moves");
		assert.equal(ghCalls(mac), "", "no gh pull request command runs");
		assert.equal(landingNote(mac), "squashed onto pm/branch and pushed it\n");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a branch the Profile protects is refused before anything moves, and the refusal says why", () => {
	for (const base of ["main", "develop"]) {
		const mac = makeMac({ profile: squashProfile, repo: "myrepo", base: "pm/branch" });
		try {
			const before = { main: ref(mac, "main"), develop: ref(mac, "develop"), branch: ref(mac, "pm/branch") };

			const result = mac.land(["--base", base]);
			assert.notEqual(result.status, 0, `${base} is refused`);
			assert.match(result.stderr, new RegExp(`${base}`), "the refusal names the target");
			assert.match(result.stderr, /myrepo/, "the refusal names the repo");
			assert.match(result.stderr, /Profile/, "the refusal names where the protection is set");

			assert.deepEqual({ main: ref(mac, "main"), develop: ref(mac, "develop"), branch: ref(mac, "pm/branch") }, before, "no branch moves");
			assert.equal(ghCalls(mac), "", "no gh pull request command runs");
			assert.match(landingNote(mac), /^refused to land: .*myrepo/);
		} finally {
			rmSync(mac.dir, { recursive: true, force: true });
		}
	}
});

test("under the squash landing a repo the Profile does not name is refused, and the refusal says why", () => {
	const mac = makeMac({ profile: squashProfile, repo: "unlisted", base: "pm/branch" });
	try {
		const before = { main: ref(mac, "main"), branch: ref(mac, "pm/branch") };

		const result = mac.land();
		assert.notEqual(result.status, 0, "the repo is refused");
		assert.match(result.stderr, /unlisted/, "the refusal names the repo");
		assert.match(result.stderr, /PROTECTED_TARGETS/, "the refusal names the setting that has to name the repo");

		assert.deepEqual({ main: ref(mac, "main"), branch: ref(mac, "pm/branch") }, before, "no branch moves");
		assert.equal(ghCalls(mac), "", "no gh pull request command runs");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("under the squash landing a failing check is reported and the base branch is not pushed", () => {
	const mac = makeMac({ profile: squashProfile, repo: "myrepo", base: "pm/branch", check: 'echo "2 tests failed" >&2; exit 1' });
	try {
		const before = ref(mac, "pm/branch");

		const result = mac.land();
		assert.notEqual(result.status, 0, "a failing check stops the landing");
		assert.match(result.stderr, /2 tests failed/, "the check's output is shown");
		assert.match(result.stderr, /check failed/, "the refusal says the check failed");

		assert.equal(ref(mac, "pm/branch"), before, "the base branch does not move");
		assert.match(landingNote(mac), /^refused to land: the check failed/);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("under the pull-request landing a Run's work lands on main through a pull request, so the work rule cannot leak here", () => {
	const mac = makeMac({ profile: shippedProfile(), repo: "calc", base: "main" });
	try {
		const before = { main: ref(mac, "main"), develop: ref(mac, "develop") };

		const result = mac.land();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.match(ghCalls(mac), /^pr create --base main /m, "a pull request into main is opened");
		assert.match(ghCalls(mac), /^pr merge --squash https:\/\/github.com\/example\/calc\/pull\/7$/m, "it is squash-merged");
		assert.notEqual(ref(mac, "main"), before.main, "main moved: the merge landed the Run's work");
		assert.equal(fileAt(mac, "main", "squash.txt"), "landed by the Run, refined\n");
		assert.equal(ref(mac, "develop"), before.develop, "develop is untouched");
		assert.equal(landingNote(mac), "merged pull request https://github.com/example/calc/pull/7 into main\n");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("the pull-request landing holds the merge for a Human gate, then merges the one pull request it opened", () => {
	const mac = makeMac({ profile: shippedProfile(), repo: "calc", base: "main" });
	try {
		const before = ref(mac, "main");

		const held = mac.land(["--hold"]);
		assert.equal(held.status, 0, held.stderr || held.stdout);
		assert.equal(held.stdout.trim(), "the pull request https://github.com/example/calc/pull/7 into main", "the gate quotes what it holds");
		assert.equal(noteIn(mac, "held"), "the pull request https://github.com/example/calc/pull/7 into main\n");
		assert.match(ghCalls(mac), /^pr create --base main /m, "the pull request is opened");
		assert.doesNotMatch(ghCalls(mac), /^pr merge/m, "nothing merges before the gate is answered");
		assert.equal(ref(mac, "main"), before, "main has not moved");
		assert.equal(landingNote(mac), "opened the pull request https://github.com/example/calc/pull/7 into main, which the gate decides\n");

		const landed = mac.land();
		assert.equal(landed.status, 0, landed.stderr || landed.stdout);
		assert.equal(ghCalls(mac).match(/^pr create /gm)?.length, 1, "the pull request is opened once");
		assert.match(ghCalls(mac), /^pr merge --squash https:\/\/github.com\/example\/calc\/pull\/7$/m);
		assert.equal(fileAt(mac, "main", "squash.txt"), "landed by the Run, refined\n");
		assert.equal(landingNote(mac), "merged pull request https://github.com/example/calc/pull/7 into main\n");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("the squash landing holds for a Human gate, and no branch moves until the gate is answered", () => {
	const mac = makeMac({ profile: squashProfile, repo: "myrepo", base: "pm/branch" });
	try {
		const before = { main: ref(mac, "main"), develop: ref(mac, "develop"), branch: ref(mac, "pm/branch") };

		const held = mac.land(["--hold"]);
		assert.equal(held.status, 0, held.stderr || held.stdout);
		assert.equal(held.stdout.trim(), "the squash onto pm/branch, held for the gate", "the gate names what it holds");
		assert.equal(noteIn(mac, "held"), "the squash onto pm/branch, held for the gate\n");
		assert.deepEqual({ main: ref(mac, "main"), develop: ref(mac, "develop"), branch: ref(mac, "pm/branch") }, before, "no branch moves");
		assert.equal(ghCalls(mac), "", "no gh pull request command runs");
		assert.match(landingNote(mac), /holds it for the gate/);

		const landed = mac.land();
		assert.equal(landed.status, 0, landed.stderr || landed.stdout);
		assert.equal(fileAt(mac, "pm/branch", "squash.txt"), "landed by the Run, refined\n");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("under the squash landing a Run whose work is already on the base is refused with a reason, and nothing moves", () => {
	const mac = makeMac({ profile: squashProfile, repo: "myrepo", base: "pm/branch" });
	try {
		// The base already carries what the Run did, as a re-run after a landing would find it.
		const main = join(mac.dir, "myrepo");
		execFileSync("git", ["-C", main, "checkout", "-q", "pm/branch"]);
		writeFileSync(join(main, "squash.txt"), "landed by the Run, refined\n");
		execFileSync("git", ["-C", main, "add", "squash.txt"]);
		execFileSync("git", ["-C", main, "commit", "-qm", "Same work on the base"]);
		execFileSync("git", ["-C", main, "push", "-q", "origin", "pm/branch"]);
		const before = { main: ref(mac, "main"), develop: ref(mac, "develop"), branch: ref(mac, "pm/branch") };

		const result = mac.land();
		assert.notEqual(result.status, 0, "an empty squash is refused");
		assert.match(result.stderr, /add nothing to pm\/branch/, "the refusal says the work is already there");

		assert.deepEqual({ main: ref(mac, "main"), develop: ref(mac, "develop"), branch: ref(mac, "pm/branch") }, before, "no branch moves");
		assert.equal(ghCalls(mac), "", "no gh pull request command runs");
		assert.match(landingNote(mac), /^refused to land: .*add nothing/);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});
