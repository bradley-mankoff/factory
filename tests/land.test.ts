/**
 * bin/land is how a Run lands its commits, the way the Mac's Profile says (GLOSSARY.md,
 * `Profile`; fac-qpv.6.4). The seam is the command: a real git repo with the Run in a
 * worktree and origin a bare remote beside it, made-up files, a Profile file for the Mac, a
 * check command, and a stand-in `gh` at the GitHub edge that writes down how it was called;
 * a fork's upstream remote stands beside origin's address the way GitHub has it. An adopting
 * Run's Mac also has a stand-in Archon, which answers `workflow get` with the dispatch base
 * each Run in the chain recorded, the way Archon records it (fac-02k).
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
	home: string;
	run: string;
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
 * landing reached the base branch. `origin` and `upstream` give the remotes addresses the
 * way GitHub has them, https or ssh; pushes still reach the bare remote beside the repo,
 * through origin's push address, and `gh` is told origin's address, as it would be.
 */
const makeMac = (options: {
	profile: string;
	repo: string;
	base: string;
	check?: string;
	origin?: string;
	upstream?: string;
	// The stand-in gh sits in the person's own folder, ~/.local/bin, which the bare PATH
	// launchd gives leaves out; without it the stand-in sits beside the other stand-ins, where
	// PATH carries it (fac-a0h).
	ghInOwnFolder?: boolean;
	// The bare PATH launchd hands a job, which holds no Homebrew folder: what the archon-bar
	// process had when its Runs failed to land (fac-a0h).
	barePath?: boolean;
	// The base Archon resolved for this Run, when it is not the one the worktree was cut
	// from: an adopting Run gets the project's default, because --adopt refuses --base.
	baseBranch?: string;
	// An adopting Run: its artifacts folder and the base its own dispatch recorded, and, when
	// it continues a chain, the Run it adopted with that Run's base.
	adopted?: { run: string; base: string; adoptedFrom?: { run: string; base: string } };
}): Mac => {
	const dir = mkdtempSync(join(tmpdir(), "factory-land-"));
	const home = join(dir, "home");
	const bin = join(dir, "bin");
	const remote = join(dir, "remote.git");
	const main = join(dir, options.repo);
	const run = join(dir, `${options.repo}-run`);
	const artifacts = join(dir, "artifacts");
	const adoptedDir = options.adopted ? join(dir, "adopted", options.adopted.run) : undefined;
	const archonLog = join(dir, "archon.log");
	const ghLog = join(dir, "gh.log");
	const ghOpen = join(dir, "gh-open");
	const ghHead = join(dir, "gh-head");
	const ghFolder = options.ghInOwnFolder ? join(home, ".local", "bin") : bin;
	mkdirSync(join(home, ".config", "factory"), { recursive: true });
	writeFileSync(join(home, ".config", "factory", "profile"), options.profile);
	mkdirSync(bin, { recursive: true });
	mkdirSync(ghFolder, { recursive: true });
	mkdirSync(artifacts, { recursive: true });
	if (adoptedDir) mkdirSync(adoptedDir, { recursive: true });
	if (options.adopted) {
		// Archon's own record of a Run: its dispatch base and the Run it adopted. The command
		// that reads it is `archon workflow get <id> --json`, the interface the Factory has.
		const adopted = options.adopted;
		type RunRecord = { run: string; base: string; adoptedFrom: string | null };
		const records: RunRecord[] = [
			{ run: adopted.run, base: adopted.base, adoptedFrom: adopted.adoptedFrom?.run ?? null },
			...(adopted.adoptedFrom ? [{ run: adopted.adoptedFrom.run, base: adopted.adoptedFrom.base, adoptedFrom: null }] : []),
		];
		const runRecord = ({ run, base, adoptedFrom }: RunRecord) =>
			JSON.stringify({ id: run, adopted_from_run_id: adoptedFrom, metadata: { dispatch: { base_branch: base } } });
		const answers = records.map((record) => `${record.run}) printf '%s\\n' '${runRecord(record)}' ;;`).join("\n");
		writeFileSync(
			join(bin, "archon"),
			`#!/bin/sh
printf '%s\\n' "$*" >> "$ARCHON_LOG"
[ "$1 $2" = "workflow get" ] || exit 2
case $3 in
${answers}
*) echo "no workflow run $3" >&2; exit 1 ;;
esac
`,
			{ mode: 0o755 },
		);
	}

	// GitHub, at the edge: it records each command, opens a pull request with a made-up
	// address, answers `view` for the branch that pull request has and for the pull request's
	// own address, its head commit the head of that branch on the remote, as GitHub reports
	// it, and lands a merge by moving the base branch on the remote, as a squash merge would.
	// It answers the calls the way gh 2.96.0 does: `view` needs a selector when `--repo` names
	// the repo, and a second pull request for a head that already has one is refused.
	writeFileSync(
		join(ghFolder, "gh"),
		`#!/bin/sh
printf '%s\\n' "$*" >> "$GH_LOG"
command=$2
shift 2
repo= head= base= selector= field=
while [ $# -gt 0 ]; do
	case $1 in
	--repo) repo=$2 && shift ;;
	--head) head=$2 && shift ;;
	--base) base=$2 && shift ;;
	--json) field=$2 && shift ;;
	-q | --jq) shift ;;
	-*) ;;
	*) selector=$1 ;;
	esac
	shift
done
# The pull request's head: the head of its branch on the remote, where a push puts commits.
pr_head() {
	git -C "$REMOTE" rev-parse "refs/heads/$(cat "$GH_HEAD")"
}
case $command in
create)
	if [ -e "$GH_OPEN" ]; then
		printf 'a pull request for branch "%s" into branch "%s" already exists\\n' "$head" "$base" >&2
		exit 1
	fi
	[ -n "$repo" ] || repo=example/${options.repo}
	printf 'https://github.com/%s/pull/7\\n' "$repo" > "$GH_OPEN"
	printf '%s\\n' "$head" | sed 's/.*://' > "$GH_HEAD"
	cat "$GH_OPEN"
	;;
view)
	if [ -z "$selector" ]; then
		if [ -n "$repo" ]; then
			echo 'argument required when using the --repo flag' >&2
			exit 1
		fi
		selector=$(git rev-parse --abbrev-ref HEAD)
	fi
	if [ ! -e "$GH_OPEN" ]; then
		printf 'no pull requests found for branch "%s"\\n' "$selector" >&2
		exit 1
	fi
	if [ "$selector" != "$(cat "$GH_HEAD")" ] && [ "$selector" != "$(cat "$GH_OPEN")" ]; then
		printf 'no pull requests found for branch "%s"\\n' "$selector" >&2
		exit 1
	fi
	case $field in
	url) cat "$GH_OPEN" ;;
	headRefOid) pr_head ;;
	*)
		printf 'unknown field "%s"\\n' "$field" >&2
		exit 1
		;;
	esac
	;;
merge)
	if [ ! -e "$GH_OPEN" ]; then
		echo 'no pull requests found' >&2
		exit 1
	fi
	git -C "$REMOTE" update-ref "refs/heads/$BASE_BRANCH" "$(pr_head)"
	rm -f "$GH_OPEN" "$GH_HEAD"
	;;
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
	execFileSync("git", ["-C", main, "remote", "add", "origin", options.origin ?? remote]);
	if (options.origin) execFileSync("git", ["-C", main, "config", "remote.origin.pushurl", remote]);
	if (options.upstream) execFileSync("git", ["-C", main, "remote", "add", "upstream", options.upstream]);
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
		PATH: options.barePath ? "/usr/bin:/bin:/usr/sbin:/sbin" : `${bin}:${process.env.PATH}`,
		BASE_BRANCH: options.baseBranch ?? options.base,
		// The check the Run's worktree already ran, run again on what lands. It passes only on
		// the squashed commit: the Run made two commits there, the squash is one over the base.
		FACTORY_CHECK: options.check ?? 'test "$(git rev-list --count HEAD)" = 2',
		ARTIFACTS_DIR: artifacts,
		...(adoptedDir ? { ADOPTED_RUN_DIR: adoptedDir, ARCHON_LOG: archonLog } : {}),
		WORKFLOW_ID: "run-123",
		ARGUMENTS: "pm-repo · fac-1",
		GH_LOG: ghLog,
		GH_OPEN: ghOpen,
		GH_HEAD: ghHead,
		REMOTE: remote,
	};
	// A Run that adopts another names the earlier Run's artifacts folder in ADOPTED_RUN_DIR, and
	// a Run's shell carries the folder of the Run that started it. This Mac's Run is the one the
	// test shaped, which adopts nothing unless it says so (fac-02k).
	if (!adoptedDir) delete env.ADOPTED_RUN_DIR;
	const land = (args: string[] = []) => spawnSync(join(root, "bin", "land"), args, { cwd: run, encoding: "utf8", env });

	return { dir, home, run, remote, artifacts, ghLog, land };
};

/**
 * A fork's Mac: origin and an upstream remote both on GitHub, the way a project cloned from
 * a stranger's repo and pushed to the person's own has them. The landing runs on it, and a
 * test reads back how gh was called.
 */
const forkMac = (remotes: { origin: string; upstream: string }): Mac =>
	makeMac({ profile: shippedProfile(), repo: "habit_breaker", base: "main", ...remotes });

/** A branch's commit on the remote, as git sees it there. */
const ref = (mac: Mac, branch: string): string =>
	execFileSync("git", ["-C", mac.remote, "rev-parse", `refs/heads/${branch}`], { encoding: "utf8" }).trim();

/** A file's content at a branch on the remote. */
const fileAt = (mac: Mac, branch: string, path: string): string =>
	execFileSync("git", ["-C", mac.remote, "show", `${branch}:${path}`], { encoding: "utf8" });

/** The subject of a branch's tip commit on the remote. */
const subject = (mac: Mac, branch: string): string =>
	execFileSync("git", ["-C", mac.remote, "log", "-1", "--format=%s", branch], { encoding: "utf8" }).trim();

/**
 * The Run commits again in its worktree, as a Run adopting a withheld pull request does on the
 * branch that pull request already has, and gives back the head it made.
 */
const commitInRun = (mac: Mac, content: string): string => {
	writeFileSync(join(mac.run, "squash.txt"), content);
	execFileSync("git", ["-C", mac.run, "commit", "-qam", "Refine squash.txt again"]);
	return execFileSync("git", ["-C", mac.run, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
};

/** How the stand-in `gh` was called, one line per call. */
const ghCalls = (mac: Mac): string => (existsSync(mac.ghLog) ? readFileSync(mac.ghLog, "utf8") : "");

/** Each gh call the stand-in recorded, its arguments split apart. */
const ghArguments = (mac: Mac): string[][] =>
	ghCalls(mac)
		.split("\n")
		.filter((call) => call !== "")
		.map((call) => call.split(" "));

/** The value one recorded gh call gave a flag, or undefined when it gave none. */
const flagValue = (call: string[], flag: string): string | undefined => {
	const at = call.indexOf(flag);
	return at < 0 ? undefined : call[at + 1];
};

/** Every gh call the stand-in recorded named the repo behind origin, so none was left to gh's own default repo. */
const assertEveryGhCallNamesRepo = (mac: Mac, repo: string): void => {
	const calls = ghArguments(mac);
	assert.ok(calls.length > 0, "gh was asked about a pull request");
	for (const call of calls) {
		assert.equal(flagValue(call, "--repo"), repo, `gh ${call.join(" ")} names the repo behind origin`);
	}
};

/** The pull request the stand-in opened names the Run's branch under origin's owner, never a bare branch gh could resolve on upstream. */
const assertPullRequestHead = (mac: Mac, head: string): void => {
	const created = ghArguments(mac).find((call) => call[1] === "create") ?? [];
	assert.equal(flagValue(created, "--head"), head, "the pull request names the Run's branch on origin's owner");
};

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

test("a Run whose shell has launchd's bare PATH still lands its pull request, finding gh in the person's own folder", () => {
	const mac = makeMac({ profile: shippedProfile(), repo: "calc", base: "main", ghInOwnFolder: true, barePath: true });
	try {
		const before = ref(mac, "main");

		const result = mac.land();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.match(ghCalls(mac), /^pr create --base main /m, "the gh the bare PATH leaves out opened the pull request");
		assert.notEqual(ref(mac, "main"), before, "main moved: the merge landed the Run's work");
		assert.equal(fileAt(mac, "main", "squash.txt"), "landed by the Run, refined\n");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a Run that already finds gh on its PATH lands with that gh, not one in the person's own folder", () => {
	const mac = makeMac({ profile: shippedProfile(), repo: "calc", base: "main" });
	try {
		// A second gh in the person's own folder fails loudly, so a landing that reached it fails.
		mkdirSync(join(mac.home, ".local", "bin"), { recursive: true });
		writeFileSync(
			join(mac.home, ".local", "bin", "gh"),
			"#!/bin/sh\necho \"the gh in the person's own folder ran\" >&2\nexit 1\n",
			{ mode: 0o755 },
		);

		const result = mac.land();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.match(ghCalls(mac), /^pr create --base main /m, "the gh on PATH opened the pull request");
		assert.doesNotMatch(result.stderr, /the gh in the person's own folder ran/, "the gh in the person's own folder was left alone");
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

test("a fork whose origin is an https address lands its pull request on origin's repo, naming it on every gh call", () => {
	const mac = forkMac({
		origin: "https://github.com/bradley-mankoff/habit_breaker.git",
		upstream: "https://github.com/Szalikko/NailGuard.git",
	});
	try {
		const result = mac.land();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assertEveryGhCallNamesRepo(mac, "bradley-mankoff/habit_breaker");
		assertPullRequestHead(mac, "bradley-mankoff:run-1");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a fork whose origin is an ssh address lands its pull request on origin's repo, naming it on every gh call", () => {
	const mac = forkMac({
		origin: "git@github.com:bradley-mankoff/habit_breaker.git",
		upstream: "git@github.com:Szalikko/NailGuard.git",
	});
	try {
		const result = mac.land();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assertEveryGhCallNamesRepo(mac, "bradley-mankoff/habit_breaker");
		assertPullRequestHead(mac, "bradley-mankoff:run-1");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a fork's gated landing finds the pull request it held and merges that one, instead of opening a second", () => {
	const mac = forkMac({
		origin: "https://github.com/bradley-mankoff/habit_breaker.git",
		upstream: "https://github.com/Szalikko/NailGuard.git",
	});
	try {
		const before = ref(mac, "main");

		const held = mac.land(["--hold"]);
		assert.equal(held.status, 0, held.stderr || held.stdout);
		assert.equal(ghCalls(mac).match(/^pr create /gm)?.length, 1, "the gate holds one pull request");
		assert.equal(ref(mac, "main"), before, "main has not moved");

		const landed = mac.land();
		assert.equal(landed.status, 0, landed.stderr || landed.stdout);
		assert.equal(ghCalls(mac).match(/^pr create /gm)?.length, 1, "the gate's pull request is the one that merges");
		assert.notEqual(ref(mac, "main"), before, "the merge landed the Run's work");
		assert.equal(fileAt(mac, "main", "squash.txt"), "landed by the Run, refined\n");
		assert.equal(
			landingNote(mac),
			"merged pull request https://github.com/bradley-mankoff/habit_breaker/pull/7 into main\n",
		);
		assertEveryGhCallNamesRepo(mac, "bradley-mankoff/habit_breaker");
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

test("under the pull-request landing an adopting Run's new commits reach the pull request the gate already holds", () => {
	const mac = makeMac({ profile: shippedProfile(), repo: "calc", base: "main" });
	try {
		const held = mac.land(["--hold"]);
		assert.equal(held.status, 0, held.stderr || held.stdout);
		const rejectedHead = ref(mac, "run-1");
		const before = ref(mac, "main");

		// The adopting Run works on the branch its earlier, withheld Run already pushed, and its
		// commits are the pass the gate has to decide this time.
		const adoptedHead = commitInRun(mac, "landed by the adopting Run\n");
		assert.notEqual(adoptedHead, rejectedHead, "the adopting Run made its own commits");

		const again = mac.land(["--hold"]);
		assert.equal(again.status, 0, again.stderr || again.stdout);

		assert.equal(ghCalls(mac).match(/^pr create /gm)?.length, 1, "the gate still holds one pull request");
		assert.equal(ref(mac, "run-1"), adoptedHead, "the pull request's branch reaches the adopting Run's head");
		assert.equal(fileAt(mac, "run-1", "squash.txt"), "landed by the adopting Run\n", "the held pull request shows the adopting Run's work");
		assert.equal(ref(mac, "main"), before, "the gate still has not moved main");

		// With the gate answered, the merge lands that same pass, not the rejected one.
		const landed = mac.land();
		assert.equal(landed.status, 0, landed.stderr || landed.stdout);
		assert.equal(fileAt(mac, "main", "squash.txt"), "landed by the adopting Run\n", "main gets the adopting Run's pass");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("an adopting Run lands on the base its chain chose, not the project's default branch", () => {
	// Archon refuses --base on an adopting Run, so it records the project's default (main
	// here) for that Run's own dispatch; the Run it adopts, and the Run the chain started
	// from, still name the Project Manager's branch. The landing must reach that branch
	// (fac-02k).
	const mac = makeMac({
		profile: squashProfile,
		repo: "myrepo",
		base: "pm/branch",
		baseBranch: "main",
		adopted: { run: "adopting-run", base: "main", adoptedFrom: { run: "origin-run", base: "pm/branch" } },
	});
	try {
		const before = { main: ref(mac, "main"), develop: ref(mac, "develop"), branch: ref(mac, "pm/branch") };

		const result = mac.land();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(fileAt(mac, "pm/branch", "squash.txt"), "landed by the Run, refined\n", "the Run's work reached the branch its chain chose");
		assert.equal(ref(mac, "main"), before.main, "main never moves");
		assert.equal(ref(mac, "develop"), before.develop, "develop never moves");
		assert.equal(landingNote(mac), "squashed onto pm/branch and pushed it\n");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("an adopting Run whose chain names no base is refused, naming the adopted Run, instead of landing on the default branch", () => {
	// The Profile protects no branch, so a landing on the default branch would go through;
	// the refusal has to come from the missing base itself, not the Profile.
	const profile = ["LANDING=squash", 'PROTECTED_TARGETS="myrepo"', "ARCHON_HOME=$HOME/factory-local/.archon"].join("\n") + "\n";
	const mac = makeMac({
		profile,
		repo: "myrepo",
		base: "pm/branch",
		baseBranch: "main",
		adopted: { run: "adopting-run", base: "" },
	});
	try {
		const before = { main: ref(mac, "main"), branch: ref(mac, "pm/branch") };

		const result = mac.land();
		assert.notEqual(result.status, 0, "the landing is refused");
		assert.match(result.stderr, /adopting-run/, "the refusal names the Run it adopted");

		assert.deepEqual({ main: ref(mac, "main"), branch: ref(mac, "pm/branch") }, before, "no branch moves");
		assert.match(landingNote(mac), /^refused to land: .*adopting-run/);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("under the pull-request landing a pull request whose head is not the worktree's HEAD is refused at merge, and nothing merges", () => {
	const mac = makeMac({ profile: shippedProfile(), repo: "calc", base: "main" });
	try {
		const held = mac.land(["--hold"]);
		assert.equal(held.status, 0, held.stderr || held.stdout);
		const gateHead = ref(mac, "run-1");
		const before = ref(mac, "main");

		// The adopting Run's commits do not reach the branch the pull request tracks, the way
		// the bug's Run found the branch's remote gone while the pull request stayed at the
		// rejected pass: origin's push goes to another remote.
		commitInRun(mac, "a pass the pull request never got\n");
		const elsewhere = join(mac.dir, "elsewhere.git");
		execFileSync("git", ["init", "-q", "--bare", elsewhere]);
		execFileSync("git", ["-C", mac.run, "config", "remote.origin.pushurl", elsewhere]);

		const result = mac.land();
		assert.notEqual(result.status, 0, "the merge is refused");
		assert.match(result.stderr, /not the worktree's HEAD/, "the refusal says the pull request's head differs from the worktree's");

		assert.equal(ref(mac, "main"), before, "main does not move");
		assert.equal(ref(mac, "run-1"), gateHead, "the pull request stays at the head the gate saw");
		assert.doesNotMatch(ghCalls(mac), /^pr merge/m, "nothing merges");
		assert.match(landingNote(mac), /^refused to land: .*not the worktree's HEAD/);
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
