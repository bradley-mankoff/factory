/**
 * bin/work-finished is the node a build Workflow runs after its work node: it reads the
 * failed checks the Flows extension left in the Run's artifacts, comments them on the Bead
 * and exits 1, so the reviews do not run (GLOSSARY.md, `Flow`; fac-qpv.3.3). These tests
 * run it on its own against a temporary artifacts folder, with a stand-in for the Beads
 * CLI at the edge, where `bd comments add` goes.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workFinished = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "work-finished");

type Workspace = { dir: string; artifacts: string; log: string };

/** A temporary Run artifacts folder, and a stand-in `bd` that records what it is asked. */
const makeWorkspace = (): Workspace => {
	const dir = mkdtempSync(join(tmpdir(), "factory-work-finished-"));
	const artifacts = join(dir, "artifacts");
	const bin = join(dir, "bin");
	const log = join(dir, "bd-log");
	mkdirSync(artifacts, { recursive: true });
	mkdirSync(bin, { recursive: true });
	writeFileSync(join(bin, "bd"), '#!/bin/sh\nprintf \'%s\\0\' "$@" > "$BD_LOG"\n', { mode: 0o755 });
	return { dir, artifacts, log };
};

const run = (workspace: Workspace, bead: string): { status: number | null; stdout: string; stderr: string } => {
	const result = spawnSync(workFinished, [bead], {
		cwd: workspace.dir,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${join(workspace.dir, "bin")}:${process.env.PATH ?? ""}`,
			ARTIFACTS_DIR: workspace.artifacts,
			WORKFLOW_ID: "run-123",
			BD_LOG: workspace.log,
		},
	});
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** What the stand-in `bd` was called with, one entry per argument. */
const beadCall = (workspace: Workspace): string[] =>
	existsSync(workspace.log) ? readFileSync(workspace.log, "utf8").split("\0").slice(0, -1) : [];

test("failed checks are commented on the Bead and the node fails, so the reviews do not run", () => {
	const workspace = makeWorkspace();
	try {
		const failures = [
			"work: changed-files: the work changed no files; an empty commit does not count.",
			"work: closing-account: the final message has no closing account; end it with \"Acceptance criteria:\" and one line per criterion, \"- met: <criterion> — <evidence>\" or \"- unmet: <criterion> — <what is missing>\".",
		].join("\n");
		writeFileSync(join(workspace.artifacts, "flows-failed.txt"), `${failures}\n`);

		const result = run(workspace, "fac-qpv.3.3");
		assert.equal(result.status, 1, result.stderr);
		assert.deepEqual(beadCall(workspace), [
			"comments",
			"add",
			"fac-qpv.3.3",
			`Work finished with failed checks in Run run-123; the reviews did not run, and the commits stay on its branch:\n${failures}`,
		]);
		assert.match(result.stdout, /changed-files: the work changed no files/);
	} finally {
		rmSync(workspace.dir, { recursive: true, force: true });
	}
});

test("no failed checks in the artifacts folder lets the node pass without touching the Bead", () => {
	const workspace = makeWorkspace();
	try {
		const missing = run(workspace, "fac-qpv.3.3");
		assert.equal(missing.status, 0, missing.stderr);
		assert.deepEqual(beadCall(workspace), []);

		writeFileSync(join(workspace.artifacts, "flows-failed.txt"), "");
		const empty = run(workspace, "fac-qpv.3.3");
		assert.equal(empty.status, 0, empty.stderr);
		assert.deepEqual(beadCall(workspace), []);
	} finally {
		rmSync(workspace.dir, { recursive: true, force: true });
	}
});
