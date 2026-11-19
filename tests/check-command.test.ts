/**
 * A Run can be given a check scoped to its Bead with `--input check_command='<command>'`,
 * and every check site then runs that command instead of the project's ambient
 * `FACTORY_CHECK` (fac-1tw). The seam is the Run's shell nodes as the Workflow file writes
 * them: the test reads each node's `bash:` out of the real YAML, passes the Run the inputs
 * that YAML's `inputs:` block declares, the way Archon does, and runs the node in a real
 * repository with the real bin/land. No test reads node-prompts' marker alone: a Workflow
 * that drops the input fails this file even when node-prompts' marker test passes.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const yamlOf = (workflow: string) => join(root, "workflows", "factory", workflow, `${workflow}.yaml`);

/**
 * The shell Archon runs for one node of a core Workflow, dedented from its YAML: a
 * `bash: |` block runs to the next line the Workflow writes at its own level, and a
 * one-line `bash:` is a single-quoted scalar.
 */
const nodeBash = (workflow: string, id: string): string => {
	const lines = readFileSync(yamlOf(workflow), "utf8").split("\n");
	const start = lines.findIndex((line) => line === `  - id: ${id}`);
	assert.ok(start >= 0, `${workflow} has a ${id} node`);
	let bash = start + 1;
	while (bash < lines.length && !lines[bash].startsWith("  - id: ") && !lines[bash].startsWith("    bash:")) bash++;
	assert.ok(lines[bash]?.startsWith("    bash:"), `${workflow}'s ${id} node runs a bash command`);
	const scalar = lines[bash].slice("    bash:".length).trim();
	if (scalar !== "|") return scalar.replace(/^'/, "").replace(/'$/, "");
	const body: string[] = [];
	for (const line of lines.slice(bash + 1)) {
		if (!line.startsWith("      ")) break;
		body.push(line.slice(6));
	}
	return body.join("\n");
};

/**
 * The input names a Workflow's top-level `inputs:` block declares. Archon turns each of
 * them into `INPUTS_<NAME>` for the Run's shell nodes, and an input the block does not
 * name never reaches a node: that is how factory-task dropped check_command in silence.
 */
const declaredInputs = (workflow: string): string[] => {
	const lines = readFileSync(yamlOf(workflow), "utf8").split("\n");
	const start = lines.indexOf("inputs:");
	if (start < 0) return [];
	const names: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (!line.startsWith("  ")) break;
		const declared = line.match(/^  ([\w-]+):/);
		if (declared) names.push(declared[1]);
	}
	return names;
};

/** The environment a Run gets from `--input check_command=<command>`, for a Workflow that declares it. */
const scopedCheckEnv = (workflow: string, command: string): Record<string, string> => {
	assert.ok(
		declaredInputs(workflow).includes("check_command"),
		`${workflow} declares check_command in inputs:, so Archon passes --input check_command to its nodes`,
	);
	return { INPUTS_CHECK_COMMAND: command };
};

/** A check command that writes down that it ran, so a test tells the scoped check from the ambient one. */
const checkCommand = (word: string, log: string) => `printf '%s' ${word} >> '${log}'`;

const git = (repo: string, args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

type Run = {
	dir: string;
	repo: string;
	checkLog: string;
	/** Run one shell node of a core Workflow the way Archon does: its own bash, in the Run's repo. */
	node: (workflow: string, id: string, env: Record<string, string>) => { status: number | null; stdout: string; stderr: string };
	/** Which check command ran, one word per run. */
	ran: () => string;
	remove: () => void;
};

/**
 * One Run: a temporary home with the Factory's helpers where a Workflow finds them, a
 * Profile that lands by squash, and a real repository whose branch has a commit to check
 * and land. The check commands write their word to `checkLog`, so a test reads which one
 * a node ran without looking inside the node or bin/land.
 */
const makeRun = (): Run => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "factory-check-command-")));
	const home = join(dir, "home");
	const repo = join(dir, "calc");
	const remote = join(dir, "remote.git");
	const artifacts = join(dir, "artifacts");
	const checkLog = join(dir, "check.log");
	mkdirSync(join(home, ".config", "factory"), { recursive: true });
	mkdirSync(join(home, ".local", "share", "factory"), { recursive: true });
	mkdirSync(artifacts);
	symlinkSync(join(root, "bin"), join(home, ".local", "share", "factory", "bin"));
	writeFileSync(join(home, ".config", "factory", "profile"), 'LANDING=squash\nPROTECTED_TARGETS="calc"\n');
	git(dir, ["init", "-q", "-b", "main", repo]);
	git(repo, ["config", "user.email", "run@example.com"]);
	git(repo, ["config", "user.name", "A Run"]);
	writeFileSync(join(repo, "one.txt"), "one\n");
	git(repo, ["add", "one.txt"]);
	git(repo, ["commit", "-q", "-m", "one"]);
	git(dir, ["init", "-q", "--bare", remote]);
	git(repo, ["remote", "add", "origin", remote]);
	git(repo, ["push", "-q", "-u", "origin", "main"]);
	git(repo, ["checkout", "-q", "-b", "pm/work"]);
	writeFileSync(join(repo, "two.txt"), "two\n");
	git(repo, ["add", "two.txt"]);
	git(repo, ["commit", "-q", "-m", "two"]);
	return {
		dir,
		repo,
		checkLog,
		node: (workflow, id, given) => {
			const env: NodeJS.ProcessEnv = {
				...process.env,
				HOME: home,
				ARTIFACTS_DIR: artifacts,
				BASE_BRANCH: "main",
				WORKFLOW_ID: "run-123",
				LIBRARY: join(root, "workflows"),
			};
			delete env.INPUTS_CHECK_COMMAND;
			delete env.FACTORY_CHECK;
			const result = spawnSync("bash", ["-c", nodeBash(workflow, id)], { cwd: repo, encoding: "utf8", env: { ...env, ...given } });
			return { status: result.status, stdout: result.stdout, stderr: result.stderr };
		},
		ran: () => (existsSync(checkLog) ? readFileSync(checkLog, "utf8") : ""),
		remove: () => rmSync(dir, { recursive: true, force: true }),
	};
};

/** Every core Workflow's shell nodes that run the check: the checks node, and the builds' recheck. */
const checkNodes: Record<string, string[]> = {
	"factory-task": ["checks"],
	"factory-build": ["checks", "recheck"],
	"factory-build-gated": ["checks", "recheck"],
};

test("every core Workflow's check nodes run the command --input check_command gives it, not FACTORY_CHECK", () => {
	for (const [workflow, nodes] of Object.entries(checkNodes)) {
		for (const node of nodes) {
			const run = makeRun();
			try {
				const ambient = checkCommand("ambient", run.checkLog);
				const result = run.node(workflow, node, { FACTORY_CHECK: ambient, ...scopedCheckEnv(workflow, checkCommand("scoped", run.checkLog)) });
				assert.equal(result.status, 0, `${workflow}'s ${node}: ${result.stderr}`);
				assert.equal(run.ran(), "scoped", `${workflow}'s ${node} ran the scoped check instead of FACTORY_CHECK`);
			} finally {
				run.remove();
			}
		}
	}
});

/** The checked node whose prompt carries the marker a Workflow's flows file feeds. */
const markerNodes: Record<string, string> = { "factory-task": "task", "factory-build": "work", "factory-build-gated": "work" };

test("every core Workflow's prompts node names the command --input check_command gives it in the checked node's marker", () => {
	for (const [workflow, node] of Object.entries(markerNodes)) {
		const run = makeRun();
		try {
			const result = run.node(workflow, "prompts", { FACTORY_CHECK: "printf ambient", ...scopedCheckEnv(workflow, "printf scoped") });
			assert.equal(result.status, 0, `${workflow}'s prompts node: ${result.stderr}`);
			const prompts = JSON.parse(result.stdout) as Record<string, string>;
			const marker = JSON.parse(prompts[`marker_${node}`].slice("FLOWS ".length)) as { check?: string };
			assert.equal(marker.check, "printf scoped", `${workflow}'s marker names the scoped check`);
		} finally {
			run.remove();
		}
	}
});

/** Every core Workflow's landing nodes, which check the change again before it lands. */
const landingNodes: Record<string, string[]> = {
	"factory-task": ["land"],
	"factory-build": ["land"],
	"factory-build-gated": ["land-hold", "land"],
};

test("every core Workflow's landing checks the command --input check_command gives it, not FACTORY_CHECK", () => {
	for (const [workflow, nodes] of Object.entries(landingNodes)) {
		for (const node of nodes) {
			const run = makeRun();
			try {
				const ambient = checkCommand("ambient", run.checkLog);
				const result = run.node(workflow, node, { FACTORY_CHECK: ambient, ...scopedCheckEnv(workflow, checkCommand("scoped", run.checkLog)) });
				assert.equal(result.status, 0, `${workflow}'s ${node}: ${result.stderr}`);
				assert.equal(run.ran(), "scoped", `${workflow}'s ${node} landed with the scoped check instead of FACTORY_CHECK`);
			} finally {
				run.remove();
			}
		}
	}
});

test("a factory-task Run with no check_command input uses the ambient FACTORY_CHECK at every check site", () => {
	const run = makeRun();
	try {
		const result = run.node("factory-task", "prompts", { FACTORY_CHECK: "printf ambient", INPUTS_CHECK_COMMAND: "" });
		assert.equal(result.status, 0, result.stderr);
		const prompts = JSON.parse(result.stdout) as Record<string, string>;
		const marker = JSON.parse(prompts.marker_task.slice("FLOWS ".length)) as { check?: string };
		assert.equal(marker.check, "printf ambient", "the marker names the ambient check when no input scopes it");
	} finally {
		run.remove();
	}
	for (const node of ["checks", "land"]) {
		const run = makeRun();
		try {
			const result = run.node("factory-task", node, { FACTORY_CHECK: checkCommand("ambient", run.checkLog), INPUTS_CHECK_COMMAND: "" });
			assert.equal(result.status, 0, `${node}: ${result.stderr}`);
			assert.equal(run.ran(), "ambient", `${node} ran the ambient FACTORY_CHECK when no input scopes it`);
		} finally {
			run.remove();
		}
	}
});
