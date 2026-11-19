/**
 * factory-build-gated's Notice before its Human gate (GLOSSARY.md, `Notice`): the message
 * the Project Manager reads to know a Run waits on the Human, and the one that carries the
 * demo video the Human judges from (fac-3mz.7). The seam is the Workflow's own `ask-human`
 * node: the test reads the shell Archon runs from the Workflow file and runs it for a Run,
 * with a temporary home whose notices folder receives the Notice through the real
 * bin/tell-pm, and the Factory's helpers linked where the node finds them. Nothing here
 * looks inside the node beyond the shell the Workflow gives it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = join(root, "workflows", "factory", "factory-build-gated", "factory-build-gated.yaml");

/**
 * The shell Archon runs for one `bash: |` node of the Workflow, dedented from its YAML:
 * the block starts on the line after the node's `bash: |` and ends at the next line the
 * Workflow writes at its own level.
 */
const nodeBash = (id: string): string => {
	const lines = readFileSync(workflow, "utf8").split("\n");
	const start = lines.findIndex((line) => line.trim() === `- id: ${id}`);
	assert.ok(start >= 0, `${id} is a node of the Workflow`);
	const block = lines.indexOf("    bash: |", start);
	assert.ok(block > start, `${id} runs a bash block`);
	const body: string[] = [];
	for (const line of lines.slice(block + 1)) {
		if (!line.startsWith("      ")) break;
		body.push(line.slice(6));
	}
	return body.join("\n");
};

type Run = {
	/** The folder holding everything the run made, so the test can remove it. */
	dir: string;
	/** The status the node exited with. */
	status: number | null;
	/** The Notice the node left, as the Project Manager reads it. */
	notice: () => string;
	/** Whether the node sent the Project Manager a Notice at all. */
	sentNotice: () => boolean;
	/** What the node left in its artifacts folder, or nothing when it left no such note. */
	note: (name: string) => string | undefined;
};

/**
 * One Run reaching its gate: a temporary home with the Factory's helpers where the node
 * looks for them, the Run's artifacts naming what the landing holds, and, unless `video`
 * says otherwise, the video in the Factory's demo folder. `profile` is the Mac's Profile as
 * the node reads it.
 */
const makeRun = (profile: string, video = true): Run => {
	const dir = mkdtempSync(join(tmpdir(), "factory-gated-notice-"));
	const home = join(dir, "home");
	const factory = join(home, ".local", "share", "factory");
	const demos = join(factory, "demos");
	const artifacts = join(dir, "artifacts");
	mkdirSync(join(home, ".config", "factory"), { recursive: true });
	mkdirSync(demos, { recursive: true });
	mkdirSync(artifacts, { recursive: true });
	symlinkSync(join(root, "bin"), join(factory, "bin"));
	writeFileSync(join(home, ".config", "factory", "profile"), profile);
	writeFileSync(join(artifacts, "held"), "the pull request https://github.com/example/calc/pull/7 into main\n");
	if (video) writeFileSync(join(demos, "run-123.mp4"), "the video");

	const env = {
		...process.env,
		HOME: home,
		ARTIFACTS_DIR: artifacts,
		WORKFLOW_ID: "run-123",
		ARGUMENTS: "pm-calc · fac-1",
		FACTORY_DEMOS: demos,
	};
	// A DEMOS_URL the test's own shell inherited must not reach the node.
	delete env.DEMOS_URL;
	const result = spawnSync("bash", ["-c", nodeBash("ask-human")], { cwd: dir, encoding: "utf8", env });
	if (video) assert.equal(result.status, 0, result.stderr);
	const noticeFile = join(factory, "notices", "pm-calc.md");
	return {
		dir,
		status: result.status,
		notice: () => readFileSync(noticeFile, "utf8"),
		sentNotice: () => existsSync(noticeFile),
		note: (name) => (existsSync(join(artifacts, name)) ? readFileSync(join(artifacts, name), "utf8") : undefined),
	};
};

test("the Notice before the gate names the video's private link when the Mac names DEMOS_URL", () => {
	const run = makeRun("DEMOS_URL=https://mac.example-tailnet.ts.net/demos\n");
	try {
		assert.match(run.notice(), /https:\/\/mac\.example-tailnet\.ts\.net\/demos\/run-123\.mp4/);
	} finally {
		rmSync(run.dir, { recursive: true, force: true });
	}
});

test("a Profile that names no DEMOS_URL leaves the Notice naming the video's path for FactoryClaw", () => {
	const run = makeRun("# This Mac names no DEMOS_URL.\n");
	try {
		const notice = run.notice();
		assert.match(notice, /with the demo video .*\/demos\/run-123\.mp4/);
		assert.doesNotMatch(notice, /https?:\/\/\S*\/demos\/run-123\.mp4/, "no link to the video is named");
	} finally {
		rmSync(run.dir, { recursive: true, force: true });
	}
});

test("a gate whose demo left no video ends the Run with a demo-failed note, instead of asking the Human", () => {
	const run = makeRun("# This Mac names no DEMOS_URL.\n", false);
	try {
		assert.notEqual(run.status, 0, "the gate did not open");
		assert.equal(run.note("demo-failed"), "the demo node failed to record a video\n", "the Run leaves the note bin/finish reads");
		assert.equal(run.sentNotice(), false, "the Project Manager was not asked to take the gate to the Human");
	} finally {
		rmSync(run.dir, { recursive: true, force: true });
	}
});
