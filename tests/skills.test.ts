/**
 * The Factory's own engineering skills (fac-6a7.5): tdd, codebase-design and code-review.
 * The seam is what a session loads, so the test installs the Factory on a temporary Mac and
 * reads the skill files back where pi finds them, with the fuller files each one names.
 */
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { after, before, test } from "node:test";
import { makeMac, squashProfile } from "./fixtures/install-mac.ts";

/** The three skills, by the names pi loads them under. */
const skills = ["tdd", "codebase-design", "code-review"];

/** One temporary Mac, installed once: every test below reads what install left there. */
const mac = makeMac({ profile: squashProfile });
before(() => {
	const result = mac.install();
	assert.equal(result.status, 0, result.stderr || result.stdout);
});
after(() => rmSync(dirname(mac.home), { recursive: true, force: true }));

/** One skill as the installed Factory holds it, which is what a session loads. */
const skill = (name: string): string =>
	readFileSync(join(mac.home, ".local", "share", "factory", "skills", name, "SKILL.md"), "utf8");

/** Every absolute path under the Factory's root that a skill names, as this Mac reads it. */
const namedFactoryFiles = (text: string): string[] =>
	[...text.matchAll(/~\/\.local\/share\/factory\/[^\s`'"),]+/g)].map(([path]) => join(mac.home, path.slice(2)));

test("each engineering skill names the fuller files it sends a session to read, and install puts every one in place", () => {
	for (const name of skills) {
		const named = namedFactoryFiles(skill(name));
		assert.ok(named.length > 0, `${name} names a fuller file by absolute path`);
		for (const path of named) assert.ok(existsSync(path), `${relative(mac.home, path)}, named by ${name}, is installed`);
	}
});

test("the code-review skill runs the spec review first and the standards review only after it approves", () => {
	const text = skill("code-review");
	const spec = text.indexOf("review_spec.md");
	const standards = text.indexOf("review_standards.md");
	assert.ok(spec >= 0, "the spec review's prompt is named");
	assert.ok(standards > spec, "the standards review's prompt is named after the spec review's");
	const standardsLine = text.split("\n").find((line) => line.includes("review_standards.md")) ?? "";
	assert.match(standardsLine, /only when (?:the spec review|it) approves/i);
	assert.match(text, /withheld spec review ends the review with its findings/);
	assert.match(text, /standards review does not run/);
});

test("the code-review skill runs both reviews itself when it has no sub-agents, and says so", () => {
	const line = skill("code-review")
		.split("\n")
		.find((each) => /no sub-agents/.test(each));
	assert.ok(line, "the skill says what to do with no sub-agents");
	assert.match(line, /one after the other yourself/);
	assert.match(line, /say so/);
});

test("no engineering skill names Pocock's own setup: no issue tracker, setup command, ticket or user to confirm with", () => {
	const forbidden = /issue[- ]tracker|setup-matt-pocock-skills|\btickets?\b|\busers? to confirm|confirm (?:it|them|the seam|each seam) with (?:a|the) user/i;
	for (const name of skills) assert.doesNotMatch(skill(name), forbidden, `${name} names none of it`);
});

test("install links each engineering skill into ~/.agents/skills, pointing at the Factory's copy", () => {
	for (const name of skills) {
		const link = join(mac.home, ".agents", "skills", name);
		assert.ok(lstatSync(link).isSymbolicLink(), `~/.agents/skills/${name} is a link`);
		assert.equal(
			realpathSync(link),
			realpathSync(join(mac.home, ".local", "share", "factory", "skills", name)),
			`~/.agents/skills/${name} points at the installed skill`,
		);
	}
});

test("install skips an engineering skill that is already a raw copy, and names the command that removes it", () => {
	const raw = makeMac({ profile: squashProfile });
	try {
		const copy = join(raw.home, ".agents", "skills", "tdd", "SKILL.md");
		mkdirSync(dirname(copy), { recursive: true });
		writeFileSync(copy, "# the raw copy\n");
		const result = raw.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.match(result.stderr, /skipped tdd: ~\/\.agents\/skills\/tdd is another copy; remove it with: npx skills remove -g tdd -y/);
		assert.equal(readFileSync(copy, "utf8"), "# the raw copy\n", "the raw copy is left as it is");
		assert.ok(
			lstatSync(join(raw.home, ".agents", "skills", "codebase-design")).isSymbolicLink(),
			"the other engineering skills are linked",
		);
	} finally {
		rmSync(dirname(raw.home), { recursive: true, force: true });
	}
});
