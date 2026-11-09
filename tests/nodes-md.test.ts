/**
 * workflows/factory/NODES.md is the node library beside the router (fac-60v.20.8): each kind
 * of node in the core Workflows, with a YAML snippet a Project Manager pastes into a Workflow
 * of its own. The seam is the published page and Archon's own check: a node id read from the
 * core Workflows must have a snippet in NODES.md, and pasting that snippet into a Workflow
 * that has its nodes must pass `archon workflow test`. The coverage check reads only the node
 * ids the Workflows declare; the page's words are not generated from the Workflows. That paste
 * is why each review node in the Workflows spells its `output_format` out in full instead of
 * sharing a YAML anchor: a pasted snippet replaces the node the anchor hangs on, and an alias
 * left behind would fail Archon's own check.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreGroup = join(root, "workflows", "factory");
const nodesMd = join(coreGroup, "NODES.md");
// This Mac's Archon, which install.sh puts in the Factory's root: its binary and the
// provider plugins that `archon workflow test` needs.
const macArchon = process.env.ARCHON_HOME ?? join(homedir(), ".local", "share", "factory", "archon");

/** The core Workflows' folder names. */
const workflowNames = (): string[] =>
	readdirSync(coreGroup, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

/** One core Workflow's file. */
const workflowFile = (name: string): string => join(coreGroup, name, `${name}.yaml`);

/** The node ids a Workflow declares, in order. */
const nodeIds = (yaml: string): string[] => [...yaml.matchAll(/^\s*- id: (\S+)\s*$/gm)].map((match) => match[1]);

/** The YAML node snippets in NODES.md: fenced blocks that begin with a node. */
const snippets = (): { ids: string[]; yaml: string }[] => {
	const out: { ids: string[]; yaml: string }[] = [];
	for (const match of readFileSync(nodesMd, "utf8").matchAll(/^```ya?ml\n([\s\S]*?)^```$/gm)) {
		if (!/^  - id: \S+/.test(match[1])) continue;
		out.push({ ids: nodeIds(match[1]), yaml: match[1] });
	}
	return out;
};

test("NODES.md sits beside the router and names every node kind the core Workflows use", () => {
	assert.equal(existsSync(join(coreGroup, "README.md")), true, "the router sits in the core group");
	assert.equal(existsSync(nodesMd), true, "NODES.md is the node library beside it");
	const listed = new Set(snippets().flatMap((snippet) => snippet.ids));
	for (const name of workflowNames()) {
		for (const id of nodeIds(readFileSync(workflowFile(name), "utf8"))) {
			assert.equal(listed.has(id), true, `${name}'s ${id} node has a snippet in NODES.md`);
		}
	}
});

/** A temporary Archon home: links to this Mac's Archon, and an empty Workflow library. */
const makeArchonHome = (): string => {
	const home = mkdtempSync(join(tmpdir(), "factory-nodes-"));
	mkdirSync(join(home, "bin"));
	mkdirSync(join(home, "workflows", "nodes"), { recursive: true });
	symlinkSync(join(macArchon, "bin", "archon"), join(home, "bin", "archon"));
	symlinkSync(join(macArchon, "plugins"), join(home, "plugins"));
	return home;
};

/**
 * One snippet pasted into a copy of a Workflow that has its nodes: the first node's block is
 * replaced by the snippet, the other nodes the snippet replaces are dropped, and the copy is
 * named so Archon can report on it alone.
 */
const pasteInto = (workflow: string, name: string, snippet: string, ids: string[]): string => {
	const lines = readFileSync(workflowFile(workflow), "utf8").split("\n");
	const startOf = (id: string): number => {
		const at = lines.findIndex((line) => line.trim() === `- id: ${id}`);
		assert.ok(at >= 0, `${workflow} has a ${id} node`);
		return at;
	};
	// A node's block runs to the next line at the list's indent or above; a blank line inside
	// a block scalar is the block's, so only blank lines at the block's end are left out.
	const ranges = ids.map((id) => {
		const start = startOf(id);
		let end = start + 1;
		while (end < lines.length && (/^    /.test(lines[end]) || lines[end].trim() === "")) end++;
		while (end > start + 1 && lines[end - 1].trim() === "") end--;
		return [start, end] as const;
	});
	const first = Math.min(...ranges.map(([start]) => start));
	const snippetLines = snippet.replace(/\n$/, "").split("\n");
	const out: string[] = [];
	lines.forEach((line, at) => {
		const range = ranges.find(([start, end]) => at >= start && at < end);
		if (!range) out.push(line);
		else if (at === first) out.push(...snippetLines);
	});
	return out.join("\n").replace(/^name: .*$/m, `name: ${name}`);
};

/** The nodes a snippet names as its dependencies, which its Workflow must have too. */
const dependsOn = (yaml: string): string[] =>
	[...yaml.matchAll(/^\s*depends_on:\s*\[([^\]]*)\]/gm)].flatMap((match) => match[1].split(",").map((id) => id.trim())).filter(Boolean);

test("every snippet passes archon workflow test when pasted into a Workflow that has its nodes", () => {
	const home = makeArchonHome();
	try {
		const cases: string[] = [];
		snippets().forEach((snippet, index) => {
			const needed = [...snippet.ids, ...dependsOn(snippet.yaml)];
			const workflow = workflowNames().find((name) => {
				const ids = nodeIds(readFileSync(workflowFile(name), "utf8"));
				return needed.every((id) => ids.includes(id));
			});
			assert.ok(workflow, `a core Workflow has the ${needed.join(", ")} nodes`);
			const name = `nodes-${index + 1}`;
			const folder = join(home, "workflows", "nodes", name);
			cpSync(join(coreGroup, workflow), folder, { recursive: true });
			rmSync(join(folder, `${workflow}.yaml`));
			writeFileSync(join(folder, `${name}.yaml`), pasteInto(workflow, name, snippet.yaml, snippet.ids));
			cases.push(name);
		});
		const result = spawnSync(join(home, "bin", "archon"), ["workflow", "test"], {
			cwd: home,
			encoding: "utf8",
			env: { ...process.env, ARCHON_HOME: home, ARCHON_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1", PI_SKIP_VERSION_CHECK: "1" },
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		for (const name of cases) assert.match(result.stdout, new RegExp(`→ ${name}\\b`), `${name} was tested`);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("the router and the Project Manager's instructions point to the node library", () => {
	assert.match(readFileSync(join(coreGroup, "README.md"), "utf8"), /NODES\.md/, "the router names NODES.md");
	assert.match(
		readFileSync(join(root, "project-manager", "instructions.md"), "utf8"),
		/NODES\.md/,
		"the Project Manager's instructions name NODES.md",
	);
});
