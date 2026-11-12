/**
 * The work node and the two reviews carry the module and test design guidance in Factory
 * words (fac-6a7.2). The seam is what a Run's node prompt says: bin/node-prompts' output for
 * the build Workflow, and the guide files under prompts/guides/ that output sends an agent to
 * read on a named condition.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The prompts a build Run's AI nodes read, as bin/node-prompts prints them. */
const buildPrompts = (): Record<string, string> => {
	const result = spawnSync(join(root, "bin", "node-prompts"), [join(root, "workflows", "factory", "build")], {
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as Record<string, string>;
};

/** The first line of a prompt that matches, so a rule is checked where its agent reads it. */
const lineMatching = (text: string, pattern: RegExp | string): string => {
	const matches = (each: string) => (typeof pattern === "string" ? each.includes(pattern) : pattern.test(each));
	const line = text.split("\n").find(matches);
	assert.ok(line, `a line of the prompt matches ${pattern}`);
	return line;
};

/** One guide as its agent reads it, named by the path a prompt sends the agent to. */
const guide = (path: string): string => readFileSync(join(root, "prompts", "guides", basename(path)), "utf8");

const moduleGuide = "~/.local/share/factory/prompts/guides/module-design.md";
const testGuide = "~/.local/share/factory/prompts/guides/test-design.md";

/** The build prompts and the two guides, read once: every test below checks the same text. */
const prompts = buildPrompts();
const moduleDesign = guide(moduleGuide);
const testDesign = guide(testGuide);

test("the work prompt sends the agent to the module guide when a module, an interface or a seam changes", () => {
	const line = lineMatching(prompts.work, moduleGuide);
	assert.match(line, /when the change adds a module, changes an interface or moves a seam/);
});

test("the work prompt sends the agent to the test guide when a test must reach something that is not plain computation", () => {
	const line = lineMatching(prompts.work, testGuide);
	assert.match(line, /when a test must reach something that is not plain computation/);
	assert.match(line, /database/);
	assert.match(line, /clock/);
});

test("the work prompt says which seam to take when neither the Bead nor its Epic names one", () => {
	const line = lineMatching(prompts.work, /highest existing seam/);
	assert.match(line, /commit message/);
	assert.match(line, /catches and misses/);
});

test("the work prompt treats a hard test as the wrong module shape, and says which way to reshape it", () => {
	const line = lineMatching(prompts.work, /wrong shape/);
	assert.match(line, /pass the dependency in/);
	assert.match(line, /return the result/);
});

test("the work prompt asks for one thing checked per test", () => {
	assert.match(prompts.work, /one thing checked per test/);
});

test("the work prompt gives depth a sentence", () => {
	const line = lineMatching(prompts.work, /depth/i);
	assert.match(line, /a lot of behaviour behind a small interface/);
	assert.match(line, /shallow/);
});

test("the work prompt gives the deletion test a sentence", () => {
	const line = lineMatching(prompts.work, /imagine deleting the module/i);
	assert.match(line, /pass-through/);
	assert.match(line, /earns its keep/);
});

test("the work prompt lets a new internal seam in only with a second adapter, and no external seam the Spec did not name", () => {
	const line = lineMatching(prompts.work, /internal seam/);
	assert.match(line, /second adapter/);
	assert.match(line, /external seam/);
	assert.match(line, /Spec did not name/);
});

test("the work prompt lets the agent replace the tests at a seam the Bead moved", () => {
	assert.match(prompts.work, /moves a seam, replace the tests at it/);
});

test("the work prompt asks the commit message to name the interface built and the alternative's cost", () => {
	const line = lineMatching(prompts.work, /alternative would have cost/);
	assert.match(line, /commit message/);
	assert.match(line, /which interface you built/);
});

test("the standards review sends the agent to the module guide when a module, an interface or a seam changes", () => {
	const line = lineMatching(prompts.review_standards, moduleGuide);
	assert.match(line, /when the diff adds a module, changes an interface or moves a seam/);
	assert.match(line, /four judgements/);
});

test("the standards review sends the agent to the test guide when the diff adds or changes tests", () => {
	const line = lineMatching(prompts.review_standards, testGuide);
	assert.match(line, /when the diff adds or changes tests/);
});

test("the standards review names the four design judgements", () => {
	const text = prompts.review_standards;
	assert.match(text, /shallow module/i);
	assert.match(text, /interface grown to match its implementation/i);
	assert.match(text, /pass-through/i);
	assert.match(text, /indirection with one adapter/i);
});

test("the standards review judges the tests as code, after the spec review judged whether they reach the seam", () => {
	const line = lineMatching(prompts.review_standards, /judge the tests as code/i);
	assert.match(line, /spec review judged/);
	assert.match(line, /fail without the change/);
	assert.match(line, /one thing checked per test/);
	assert.match(line, /independent source/);
	assert.match(line, /no fake of something the repo owns/);
});

test("the standards review says a name with no honest version leaves the design murky", () => {
	const line = lineMatching(prompts.review_standards, /no honest name/);
	assert.match(line, /murky/);
});

test("the standards review may not remove or reshape the seam and interface the spec review approved", () => {
	const line = lineMatching(prompts.review_standards, /may not remove or reshape/i);
	assert.match(line, /spec review owns the seam and the interface the Spec named/);
});

test("the standards review withholds when the only fix would reshape the seam the spec review approved", () => {
	const line = lineMatching(prompts.review_standards, /^Withhold approval only/);
	assert.match(line, /remove or reshape the seam the spec review approved/);
});

test("the spec review sends the agent to the module guide for vocabulary only when a module, an interface or a seam changes", () => {
	const line = lineMatching(prompts.review_spec, moduleGuide);
	assert.match(line, /when the diff adds a module, changes an interface or moves a seam/);
	assert.match(line, /vocabulary only/);
});

test("the spec review falls back to the Bead's acceptance criteria when the Epic holds no Spec or there is no parent", () => {
	const line = lineMatching(prompts.review_spec, /holds no Spec/);
	assert.match(line, /no parent/);
	assert.match(line, /acceptance criteria/);
	assert.match(line, /not a reason to withhold/);
});

test("the spec review judges a seam the change moved or added that the Spec did not decide", () => {
	const line = lineMatching(prompts.review_spec, /moved or added a seam/);
	assert.match(line, /the seam the Bead or its Spec names/);
	assert.match(line, /Implementation Decisions/);
});

test("the spec review owns the seam and the interface the Spec named", () => {
	const line = lineMatching(prompts.review_spec, /owns? the seam and the interface the Spec named/);
	assert.match(line, /standards review/);
	assert.match(line, /may not remove or reshape/);
});

test("the module guide says an interface is everything a caller must know", () => {
	assert.match(moduleDesign, /signature/);
	assert.match(moduleDesign, /invariants/);
	assert.match(moduleDesign, /ordering/);
	assert.match(moduleDesign, /error modes/);
	assert.match(moduleDesign, /commit message/);
});

test("the module guide says depth is leverage, not a ratio of lines", () => {
	assert.match(moduleDesign, /depth is leverage, not a ratio of lines/i);
});

test("the module guide asks three questions about an interface", () => {
	assert.match(moduleDesign, /fewer methods/);
	assert.match(moduleDesign, /simpler parameters/);
	assert.match(moduleDesign, /hide more/);
});

test("the module guide asks how the project's words and the design words divide", () => {
	assert.match(moduleDesign, /GLOSSARY\.md/);
	assert.match(moduleDesign, /boundary/);
	assert.match(moduleDesign, /outside world/);
});

test("the module guide says how to make a module testable", () => {
	assert.match(moduleDesign, /take the dependency/i);
	assert.match(moduleDesign, /return the result/i);
	assert.match(moduleDesign, /keep the surface small/i);
});

test("the module guide places a dependency by its category, choosing how to stand in and never whether to add a seam", () => {
	for (const category of ["in-process", "local-substitutable", "remote but owned", "true external"]) {
		assert.match(moduleDesign, new RegExp(category, "i"));
	}
	assert.match(moduleDesign, /how a test stands in/i);
	assert.match(moduleDesign, /never whether/);
	assert.match(moduleDesign, /seam the Spec did not name/);
});

test("the module guide replaces the tests at a moved seam in the same commit", () => {
	assert.match(moduleDesign, /same commit as the new seam test/);
	assert.match(moduleDesign, /only where the new test covers/);
	assert.match(moduleDesign, /its own Bead/);
});

test("the module guide keeps a deep module's internal composition legal", () => {
	assert.match(moduleDesign, /internal composition is not a speculative seam/);
});

test("the module guide defines the four judgements the standards review names", () => {
	for (const judgement of ["shallow module", "interface grown to match its implementation", "pass-through", "indirection with one adapter"]) {
		assert.match(moduleDesign, new RegExp(judgement, "i"));
	}
});

test("the test guide shapes the code so a test can reach the dependency", () => {
	assert.match(testDesign, /take the dependency/i);
	assert.match(testDesign, /return the result/i);
	assert.match(testDesign, /keep the surface small/i);
});

test("the test guide gives each external operation its own function so a stand-in never branches", () => {
	assert.match(testDesign, /one function per external operation/i);
	assert.match(testDesign, /conditional logic/);
});

test("the test guide chooses the stand-in by the dependency's category, never to add a seam the Spec did not name", () => {
	for (const category of ["in-process", "local-substitutable", "remote but owned", "true external"]) {
		assert.match(testDesign, new RegExp(category, "i"));
	}
	assert.match(testDesign, /never whether/);
	assert.match(testDesign, /seam the Spec did not name/);
});

test("the test guide judges a test as code", () => {
	assert.match(testDesign, /one thing checked per test/i);
	assert.match(testDesign, /name that says what it checks/);
	assert.match(testDesign, /independent source/);
	assert.match(testDesign, /no branching in setup/i);
	assert.match(testDesign, /no fake of something the repo owns/i);
});

/** Every prompt and guide file under prompts/, as a Run installs them. */
const promptAndGuideFiles = (): string[] => {
	const files: string[] = [];
	const walk = (folder: string): void => {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.name.endsWith(".md")) files.push(path);
		}
	};
	walk(join(root, "prompts"));
	return files;
};

test("no prompt or guide names Pocock's own setup: no issue tracker, setup command, ticket or user to confirm with", () => {
	const forbidden = /issue[- ]tracker|setup-matt-pocock-skills|\btickets?\b|\busers? to confirm|confirm (?:it|them|the seam|each seam) with (?:a|the) user/i;
	for (const file of promptAndGuideFiles()) {
		assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, `${file} names none of it`);
	}
});

test("the map lists both guides under prompts/", () => {
	const lines = readFileSync(join(root, "map", "paths.txt"), "utf8").split("\n");
	const start = lines.findIndex((line) => /^  prompts\/\s/.test(line));
	assert.ok(start >= 0, "the map has a prompts/ entry");
	const end = lines.findIndex((candidate, at) => at > start && /^  \S/.test(candidate));
	const block = lines.slice(start + 1, end < 0 ? undefined : end);
	assert.ok(block.some((line) => /^    guides\/\s+—/.test(line)), "the prompts entry has a guides/ folder");
	for (const guidePath of [moduleGuide, testGuide]) {
		const name = basename(guidePath);
		assert.ok(
			block.some((line) => new RegExp(`^      ${name.replace(".", "\\.")}\\s+—`).test(line)),
			`the map lists ${name}`,
		);
	}
});

test("both build Workflows gate the standards review on the spec review's approval", () => {
	for (const name of ["build", "build-gated"]) {
		const yaml = readFileSync(join(root, "workflows", "factory", name, `${name}.yaml`), "utf8");
		const standards = yaml.split(/\n(?=  - id: )/).find((node) => node.startsWith("  - id: standards\n"));
		assert.ok(standards, `${name} has a standards node`);
		assert.match(standards, /when: "\$spec\.output\.approved == true"/, `${name}'s standards node runs only on the spec review's approval`);
	}
});
