/**
 * bin/node-prompts puts a Flows marker in each checked node's prompt (fac-qpv.3.1). The
 * marker is the line the pi-flows package reads when an agent tries to finish (fac-qpv.8.1).
 * The seam is the script's output for a Workflow folder; nothing here looks inside it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

/** A build Workflow's prompts as its Run's prompts node prints them, adopted or not. */
const corePrompts = (name: string, adoptedRunDir?: string): Record<string, string> => {
	const env: NodeJS.ProcessEnv = { ...process.env };
	// The test's own Run may itself be adopting one: ask for the prompts this test means.
	delete env.ADOPTED_RUN_DIR;
	if (adoptedRunDir !== undefined) env.ADOPTED_RUN_DIR = adoptedRunDir;
	const result = spawnSync(join(root, "bin", "node-prompts"), [join(root, "workflows", "factory", name)], { encoding: "utf8", env });
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as Record<string, string>;
};

test("an adopting build Run's work prompt says it is a second pass and sends the agent to the withholding review on the Bead", () => {
	for (const name of ["factory-build", "factory-build-gated"]) {
		// A prompt wraps its lines, so the paragraph is read as one line of text.
		const work = corePrompts(name, "/tmp/an-adopted-runs-artifacts").work.replace(/\s+/g, " ");
		assert.match(work, /This is a second pass/, `${name}'s work prompt names the pass`);
		assert.match(work, /a review withheld approval of it/, `${name}'s work prompt names the withholding review`);
		assert.match(work, /read that review in the comments on the Bead below/, `${name}'s work prompt sends the agent to the review first`);
		assert.match(work, /Do not redo work that already stands/, `${name}'s work prompt keeps the work that stands`);
	}
});

test("an adopting build Run's work prompt sends a finding it judges wrong to a Bead comment and the final message, not a commit message", () => {
	for (const name of ["factory-build", "factory-build-gated"]) {
		const work = corePrompts(name, "/tmp/an-adopted-runs-artifacts").work.replace(/\s+/g, " ");
		// A pass that changes no file makes no commit, so a reason kept for a commit message is lost.
		assert.match(work, /do not save its reason for a commit message/, `${name}'s work prompt rules out the commit message for a wrong finding`);
		assert.match(work, /say why in a comment on the Bead \(`bd comments add <bead id>`\) and in your final message/, `${name}'s work prompt names where a wrong finding's reason goes`);
	}
});

test("an adopting build Run's work prompt says a pass whose findings are all wrong changes no files and ends at work-finished", () => {
	for (const name of ["factory-build", "factory-build-gated"]) {
		const work = corePrompts(name, "/tmp/an-adopted-runs-artifacts").work.replace(/\s+/g, " ");
		assert.match(work, /When every finding is wrong, change no files and say so/, `${name}'s work prompt lets an all-wrong pass change nothing`);
		assert.match(work, /the Run at work-finished, and the Project Manager judges/, `${name}'s work prompt says where that pass ends and who judges it`);
	}
});

test("a build Run without --adopt gets the work prompt as it was before, the work convention alone", () => {
	const convention = readFileSync(join(root, "prompts", "work.md"), "utf8");
	for (const name of ["factory-build", "factory-build-gated"]) {
		assert.equal(corePrompts(name).work, convention, `${name}'s work prompt carries no second-pass words`);
	}
});

test("both build Workflows' work nodes take their prompt from the prompts node, so an adopting Run's second-pass words reach the agent", () => {
	for (const name of ["factory-build", "factory-build-gated"]) {
		const yaml = readFileSync(join(root, "workflows", "factory", name, `${name}.yaml`), "utf8");
		const work = yaml.split(/\n(?=  - id: )/).find((node) => node.startsWith("  - id: work\n"));
		assert.ok(work, `${name} has a work node`);
		assert.match(work, /\$prompts\.output\.work/, `${name}'s work node prompt starts from the work convention`);
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
