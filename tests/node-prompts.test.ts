/**
 * bin/node-prompts puts a Flows marker in each checked node's prompt (fac-qpv.3.1). The
 * marker is the line the pi-flows package reads when an agent tries to finish (fac-qpv.8.1).
 * The seam is the script's output for a Workflow folder; nothing here looks inside it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The prompt key of a node, which spells the node's dashes as underscores. */
const markerKey = (node: string) => `marker_${node.replace(/-/g, "_")}`;

/** A marker read back out of the script's output. */
const marker = (prompts: Record<string, string>, node: string) =>
	JSON.parse(prompts[markerKey(node)].slice("FLOWS ".length)) as Record<string, string>;

test("bin/node-prompts puts a marker naming the node, Bead, folders and check in each checked node's prompt", () => {
	const dir = mkdtempSync(join(tmpdir(), "factory-node-prompts-"));
	try {
		const workflow = join(dir, "workflows", "factory", "build");
		const flows = join(workflow, "flows");
		const artifacts = join(dir, "artifacts");
		mkdirSync(flows, { recursive: true });
		mkdirSync(artifacts, { recursive: true });
		writeFileSync(join(workflow, "build.yaml"), "nodes:\n  - id: work\n  - id: spec\n");
		writeFileSync(join(flows, "work"), "changed-files\n");
		writeFileSync(join(flows, "spec"), "check-passes\n");
		const result = spawnSync(join(root, "bin", "node-prompts"), [workflow], {
			encoding: "utf8",
			env: {
				...process.env,
				ARGUMENTS: "pm-factory · fac-qpv.3.1",
				ARTIFACTS_DIR: artifacts,
				FACTORY_CHECK: "python3 -m unittest",
			},
		});
		assert.equal(result.status, 0, result.stderr);
		const prompts = JSON.parse(result.stdout) as Record<string, string>;
		assert.deepEqual(
			{
				marker_work: marker(prompts, "work"),
				marker_spec: marker(prompts, "spec"),
			},
			{
				marker_work: {
					node: "work",
					bead: "fac-qpv.3.1",
					flows: realpathSync(flows),
					artifacts,
					check: "python3 -m unittest",
				},
				marker_spec: {
					node: "spec",
					bead: "fac-qpv.3.1",
					flows: realpathSync(flows),
					artifacts,
					check: "python3 -m unittest",
				},
			},
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

/** A temporary Workflow folder: its YAML, its flows files, and nothing else. */
const makeWorkflow = (yaml: string, flowsFiles: Record<string, string>) => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "factory-node-prompts-")));
	const workflow = join(dir, "workflows", "factory", "build");
	const flows = join(workflow, "flows");
	mkdirSync(flows, { recursive: true });
	writeFileSync(join(workflow, "build.yaml"), yaml);
	for (const [name, checks] of Object.entries(flowsFiles)) writeFileSync(join(flows, name), checks);
	return { dir, workflow };
};

const runNodePrompts = (workflow: string) =>
	spawnSync(join(root, "bin", "node-prompts"), [workflow], {
		encoding: "utf8",
		env: { ...process.env, ARTIFACTS_DIR: join(workflow, "artifacts") },
	});

test("bin/node-prompts fails, naming the flows file, when a flows file names no node", () => {
	const folder = makeWorkflow("nodes:\n  - id: look-a\n", { looks: "changed-files\n" });
	try {
		const result = runNodePrompts(folder.workflow);
		assert.notEqual(result.status, 0, "the prompts node fails rather than let the node run with no checks");
		assert.match(result.stderr, /flows\/looks names no node/);
	} finally {
		rmSync(folder.dir, { recursive: true, force: true });
	}
});

test("bin/node-prompts fails, naming the Workflow file, when a prompt asks for a marker no flows file produces", () => {
	const folder = makeWorkflow("nodes:\n  - id: work\n    prompt: |\n      $prompts.output.marker_works\n", {
		work: "changed-files\n",
	});
	try {
		const result = runNodePrompts(folder.workflow);
		assert.notEqual(result.status, 0, "the prompts node fails rather than leave the prompt's marker empty");
		assert.match(result.stderr, /build\.yaml asks for \$prompts\.output\.marker_works/);
	} finally {
		rmSync(folder.dir, { recursive: true, force: true });
	}
});

test("bin/node-prompts fails when a prompt names its marker with a dash", () => {
	const folder = makeWorkflow("nodes:\n  - id: work\n  - id: look-a\n    prompt: |\n      $prompts.output.marker_look-a\n", {
		work: "changed-files\n",
		"look-a": "changed-files\n",
	});
	try {
		const result = runNodePrompts(folder.workflow);
		assert.notEqual(result.status, 0, "a dash-spelled marker key does not exist, so the prompts node fails");
		assert.match(result.stderr, /marker_look-a/);
	} finally {
		rmSync(folder.dir, { recursive: true, force: true });
	}
});

test("bin/node-prompts matches a flows file to a node spelled with an underscore", () => {
	const folder = makeWorkflow("nodes:\n  - id: look-a\n    prompt: |\n      $prompts.output.marker_look_a\n", {
		look_a: "changed-files\n",
	});
	try {
		const result = runNodePrompts(folder.workflow);
		assert.equal(result.status, 0, result.stderr);
		const prompts = JSON.parse(result.stdout) as Record<string, string>;
		assert.equal((marker(prompts, "look-a") as { node: string }).node, "look_a");
	} finally {
		rmSync(folder.dir, { recursive: true, force: true });
	}
});

test("every core Workflow's marker names the node Archon runs", () => {
	// The checked nodes of each core Workflow, as its YAML declares them (fac-wtw).
	const checkedNodes: Record<string, string[]> = {
		"factory-build": ["work"],
		"factory-build-gated": ["work"],
		"factory-research": ["combine", "look-a", "look-b"],
		"factory-task": ["task"],
	};
	for (const [name, nodes] of Object.entries(checkedNodes)) {
		const result = runNodePrompts(join(root, "workflows", "factory", name));
		assert.equal(result.status, 0, `${name}: ${result.stderr}`);
		const prompts = JSON.parse(result.stdout) as Record<string, string>;
		const markers = Object.keys(prompts).filter((key) => key.startsWith("marker_"));
		assert.deepEqual(markers.sort(), nodes.map(markerKey).sort(), `${name}'s markers`);
		for (const node of nodes) {
			assert.equal(marker(prompts, node).node, node, `${name}'s marker names the node Archon runs`);
		}
	}
});
