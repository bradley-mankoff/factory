/**
 * The work node, the task node and the two reviews carry the guidance a Run gives its agents
 * in Factory words: the module and test design rules (fac-6a7.2), the work node's rule that
 * its agent does the Bead in its own session and treats a failed tool call as information
 * (fac-h73), and the closing-account rule both checked nodes state, since the same
 * closing-account check reads each node's final message (fac-h73). The seam is what a Run's
 * node prompt says: bin/node-prompts' output for a Workflow, and the guide files under
 * prompts/guides/ that output sends an agent to read on a named condition. One test also
 * runs the put-work-down copy command a prompt hands an agent against a real linked worktree,
 * so a convention that would damage the Run's folder cannot pass by reading right (fac-iaw.1).
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The prompts a Workflow's AI nodes read, as bin/node-prompts prints them. */
const workflowPrompts = (workflow: string): Record<string, string> => {
	const result = spawnSync(join(root, "bin", "node-prompts"), [join(root, "workflows", "factory", workflow)], {
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as Record<string, string>;
};

/** Every line of a prompt that matches, so a rule is checked where its agent reads it. */
const linesMatching = (text: string, pattern: RegExp | string): string[] => {
	const matches = (each: string) => (typeof pattern === "string" ? each.includes(pattern) : pattern.test(each));
	return text.split("\n").filter(matches);
};

/** The first line of a prompt that matches, for a rule stated once. */
const lineMatching = (text: string, pattern: RegExp | string): string => {
	const [line] = linesMatching(text, pattern);
	assert.ok(line, `a line of the prompt matches ${pattern}`);
	return line;
};

/** One guide as its agent reads it, named by the path a prompt sends the agent to. */
const guide = (path: string): string => readFileSync(join(root, "prompts", "guides", basename(path)), "utf8");

const moduleGuide = "~/.local/share/factory/prompts/guides/module-design.md";
const testGuide = "~/.local/share/factory/prompts/guides/test-design.md";

/** The build Workflow's prompts, the task Workflow's prompts and the two guides, read once: every test below checks the same text. */
const buildPrompts = workflowPrompts("factory-build");
const taskPrompts = workflowPrompts("factory-task");
const moduleDesign = guide(moduleGuide);
const testDesign = guide(testGuide);

/** A prompt's closing-account paragraph, the line the closing-account check sends an agent back to fix. */
const closingAccount = (prompt: string): string => lineMatching(prompt, /^\*\*End with a closing account/);

/** A checked node's closing account sends its agent back to do the work an unmet line names, not to finish with it unmet. */
const assertClosingAccountSendsBack = (prompt: string): void => {
	const paragraph = closingAccount(prompt);
	assert.match(paragraph, /marking a line unmet is never a way past the check/);
	assert.match(paragraph, /do the work it names, run the check again, and end with a fresh account/);
};

test("the work prompt keeps the work in the work agent's own session, even with a subagent tool loaded", () => {
	const line = lineMatching(buildPrompts.work, /never delegate the work/);
	assert.match(line, /Do the Bead's work in this session/);
	assert.match(line, /even when a `subagent` tool is loaded/);
	assert.match(line, /checks read your worktree and your own final message/);
	assert.match(line, /work another agent does is work the Run cannot see/);
});

test("the work prompt treats a failed tool call as information, not a reason to stop", () => {
	const line = lineMatching(buildPrompts.work, /failed tool call/);
	assert.match(line, /information, not a reason to stop/);
	assert.match(line, /read the error, choose another way/);
	assert.match(line, /keep going until the work is done/);
});

test("the work prompt's closing account sends the agent back to do an unmet line's work rather than to stop", () => {
	assertClosingAccountSendsBack(buildPrompts.work);
});

test("the task prompt's closing account sends the agent back to do an unmet line's work rather than to stop", () => {
	assertClosingAccountSendsBack(taskPrompts.task);
});

test("the work and task prompts carry the closing-account rule word for word, so its two copies cannot drift", () => {
	assert.equal(closingAccount(taskPrompts.task), closingAccount(buildPrompts.work));
});

/** The paragraph every node prompt carries so its agent puts work down before it destroys anything. */
const putWorkDown = (prompt: string): string => lineMatching(prompt, "Put work down so cleanup is ordinary");

test("every Run node prompt carries the same put-work-down conventions", () => {
	const copies = [buildPrompts.work, buildPrompts.review_spec, buildPrompts.review_standards, taskPrompts.task].map(putWorkDown);
	assert.equal(new Set(copies).size, 1, `one paragraph in every prompt:\n${copies.join("\n\n")}`);
});

test("the Run node prompts say where scratch and throwaway repos go, who cleans up branches, and where a setting comes from", () => {
	const paragraph = putWorkDown(buildPrompts.work);
	assert.match(paragraph, /`\/tmp\/<task name>\/`/);
	assert.match(paragraph, /`git clone <repo> \/tmp\/<task name>\/<name>`/);
	assert.match(paragraph, /never a linked worktree/);
	assert.match(paragraph, /git worktree remove --force/);
	assert.doesNotMatch(paragraph, /cp -R <repo>/);
	assert.match(paragraph, /`bin\/land` and `archon complete`/);
	assert.match(paragraph, /never from reading the project's `\.archon\/\.env`/);
});

test("the spec review's before-and-after check clones the repo into /tmp rather than a linked worktree", () => {
	const line = lineMatching(buildPrompts.review_spec, /before the change/);
	assert.match(line, /`git clone \. \/tmp\/<task name>\/<name>`/);
	assert.doesNotMatch(line, /cp -R/);
	assert.doesNotMatch(line, /worktree add/);
});

/** The copy command the prompts hand an agent for a throwaway repo, with its placeholders filled. */
const throwawayCopy = (paragraph: string, repo: string, copy: string): string => {
	const [, command = ""] = paragraph.match(/`(git clone <repo> \/tmp\/<task name>\/<name>)`/) ?? [];
	assert.ok(command, "the paragraph hands the agent a git clone of the repo into /tmp/<task name>");
	return command.replace("<repo>", repo).replace("/tmp/<task name>/<name>", copy);
};

const git = (repo: string, args: string[]): string => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

const commit = (repo: string, message: string): void => {
	git(repo, ["add", "-A"]);
	execFileSync(
		"git",
		["-C", repo, "-c", "user.name=Factory", "-c", "user.email=factory@example.invalid", "commit", "-q", "-m", message],
		{ encoding: "utf8" },
	);
};

test("a checkout in the throwaway copy the prompts hand an agent leaves the worktree it cloned from on its branch", () => {
	// The Run's folder is a linked worktree, whose .git is a file pointing at the repo that
	// owns it. A cp -R of it copies that file, so a checkout in the copy moves the original's
	// HEAD; a clone has a .git of its own (fac-iaw.1 review).
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "factory-put-work-down-")));
	try {
		const repo = join(dir, "repo");
		const worktree = join(dir, "worktree");
		const copy = join(dir, "copy");
		git(dir, ["init", "-q", repo]);
		writeFileSync(join(repo, "file"), "one\n");
		git(repo, ["add", "file"]);
		commit(repo, "one");
		writeFileSync(join(repo, "file"), "two\n");
		commit(repo, "two");
		git(repo, ["branch", "br"]);
		git(repo, ["worktree", "add", "-q", worktree, "br"]);
		// The command the paragraph hands an agent, run where its agent runs it: in the worktree.
		const command = throwawayCopy(putWorkDown(buildPrompts.review_spec), ".", copy);
		const result = spawnSync("sh", ["-c", command], { cwd: worktree, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		git(copy, ["checkout", "-q", "HEAD~1"]);
		assert.equal(git(worktree, ["branch", "--show-current"]).trim(), "br", "the worktree stays on its branch");
		assert.equal(git(worktree, ["status", "--porcelain"]), "", "and keeps an index, a HEAD and a work tree of its own");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the work prompt sends the agent to the module guide when a module, an interface or a seam changes", () => {
	const line = lineMatching(buildPrompts.work, moduleGuide);
	assert.match(line, /when the change adds a module, changes an interface or moves a seam/);
});

test("the work prompt sends the agent to the test guide when a test must reach something that is not plain computation", () => {
	const line = lineMatching(buildPrompts.work, testGuide);
	assert.match(line, /when a test must reach something that is not plain computation/);
	assert.match(line, /database/);
	assert.match(line, /clock/);
});

test("the work prompt says which seam to take when neither the Bead nor its Epic names one", () => {
	const line = lineMatching(buildPrompts.work, /highest existing seam/);
	assert.match(line, /commit message/);
	assert.match(line, /catches and misses/);
});

test("the work prompt treats a hard test as the wrong module shape, and says which way to reshape it", () => {
	const line = lineMatching(buildPrompts.work, /wrong shape/);
	assert.match(line, /pass the dependency in/);
	assert.match(line, /return the result/);
});

test("the work prompt asks for one thing checked per test", () => {
	assert.match(buildPrompts.work, /one thing checked per test/);
});

test("the work prompt's test-name example names a caller of the project's domain, not a person", () => {
	const line = lineMatching(buildPrompts.work, /reads like a specification/);
	assert.match(line, /a caller can check out with a valid cart/);
	assert.doesNotMatch(line, /\ba user\b/i);
});

test("the work prompt gives depth a sentence", () => {
	const line = lineMatching(buildPrompts.work, /depth/i);
	assert.match(line, /a lot of behaviour behind a small interface/);
	assert.match(line, /shallow/);
});

test("the work prompt gives the deletion test a sentence", () => {
	const line = lineMatching(buildPrompts.work, /imagine deleting the module/i);
	assert.match(line, /pass-through/);
	assert.match(line, /earns its keep/);
});

test("the work prompt lets a new internal seam in only with a second adapter, and no external seam the Spec did not name", () => {
	const line = lineMatching(buildPrompts.work, /internal seam/);
	assert.match(line, /second adapter/);
	assert.match(line, /external seam/);
	assert.match(line, /Spec did not name/);
});

test("the work prompt lets the agent replace the tests at a seam the Bead moved", () => {
	assert.match(buildPrompts.work, /moves a seam, replace the tests at it/);
});

test("the work prompt asks the commit message to name the interface built and the alternative's cost", () => {
	const line = lineMatching(buildPrompts.work, /alternative would have cost/);
	assert.match(line, /commit message/);
	assert.match(line, /which interface you built/);
});

test("the work prompt makes a refactor its Bead asks for part of the work loop", () => {
	const line = lineMatching(buildPrompts.work, /refactoring the Bead asks for/i);
	assert.match(line, /is this loop's work/);
});

test("the work prompt leaves refactoring its Bead does not ask for to the review", () => {
	const line = lineMatching(buildPrompts.work, /refactoring it does not ask for/i);
	assert.match(line, /belongs to the review/);
});

test("the standards review sends the agent to the module guide when a module, an interface or a seam changes", () => {
	const line = lineMatching(buildPrompts.review_standards, moduleGuide);
	assert.match(line, /when the diff adds a module, changes an interface or moves a seam/);
	assert.match(line, /four judgements/);
});

test("the standards review sends the agent to the test guide when the diff adds or changes tests", () => {
	const line = lineMatching(buildPrompts.review_standards, testGuide);
	assert.match(line, /when the diff adds or changes tests/);
});

test("the standards review names the four design judgements", () => {
	const text = buildPrompts.review_standards;
	assert.match(text, /shallow module/i);
	assert.match(text, /interface grown to match its implementation/i);
	assert.match(text, /pass-through/i);
	assert.match(text, /indirection with one adapter/i);
});

test("the standards review gives a module that only passes calls on one finding, not two", () => {
	const findings = linesMatching(buildPrompts.review_standards, /middle man|only passes calls on/i);
	assert.equal(findings.length, 1, findings.join("\n"));
});

test("the standards review judges the tests as code, after the spec review judged whether they reach the seam", () => {
	const line = lineMatching(buildPrompts.review_standards, /judge the tests as code/i);
	assert.match(line, /spec review judged/);
	assert.match(line, /fail without the change/);
	assert.match(line, /one thing checked per test/);
	assert.match(line, /independent source/);
	assert.match(line, /no fake of something the repo owns/);
});

test("the standards review says a name with no honest version leaves the design murky", () => {
	const line = lineMatching(buildPrompts.review_standards, /no honest name/);
	assert.match(line, /murky/);
});

test("the standards review may not remove or reshape the seam and interface the spec review approved", () => {
	const line = lineMatching(buildPrompts.review_standards, /may not remove or reshape/i);
	assert.match(line, /spec review owns the seam and the interface the Spec named/);
});

test("the standards review withholds when the only fix would reshape the seam the spec review approved", () => {
	const line = lineMatching(buildPrompts.review_standards, /^Withhold approval only/);
	assert.match(line, /remove or reshape the seam the spec review approved/);
});

test("the spec review sends the agent to the module guide for vocabulary only when a module, an interface or a seam changes", () => {
	const line = lineMatching(buildPrompts.review_spec, moduleGuide);
	assert.match(line, /when the diff adds a module, changes an interface or moves a seam/);
	assert.match(line, /vocabulary only/);
});

test("the spec review falls back to the Bead's acceptance criteria when the Epic holds no Spec or there is no parent", () => {
	const line = lineMatching(buildPrompts.review_spec, /holds no Spec/);
	assert.match(line, /no parent/);
	assert.match(line, /acceptance criteria/);
	assert.match(line, /not a reason to withhold/);
});

test("the spec review judges a seam the change moved or added that the Spec did not decide", () => {
	const line = lineMatching(buildPrompts.review_spec, /moved or added a seam/);
	assert.match(line, /the seam the Bead or its Spec names/);
	assert.match(line, /Implementation Decisions/);
});

test("the spec review owns the seam and the interface the Spec named", () => {
	const line = lineMatching(buildPrompts.review_spec, /owns? the seam and the interface the Spec named/);
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
	for (const name of ["factory-build", "factory-build-gated"]) {
		const yaml = readFileSync(join(root, "workflows", "factory", name, `${name}.yaml`), "utf8");
		const standards = yaml.split(/\n(?=  - id: )/).find((node) => node.startsWith("  - id: standards\n"));
		assert.ok(standards, `${name} has a standards node`);
		assert.match(standards, /when: "\$spec\.output\.approved == true"/, `${name}'s standards node runs only on the spec review's approval`);
	}
});

/**
 * The Project Manager's instructions as its session loads them (fac-3mz.6). The seam is the
 * file project-manager/start appends to pi's system prompt, which tests/pm.test.ts holds to
 * that path: every question the Project Manager puts to the Human is an Ask, and every answer
 * is recorded, whether the Human typed it into the pane or a connector carried it.
 */
const instructions = readFileSync(join(root, "project-manager", "instructions.md"), "utf8");

/** One part of the instructions, from the line it starts on to the next heading or bold
 * paragraph, so a rule is checked where the Project Manager reads it and no further. */
const part = (start: string): string => {
	const lines = instructions.split("\n");
	const at = lines.findIndex((line) => line.startsWith(start));
	assert.ok(at >= 0, `the instructions hold ${start}`);
	const end = lines.findIndex((line, index) => index > at && /^(?:#|\*\*)/.test(line));
	return lines.slice(at, end < 0 ? undefined : end).join("\n");
};

test("the Project Manager reaches the Human with factory ask", () => {
	const line = lineMatching(part("## Reaching the Human"), /factory ask <bead id> <kind>/);
	assert.match(line, /"<the question>"/);
});

test("the Project Manager's instructions carry no connector's own command", () => {
	assert.doesNotMatch(instructions, /openclaw agent/);
});

test("the instructions record an answer typed into the pane with factory answer before acting on it", () => {
	const line = lineMatching(part("## Reaching the Human"), "factory answer");
	assert.match(line, /typed into this pane/);
	assert.match(line, /before you act/);
});

test("the instructions remove the answered label once the Project Manager has acted", () => {
	const line = lineMatching(instructions, "bd label remove <bead id> answered");
	assert.match(line, /acted/i);
});

test("the Decisions section puts a Decision in with factory ask", () => {
	const line = lineMatching(part("## Decisions"), "factory ask");
	assert.match(line, /factory ask <bead id> decision "<the question>"/);
});

test("the Decisions section records the Human's answer with factory answer", () => {
	const line = lineMatching(part("## Decisions"), "factory answer");
	assert.match(line, /factory answer <bead id> "<the Human's answer>"/);
});

test("the Human gates paragraph records the gate's question with factory ask", () => {
	const line = lineMatching(part("**Human gates.**"), "factory ask");
	assert.match(line, /factory ask <bead id> gate "<the question>"/);
});

test("the Human gates paragraph answers the gate with factory answer alone", () => {
	const gates = part("**Human gates.**");
	assert.match(lineMatching(gates, "factory answer"), /factory answer <run id> approve/);
	assert.doesNotMatch(gates, /archon workflow (?:approve|reject)/);
});

test("the instructions' status check lists the project's answered Asks not yet acted on", () => {
	const check = part("## When a session starts");
	assert.match(lineMatching(check, "answered Ask"), /factory asks --project \./);
});

test("the instructions' Idea to Beads steps put the Spec review on the Epic grilling opened", () => {
	const line = lineMatching(part("## From Idea to Beads"), "factory ask <epic id> spec-review");
	assert.match(line, /Spec/);
});

test("the Project Manager puts work down so cleanup is ordinary", () => {
	// Every archive is a copy an agent can lose nothing to, and scratch work that needs no
	// copy keeps the archives small (fac-iaw.1). The instructions say where scratch and
	// throwaway repos go, that landing and archon complete own branch cleanup, and that a
	// setting comes from the shell rather than from the project's .env file.
	const section = part("## Putting work down");
	assert.match(lineMatching(section, "scratch files go under"), /`\/tmp\/<task name>\/`/);
	const copies = lineMatching(section, "throwaway test repo");
	assert.match(copies, /`git clone <repo> \/tmp\/<task name>\/<name>`/);
	assert.match(copies, /never a linked worktree/);
	assert.match(copies, /git worktree remove --force/);
	assert.doesNotMatch(copies, /cp -R <repo>/);
	const branches = lineMatching(section, "branch cleanup");
	assert.match(branches, /bin\/land/);
	assert.match(branches, /archon complete/);
	const settings = lineMatching(section, "\.archon/\.env");
	assert.match(settings, /environment/);
	assert.match(settings, /`start` has already exported/);
	assert.match(settings, /`FACTORY_CHECK`/);
});

test("the Project Manager restores an archive by reading its note.md", () => {
	const section = part("## Putting work down");
	assert.match(lineMatching(section, "soft-delete"), /Nothing is refused/);
	assert.match(lineMatching(section, "~/.local/share/soft-delete/"), /one folder/);
	assert.match(lineMatching(section, "restore"), /note\.md/);
});
