/**
 * bin/finish is how a Run's last node reports how the Run ended (GLOSSARY.md, `Notice`).
 * It reads the notes the Run leaves in its artifacts folder — bin/land's `landing` and
 * `held`, pi-flows' `flows-failed.txt`, a task's `no-commits` and research's `findings.md`
 * — composes the one Notice line and leaves it with bin/tell-pm. The seam is the command:
 * a temporary home that receives the Notice file, a temporary artifacts folder holding the
 * notes, and the environment a Run gives its last node. Nothing here looks inside bin/finish.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const finish = join(repoRoot, "bin", "finish");

type Harness = {
	artifacts: string;
	note: (name: string, text?: string) => void;
	run: (workflow: string, extraEnv?: Record<string, string>) => { status: number | null; stdout: string; stderr: string };
	notice: (pane: string) => string;
};

/** A temporary Mac: a home whose notices folder bin/tell-pm writes, and a Run's artifacts. */
function makeHarness(): Harness {
	const dir = mkdtempSync(join(tmpdir(), "factory-finish-"));
	const home = join(dir, "home");
	const artifacts = join(dir, "artifacts");
	mkdirSync(home, { recursive: true });
	mkdirSync(artifacts, { recursive: true });
	const noticesDir = join(home, ".local", "share", "factory", "notices");

	const note = (name: string, text = "") => writeFileSync(join(artifacts, name), text);
	const run = (workflow: string, extraEnv: Record<string, string> = {}) =>
		spawnSync(finish, [workflow], {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				HOME: home,
				ARTIFACTS_DIR: artifacts,
				WORKFLOW_ID: "run-123",
				ARGUMENTS: "pm-factory · fac-1",
				...extraEnv,
			},
		});
	const notice = (pane: string) => readFileSync(join(noticesDir, `${pane}.md`), "utf8");

	return { artifacts, note, run, notice };
}

/** The one Notice line a Run left, without the date bin/tell-pm adds. */
function noticeText(h: Harness, pane = "pm-factory"): string {
	const lines = h.notice(pane).split("\n").filter(Boolean);
	assert.equal(lines.length, 1, "a Run leaves one Notice line");
	return lines[0].replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} /, "");
}

test("a landed build Run's Notice names the Run, the Workflow, the Bead and the landing", () => {
	const h = makeHarness();
	h.note("landing", "merged pull request https://github.com/example/factory/pull/7 into main\n");

	const result = h.run("factory-build");

	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		noticeText(h),
		"Run run-123 (factory-build) for Bead fac-1 merged pull request https://github.com/example/factory/pull/7 into main.",
	);
	assert.match(result.stdout, /merged pull request https:\/\/github\.com\/example\/factory\/pull\/7 into main/);
});

test("a held landing in the gated Workflow's Notice names what the gate decides", () => {
	// bin/land --hold leaves `held` for the gate's question and a `landing` saying it holds
	// the Run there; the Notice names that landing, as the gated Workflow's last node did.
	const h = makeHarness();
	h.note("held", "the pull request https://github.com/example/factory/pull/7 into main\n");
	h.note("landing", "opened the pull request https://github.com/example/factory/pull/7 into main, which the gate decides\n");

	const result = h.run("factory-build-gated");

	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		noticeText(h),
		"Run run-123 (factory-build-gated) for Bead fac-1 opened the pull request https://github.com/example/factory/pull/7 into main, which the gate decides.",
	);

	// When only the hold's own note is there, the Notice names what the gate held rather
	// than claiming a node failed without saying what is waiting.
	const heldOnly = makeHarness();
	heldOnly.note("held", "the pull request https://github.com/example/factory/pull/7 into main\n");
	const heldOnlyResult = heldOnly.run("factory-build-gated");
	assert.equal(heldOnlyResult.status, 0, heldOnlyResult.stderr);
	assert.equal(
		noticeText(heldOnly),
		"Run run-123 (factory-build-gated) for Bead fac-1 held the pull request https://github.com/example/factory/pull/7 into main and did not land it; archon workflow get run-123 names the node that failed or the gate's answer.",
	);
});

test("a task that changed nothing says its answer is the task node's output", () => {
	const h = makeHarness();
	// The task Workflow's checks node leaves this marker instead of running the check when
	// the Run made no commits, and its land node skips, so no landing note follows.
	h.note("no-commits", "");

	const result = h.run("factory-task");

	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		noticeText(h),
		"Run run-123 (factory-task) for Bead fac-1 finished without changing files; its answer is the task node's output in archon workflow get run-123.",
	);
});

test("a build whose work finished with failed checks ends without a landing, and the failures are in the Run's log", () => {
	// pi-flows leaves the checks the work node finished with still failing. bin/work-finished
	// comments them on the Bead and fails, so nothing lands; the Notice keeps the Workflows'
	// sentence for a Run with no landing and the failures stay beside it in the Run's log.
	const h = makeHarness();
	const failures = [
		"work: changed-files: the work changed no files; an empty commit does not count.",
		"work: closing-account: the final message has no closing account; end it with \"Acceptance criteria:\".",
	].join("\n");
	h.note("flows-failed.txt", `${failures}\n`);

	const result = h.run("factory-build");

	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		noticeText(h),
		"Run run-123 (factory-build) for Bead fac-1 ended without a landing; archon workflow get run-123 names the node that failed.",
	);
	assert.match(result.stdout, /changed-files: the work changed no files/);
});

test("a Run that left no notes ended without a landing, and the gated Workflow also names the gate's answer", () => {
	const build = makeHarness();
	const buildResult = build.run("factory-build");
	assert.equal(buildResult.status, 0, buildResult.stderr);
	assert.equal(
		noticeText(build),
		"Run run-123 (factory-build) for Bead fac-1 ended without a landing; archon workflow get run-123 names the node that failed.",
	);

	// The gated Workflow's own Run can also end on the gate's answer, so its sentence says so.
	const gated = makeHarness();
	const gatedResult = gated.run("factory-build-gated");
	assert.equal(gatedResult.status, 0, gatedResult.stderr);
	assert.equal(
		noticeText(gated),
		"Run run-123 (factory-build-gated) for Bead fac-1 ended without a landing; archon workflow get run-123 names the node that failed or the gate's answer.",
	);
});

test("a research Run's Notice names the findings file its answer opens", () => {
	// A research Run has no Bead and does not land: its combine node writes the answer to
	// findings.md, and the Notice opens with "Research Run" instead of the build shape.
	const h = makeHarness();
	h.note("findings.md", "# The answer\n\nYes, and here is why.\n");

	const result = h.run("factory-research");

	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		noticeText(h),
		`Research Run run-123 answered; the answer opens ${join(h.artifacts, "findings.md")}`,
	);
});

test("a research Run with no findings ends without them", () => {
	const h = makeHarness();
	h.note("flows-failed.txt", "combine: file-exists: findings.md is not there.\n");

	const result = h.run("factory-research");

	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		noticeText(h),
		"Research Run run-123 ended without findings; archon workflow get run-123 names the node that failed",
	);
});
