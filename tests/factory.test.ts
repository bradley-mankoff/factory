/**
 * The factory command (fac-3mz.1). An Ask is one thing waiting on the Human, held on the
 * Bead or Epic it concerns as a comment plus the `waiting-on-human` label, and `factory
 * asks` is the Mac's one list of them. The seam is the command: it runs in a temporary
 * HOME whose projects file names temporary repos, with a stand-in for the Beads CLI on
 * PATH that answers `list` and `comments` from fixtures and writes down every call.
 * Nothing here looks inside bin/factory.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const factoryCommand = join(root, "bin", "factory");

/** What the stand-in bd answers for one project: its Beads carrying the label, and each
 * one's comments in the shape `bd comments --json` prints. */
type Project = { list: { id: string }[]; comments: Record<string, { text: string }[]> };

/** The text of one Ask's comment, as `factory ask` writes it and `factory asks` reads it. */
const askComment = (kind: string, bead: string, question: string, asked: string): string =>
	[
		`Ask: ${kind}`,
		`Asked: ${asked}`,
		`How to answer: factory answer ${bead} "<your answer>"`,
		`Question: ${question}`,
	].join("\n");

type Mac = {
	dir: string;
	home: string;
	project: (name: string) => string;
	projects: (repos: string[]) => void;
	beads: (fixture: Record<string, Project>) => void;
	run: (args: string[], cwd?: string) => { status: number | null; stdout: string; stderr: string };
	calls: () => string[][];
};

/**
 * One temporary Mac: a HOME holding the projects file, project folders, and a stand-in
 * `bd` that records every call and answers `list` and `comments` from the fixture file.
 */
const makeMac = (): Mac => {
	const dir = mkdtempSync(join(tmpdir(), "factory-asks-"));
	const home = join(dir, "home");
	const bin = join(dir, "bin");
	const log = join(dir, "bd-log");
	const fixtureFile = join(dir, "beads.json");
	mkdirSync(join(home, ".config", "factory"), { recursive: true });
	mkdirSync(bin, { recursive: true });
	writeFileSync(fixtureFile, "{}\n");
	writeFileSync(
		join(bin, "bd"),
		`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.BD_LOG, JSON.stringify(args) + "\\n");
const at = args.indexOf("-C");
if (at === -1) process.exit(0);
const repo = args[at + 1];
const rest = args.slice(at + 2);
const project = JSON.parse(fs.readFileSync(process.env.BD_FIXTURE, "utf8"))[repo];
if (!project) {
	process.stderr.write("bd: no Beads database in " + repo + "\\n");
	process.exit(1);
}
if (rest[0] === "list") process.stdout.write(JSON.stringify(project.list) + "\\n");
else if (rest[0] === "comments") process.stdout.write(JSON.stringify(project.comments[rest[1]] || []) + "\\n");
`,
		{ mode: 0o755 },
	);

	const env = {
		...process.env,
		HOME: home,
		PATH: `${bin}:${process.env.PATH ?? ""}`,
		BD_LOG: log,
		BD_FIXTURE: fixtureFile,
	};
	const project = (name: string) => {
		const repo = join(dir, "projects", name);
		mkdirSync(join(repo, ".beads"), { recursive: true });
		return repo;
	};
	const projects = (repos: string[]) => writeFileSync(join(home, ".config", "factory", "projects"), `${repos.join("\n")}\n`);
	const beads = (fixture: Record<string, Project>) => writeFileSync(fixtureFile, `${JSON.stringify(fixture)}\n`);
	const run = (args: string[], cwd = home) => spawnSync(factoryCommand, args, { cwd, encoding: "utf8", env });
	const calls = () => {
		const text = existsSync(log) ? readFileSync(log, "utf8") : "";
		return text
			.split("\n")
			.filter(Boolean)
			.map((record) => JSON.parse(record) as string[]);
	};
	return { dir, home, project, projects, beads, run, calls };
};

test("factory ask puts a dated Ask on the Bead and labels it waiting on the Human", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");

		const result = mac.run(["ask", "fac-1", "decision", "Should the total round up?"], repo);
		assert.equal(result.status, 0, result.stderr);

		const calls = mac.calls();
		assert.deepEqual(calls[0].slice(0, 3), ["comments", "add", "fac-1"], "the Ask is one comment on the Bead");
		assert.deepEqual(calls[1], ["label", "add", "fac-1", "waiting-on-human"], "the Bead waits on the Human");
		const lines = calls[0][3].split("\n");
		assert.equal(lines[0], "Ask: decision", "the comment names the kind");
		assert.match(lines[1], /^Asked: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "the comment is dated");
		assert.equal(lines[2], 'How to answer: factory answer fac-1 "<your answer>"');
		assert.equal(lines[3], "Question: Should the total round up?");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("each of the three kinds is accepted and named in its Ask", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");

		assert.equal(mac.run(["ask", "fac-1", "decision", "Which total?"], repo).status, 0);
		assert.equal(mac.run(["ask", "fac-2", "grilling", "Which feeds?"], repo).status, 0);
		assert.equal(mac.run(["ask", "fac-3", "spec-review", "Is the Spec right?"], repo).status, 0);

		const kinds = mac
			.calls()
			.filter((call) => call[0] === "comments")
			.map((call) => call[3].split("\n")[0]);
		assert.deepEqual(kinds, ["Ask: decision", "Ask: grilling", "Ask: spec-review"]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("an unknown kind is refused, naming the three kinds, and the Bead is left alone", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");

		const result = mac.run(["ask", "fac-1", "taste", "Does it look right?"], repo);

		assert.notEqual(result.status, 0, "an unknown kind is refused");
		assert.match(result.stderr, /decision/, "the refusal names decision");
		assert.match(result.stderr, /grilling/, "the refusal names grilling");
		assert.match(result.stderr, /spec-review/, "the refusal names spec-review");
		assert.deepEqual(mac.calls(), [], "nothing is written to the Bead");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --json lists each open Ask with its six fields", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		const news = mac.project("news");
		mac.projects([calc, news]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }, { id: "fac-2" }],
				comments: {
					"fac-1": [{ text: askComment("decision", "fac-1", "Should the total round up?", "2026-11-18 09:05") }],
					"fac-2": [{ text: askComment("grilling", "fac-2", "Which feeds?", "2026-11-17 16:40") }],
				},
			},
			[news]: {
				list: [{ id: "news-7" }],
				comments: { "news-7": [{ text: askComment("spec-review", "news-7", "Is the Spec right?", "2026-11-18 08:15") }] },
			},
		});

		const result = mac.run(["asks", "--json"]);
		assert.equal(result.status, 0, result.stderr);

		assert.deepEqual(JSON.parse(result.stdout), [
			{
				project: "calc",
				kind: "decision",
				bead: "fac-1",
				question: "Should the total round up?",
				how_to_answer: 'factory answer fac-1 "<your answer>"',
				asked: "2026-11-18 09:05",
			},
			{
				project: "calc",
				kind: "grilling",
				bead: "fac-2",
				question: "Which feeds?",
				how_to_answer: 'factory answer fac-2 "<your answer>"',
				asked: "2026-11-17 16:40",
			},
			{
				project: "news",
				kind: "spec-review",
				bead: "news-7",
				question: "Is the Spec right?",
				how_to_answer: 'factory answer news-7 "<your answer>"',
				asked: "2026-11-18 08:15",
			},
		]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks prints each open Ask's project, Bead, kind, question, answer and date", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		mac.projects([calc]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }],
				comments: { "fac-1": [{ text: askComment("decision", "fac-1", "Should the total round up?", "2026-11-18 09:05") }] },
			},
		});

		const result = mac.run(["asks"]);
		assert.equal(result.status, 0, result.stderr);

		assert.deepEqual(result.stdout.split("\n").filter(Boolean), [
			"calc  fac-1  decision  asked 2026-11-18 09:05",
			"  Should the total round up?",
			'  How to answer: factory answer fac-1 "<your answer>"',
		]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --project limits the list to one project's Asks", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		const news = mac.project("news");
		mac.projects([calc, news]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }],
				comments: { "fac-1": [{ text: askComment("decision", "fac-1", "Which total?", "2026-11-18 09:05") }] },
			},
			[news]: {
				list: [{ id: "news-7" }],
				comments: { "news-7": [{ text: askComment("grilling", "news-7", "Which feeds?", "2026-11-17 16:40") }] },
			},
		});

		const result = mac.run(["asks", "--json", "--project", news]);
		assert.equal(result.status, 0, result.stderr);

		assert.deepEqual(JSON.parse(result.stdout), [
			{
				project: "news",
				kind: "grilling",
				bead: "news-7",
				question: "Which feeds?",
				how_to_answer: 'factory answer news-7 "<your answer>"',
				asked: "2026-11-17 16:40",
			},
		]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a project with no open Asks and a project folder that is gone list nothing and do not fail", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		mac.projects([calc, join(mac.dir, "projects", "deleted")]);
		mac.beads({ [calc]: { list: [], comments: {} } });

		const text = mac.run(["asks"]);
		assert.equal(text.status, 0, text.stderr);
		assert.equal(text.stdout, "", "nothing is printed");

		const json = mac.run(["asks", "--json"]);
		assert.equal(json.status, 0, json.stderr);
		assert.deepEqual(JSON.parse(json.stdout), [], "the JSON list is empty");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});
