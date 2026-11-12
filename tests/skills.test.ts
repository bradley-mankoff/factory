/**
 * The Factory's own engineering skills (fac-6a7.5): tdd, codebase-design and code-review.
 * The seam is what a session loads, so the test installs the Factory on a temporary Mac and
 * reads the skill files back where pi finds them, with the fuller files each one names.
 */
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { makeMac, repoRoot, squashProfile } from "./fixtures/install-mac.ts";

/** The three skills, by the names pi loads them under. */
const skillNames = ["tdd", "codebase-design", "code-review"];

/** One temporary Mac, installed once: every test below reads what install left there. */
const mac = makeMac({ profile: squashProfile });
before(() => {
	const result = mac.install();
	assert.equal(result.status, 0, result.stderr || result.stdout);
});
after(() => rmSync(dirname(mac.home), { recursive: true, force: true }));

/** One skill as the installed Factory holds it, which is what a session loads. */
const installedSkill = (name: string): string =>
	readFileSync(join(mac.home, ".local", "share", "factory", "skills", name, "SKILL.md"), "utf8");

/** Every absolute path under the Factory's root that a skill names, as this Mac reads it. */
const namedFactoryFiles = (text: string): string[] =>
	[...text.matchAll(/~\/\.local\/share\/factory\/[^\s`'"),]+/g)].map(([path]) =>
		join(mac.home, path.slice("~/".length)),
	);

/** The first line of a skill that contains the text, so a rule is checked where it is stated. */
const lineContaining = (text: string, needle: string): string => {
	const line = text.split("\n").find((each) => each.includes(needle));
	assert.ok(line, `a line of the skill contains ${needle}`);
	return line;
};

test("each engineering skill names only files that install puts in place", () => {
	for (const name of skillNames) {
		const named = namedFactoryFiles(installedSkill(name));
		assert.ok(named.length > 0, `${name} names a fuller file by absolute path`);
		for (const path of named) assert.ok(existsSync(path), `${relative(mac.home, path)}, named by ${name}, is installed`);
	}
});

test("the code-review skill runs the spec review first and the standards review only after it approves", () => {
	const text = installedSkill("code-review");
	const spec = text.indexOf("review_spec.md");
	const standards = text.indexOf("review_standards.md");
	assert.ok(spec >= 0, "the spec review's prompt is named");
	assert.ok(standards > spec, "the standards review's prompt is named after the spec review's");
	assert.match(lineContaining(text, "review_standards.md"), /only when the spec review approves/i);
	assert.match(text, /withheld spec review ends the review with its findings/);
	assert.match(text, /standards review does not run/);
});

test("the code-review skill runs both reviews itself when it has no sub-agents, and says so", () => {
	const line = lineContaining(installedSkill("code-review"), "no sub-agents");
	assert.match(line, /one after the other yourself/);
	assert.match(line, /say so/);
});

test("no engineering skill names Pocock's own setup: no issue tracker, setup command, ticket or user to confirm with", () => {
	const forbidden = /issue[- ]tracker|setup-matt-pocock-skills|\btickets?\b|\busers? to confirm|confirm (?:it|them|the seam|each seam) with (?:a|the) user/i;
	for (const name of skillNames) assert.doesNotMatch(installedSkill(name), forbidden, `${name} names none of it`);
});

test("install links each engineering skill into ~/.agents/skills, pointing at the Factory's copy", () => {
	for (const name of skillNames) {
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

/** The two folders the Factory ships skills in: pi's own, and FactoryClaw's (fac-p3z). */
const skillFolders = ["skills", "factoryclaw/skills"];

// pi and OpenClaw both parse a skill's front matter as YAML and refuse the skill when it
// fails, so a plain description holding ": " (a nested mapping) hides the skill from every
// session (fac-6a7.5's first release, seen as a plain pi session's Skill conflicts). install
// copies each folder whole, so the shipped file is the one a session loads. Node has no YAML
// parser, so the test borrows Bun's, which Archon needs anyway.
test("every Factory skill's front matter parses as YAML with a name and a description", () => {
	for (const folder of skillFolders) {
		for (const skill of readdirSync(join(repoRoot, folder))) {
			const file = join(repoRoot, folder, skill, "SKILL.md");
			if (!existsSync(file)) continue;
			const frontMatter = readFileSync(file, "utf8").split(/^---$/m)[1];
			const parsed = spawnSync("bun", ["-e", "const m = Bun.YAML.parse(await Bun.stdin.text()); console.log(JSON.stringify(m))"], { input: frontMatter, encoding: "utf8" });
			assert.equal(parsed.status, 0, `${folder}/${skill}: ${parsed.stderr}`);
			const meta = JSON.parse(parsed.stdout);
			assert.equal(meta.name, skill);
			assert.ok(meta.description, `${folder}/${skill} has no description`);
		}
	}
});
