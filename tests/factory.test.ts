/**
 * The factory command (fac-3mz.1 to fac-3mz.4). An Ask is one thing waiting on the Human,
 * held on the Bead or Epic it concerns as a comment plus the `waiting-on-human` label,
 * turned into `answered` by `factory answer`, and `factory asks` is the Mac's one list of
 * them. The seam is the command: it runs in a temporary HOME whose projects file names
 * temporary repos, with a stand-in for the Beads CLI on PATH that answers `list`,
 * `comments` and `label list` from fixtures and writes down every call, and that a test
 * can tell to refuse a verb the way bd refuses a mistyped Bead. A stand-in for Archon on
 * PATH answers `workflow attention` and `workflow get` from fixtures, writes down every
 * call in the folder it ran in, and accepts `workflow approve` and `workflow reject`. A
 * Notice lands in the temporary HOME's notices folder, written by the real bin/tell-pm.
 * Nothing here looks inside bin/factory.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const factoryCommand = join(root, "bin", "factory");

/** What the stand-in bd answers for one project: its Beads, each one's comments in the
 * shape `bd comments --json` prints and each one's labels in the shape `bd label list
 * --json` prints. `list` filters by the `--label` it is given from `labels`, so a labelled
 * Bead answers only the query for its own label, and leaves `closed` Beads out unless
 * `--all` is given, as bd does. A project carrying a warning has bd print that line on
 * stdout instead of its JSON, as a bd with a broken setup does. */
type Project = {
	list: { id: string }[];
	comments: Record<string, { text: string }[]>;
	labels?: Record<string, string[]>;
	closed?: string[];
	warning?: string;
};

/** The text of one Ask's comment, as `factory ask` writes it and `factory asks` reads it. */
const askComment = (kind: string, bead: string, question: string, asked: string): string =>
	[
		`Ask: ${kind}`,
		`Asked: ${asked}`,
		`How to answer: factory answer ${bead} "<your answer>"`,
		`Question: ${question}`,
	].join("\n");

/** One paused Human gate as the stand-in Archon reports it, and the Run behind it. */
type Gate = { runId: string; message: string; pausedAt: string; kind: string; form: string };
type ArchonRun = { user_message: string };
type ArchonProject = { items: Gate[]; runs?: Record<string, ArchonRun> };

type Mac = {
	dir: string;
	project: (name: string) => string;
	projects: (repos: string[]) => void;
	/** Writes a project's uncommitted `.archon/.env`, one KEY=value line per entry. */
	projectEnv: (repo: string, lines: string[]) => void;
	beads: (fixture: Record<string, Project>) => void;
	/** Writes what the stand-in Archon answers for each project: its paused gates and the
	 * Runs behind them, keyed the way the stand-in resolves the folder it runs in. */
	archon: (fixture: Record<string, ArchonProject>) => void;
	/** Makes the stand-in bd refuse these verbs, as bd refuses a Bead it cannot find. */
	failOn: (verbs: string[]) => void;
	/** Writes the Mac's Profile, the file install ships and factory reads. */
	profile: (lines: string[]) => void;
	/** Writes a stub connector program on PATH, which records the Ask it is given and then
	 * accepts it, or refuses with `failure`, or hangs until factory ask gives up on it. */
	connector: (name: string, options?: { failure?: string; hang?: boolean }) => void;
	/** Sets an environment variable for every factory command run from now on. */
	setEnv: (values: Record<string, string>) => void;
	run: (
		args: string[],
		cwd?: string,
		options?: { timeout?: number },
	) => { status: number | null; stdout: string; stderr: string };
	calls: () => string[][];
	/** Every call the stand-in Archon answered, with the folder it ran in. */
	archonCalls: () => { args: string[]; cwd: string }[];
	/** Every Ask the stub connector programs were given. */
	connectorCalls: () => { name: string; ask: Record<string, unknown> }[];
	/** Every call the stand-in openclaw answered. */
	openclawCalls: () => string[][];
	/** One Project Manager's Notice file as written, or nothing when it has none. */
	notice: (pane: string) => string;
	/** The Notice files the Mac holds, by Project Manager. */
	notices: () => string[];
};

/** The calls that write to Beads, as opposed to the calls that read them. */
const bdWrites = (mac: Mac) =>
	mac.calls().filter((call) => (call[0] === "comments" && call[1] === "add") || (call[0] === "label" && call[1] !== "list"));

/** Writes a fixture keyed by folder, with each key resolved the way the stand-in resolves
 * the folder it runs in: on a Mac whose /var is a link to /private/var. */
const writeFixture = (file: string, fixture: Record<string, unknown>) => {
	const resolved = Object.entries(fixture).map(([repo, values]) => [realpathSync(repo), values] as const);
	writeFileSync(file, `${JSON.stringify(Object.fromEntries(resolved))}\n`);
};

/** Makes a folder a real git repo with one commit, so a linked worktree can be added of it.
 * The commit carries an identity of its own, so the test never borrows the Mac's. */
const gitRepo = (repo: string) => {
	const git = (...args: string[]) => {
		const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
	};
	git("init", "--quiet");
	git(
		"-c",
		"user.name=Factory Test",
		"-c",
		"user.email=factory-test@example.com",
		"commit",
		"--quiet",
		"--allow-empty",
		"-m",
		"first commit",
	);
};

/** Adds a linked worktree of the repo at the folder, which git leaves out of the repo's own
 * folder, the way a Run's worktree sits beside its main checkout. */
const linkedWorktree = (repo: string, folder: string) => {
	const result = spawnSync("git", ["-C", repo, "worktree", "add", "--quiet", "--detach", folder], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
};

/** The JSON lines one stand-in tool wrote, as the values it recorded. */
const readRecords = (file: string) => {
	const text = existsSync(file) ? readFileSync(file, "utf8") : "";
	return text
		.split("\n")
		.filter(Boolean)
		.map((record) => JSON.parse(record) as unknown);
};

/**
 * One temporary Mac: a HOME holding the projects file, project folders, and a stand-in
 * `bd` that records every call, answers `list`, `comments` and `label list` from the
 * fixture file, and refuses the verbs a test names in `failOn`.
 */
const makeMac = (): Mac => {
	const dir = mkdtempSync(join(tmpdir(), "factory-asks-"));
	const home = join(dir, "home");
	const bin = join(dir, "bin");
	const log = join(dir, "bd-log");
	const fixtureFile = join(dir, "beads.json");
	const archonLog = join(dir, "archon-log");
	const archonFixture = join(dir, "archon.json");
	const connectorLog = join(dir, "connector-log");
	const openclawLog = join(dir, "openclaw-log");
	mkdirSync(join(home, ".config", "factory"), { recursive: true });
	mkdirSync(bin, { recursive: true });
	writeFileSync(fixtureFile, "{}\n");
	writeFileSync(archonFixture, "{}\n");
	writeFileSync(
		join(bin, "bd"),
		`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.BD_LOG, JSON.stringify(args) + "\\n");
const at = args.indexOf("-C");
const repo = fs.realpathSync(at === -1 ? process.cwd() : args[at + 1]);
const rest = at === -1 ? args : args.slice(at + 2);
const verb = rest[0];
if ((process.env.BD_FAIL || "").split(",").includes(verb)) {
	process.stderr.write("bd: error: no Bead matches '" + (rest[2] || verb) + "'\\n");
	process.exit(1);
}
const reads = verb === "list" || (verb === "comments" && rest[1] !== "add") || (verb === "label" && rest[1] === "list");
if (!reads) process.exit(0);
const project = JSON.parse(fs.readFileSync(process.env.BD_FIXTURE, "utf8"))[repo];
if (!project) {
	process.stderr.write("bd: no Beads database in " + repo + "\\n");
	process.exit(1);
}
if (project.warning) {
	process.stdout.write(project.warning + "\\n");
} else if (verb === "list") {
	const flag = rest.indexOf("--label");
	const label = flag === -1 ? null : rest[flag + 1];
	const labels = project.labels || {};
	const closed = project.closed || [];
	const listed = project.list.filter((bead) => {
		if (!rest.includes("--all") && closed.includes(bead.id)) return false;
		return !label || !project.labels || (labels[bead.id] || []).includes(label);
	});
	process.stdout.write(JSON.stringify(listed) + "\\n");
} else if (verb === "comments") {
	process.stdout.write(JSON.stringify(project.comments[rest[1]] || []) + "\\n");
} else if (verb === "label") {
	process.stdout.write(JSON.stringify((project.labels || {})[rest[2]] || []) + "\\n");
}
`,
		{ mode: 0o755 },
	);

	writeFileSync(
		join(bin, "openclaw"),
		`#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.OPENCLAW_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
`,
		{ mode: 0o755 },
	);

	writeFileSync(
		join(bin, "archon"),
		`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.ARCHON_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
const shown = JSON.parse(fs.readFileSync(process.env.ARCHON_FIXTURE, "utf8"));
const project = shown[fs.realpathSync(process.cwd())] || {};
const sub = args[1];
const rest = args.slice(2);
if (sub === "attention" && rest[0] && !rest[0].startsWith("--")) {
	const run = rest[0];
	const item = (project.items || []).find((one) => one.runId === run);
	if (item) {
		process.stdout.write(JSON.stringify({ ok: true, action: "attention", runId: run, item }) + "\\n");
	} else if ((project.runs || {})[run]) {
		process.stdout.write(JSON.stringify({ ok: true, action: "attention", runId: run, item: null }) + "\\n");
	} else {
		process.stdout.write(JSON.stringify({ ok: false, action: "attention", runId: run, error: "not_found" }) + "\\n");
		process.exit(1);
	}
} else if (sub === "attention") {
	process.stdout.write(JSON.stringify({ ok: true, action: "attention", scope: { kind: "project" }, items: project.items || [] }) + "\\n");
} else if (sub === "get") {
	const run = (project.runs || {})[rest[0]];
	if (!run) {
		process.stderr.write("Workflow run not found\\n");
		process.exit(1);
	}
	process.stdout.write(JSON.stringify(run) + "\\n");
} else if (sub === "approve" || sub === "reject") {
	process.stdout.write("accepted\\n");
} else {
	process.stderr.write("archon: no such command\\n");
	process.exit(2);
}
`,
		{ mode: 0o755 },
	);

	const env = {
		...process.env,
		HOME: home,
		PATH: `${bin}:${process.env.PATH ?? ""}`,
		TZ: "UTC",
		BD_LOG: log,
		BD_FIXTURE: fixtureFile,
		BD_FAIL: "",
		ARCHON_LOG: archonLog,
		ARCHON_FIXTURE: archonFixture,
		CONNECTOR_LOG: connectorLog,
		OPENCLAW_LOG: openclawLog,
	};
	// The project's .archon/.env is the one place a pane is named, so a test never inherits
	// the pane of the shell it runs in.
	delete env.FACTORY_PM_AGENT;
	const project = (name: string) => {
		const repo = join(dir, "projects", name);
		mkdirSync(join(repo, ".beads"), { recursive: true });
		return repo;
	};
	const projects = (repos: string[]) => writeFileSync(join(home, ".config", "factory", "projects"), `${repos.join("\n")}\n`);
	const projectEnv = (repo: string, lines: string[]) => {
		mkdirSync(join(repo, ".archon"), { recursive: true });
		writeFileSync(join(repo, ".archon", ".env"), `${lines.join("\n")}\n`);
	};
	// The keys are resolved the way the stand-in bd resolves the folder it is asked about,
	// which is the real path on a Mac whose /var is a link to /private/var.
	const beads = (fixture: Record<string, Project>) => {
		writeFixture(fixtureFile, fixture);
	};
	const archon = (fixture: Record<string, ArchonProject>) => {
		writeFixture(archonFixture, fixture);
	};
	const failOn = (verbs: string[]) => {
		env.BD_FAIL = verbs.join(",");
	};
	const profile = (lines: string[]) => {
		writeFileSync(join(home, ".config", "factory", "profile"), `${lines.join("\n")}\n`);
	};
	const connector = (name: string, options: { failure?: string; hang?: boolean } = {}) => {
		let ending = "";
		if (options.failure) ending = `process.stderr.write(${JSON.stringify(`${options.failure}\n`)}); process.exit(1);`;
		else if (options.hang) ending = "setInterval(() => {}, 1000);";
		writeFileSync(
			join(bin, `factory-connector-${name}`),
			`#!/usr/bin/env node
const fs = require("node:fs");
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
	fs.appendFileSync(process.env.CONNECTOR_LOG, JSON.stringify({ name: ${JSON.stringify(name)}, ask: JSON.parse(input) }) + "\\n");
	${ending}
});
`,
			{ mode: 0o755 },
		);
	};
	const setEnv = (values: Record<string, string>) => Object.assign(env, values);
	const run = (args: string[], cwd = home, options: { timeout?: number } = {}) =>
		spawnSync(factoryCommand, args, { cwd, encoding: "utf8", env, ...options });
	const calls = () => readRecords(log) as string[][];
	const archonCalls = () => readRecords(archonLog) as { args: string[]; cwd: string }[];
	const connectorCalls = () => readRecords(connectorLog) as { name: string; ask: Record<string, unknown> }[];
	const openclawCalls = () => readRecords(openclawLog) as string[][];
	const noticesDir = join(home, ".local", "share", "factory", "notices");
	const notice = (pane: string) => {
		const file = join(noticesDir, `${pane}.md`);
		return existsSync(file) ? readFileSync(file, "utf8") : "";
	};
	const notices = () => (existsSync(noticesDir) ? readdirSync(noticesDir) : []);
	return {
		dir,
		project,
		projects,
		projectEnv,
		beads,
		archon,
		failOn,
		profile,
		connector,
		setEnv,
		run,
		calls,
		archonCalls,
		connectorCalls,
		openclawCalls,
		notice,
		notices,
	};
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

test("each of the three kinds held on Beads is accepted and named in its Ask", () => {
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

test("an unknown kind is refused, naming the kinds, and the Bead is left alone", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");

		const result = mac.run(["ask", "fac-1", "taste", "Does it look right?"], repo);

		assert.notEqual(result.status, 0, "an unknown kind is refused");
		assert.match(result.stderr, /decision/, "the refusal names decision");
		assert.match(result.stderr, /grilling/, "the refusal names grilling");
		assert.match(result.stderr, /spec-review/, "the refusal names spec-review");
		assert.match(result.stderr, /gate/, "the refusal names gate");
		assert.deepEqual(mac.calls(), [], "nothing is written to the Bead");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --json lists each open Ask with its seven fields", () => {
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
				status: "open",
				question: "Should the total round up?",
				how_to_answer: 'factory answer fac-1 "<your answer>"',
				asked: "2026-11-18 09:05",
			},
			{
				project: "calc",
				kind: "grilling",
				bead: "fac-2",
				status: "open",
				question: "Which feeds?",
				how_to_answer: 'factory answer fac-2 "<your answer>"',
				asked: "2026-11-17 16:40",
			},
			{
				project: "news",
				kind: "spec-review",
				bead: "news-7",
				status: "open",
				question: "Is the Spec right?",
				how_to_answer: 'factory answer news-7 "<your answer>"',
				asked: "2026-11-18 08:15",
			},
		]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks prints each open Ask's project, Bead, kind, status, question, answer and date", () => {
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
			"calc  fac-1  decision  open  asked 2026-11-18 09:05",
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
				status: "open",
				question: "Which feeds?",
				how_to_answer: 'factory answer news-7 "<your answer>"',
				asked: "2026-11-17 16:40",
			},
		]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --project lists a project's Asks from a linked worktree, as from its main checkout", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		gitRepo(calc);
		const worktree = join(mac.dir, "worktrees", "calc-build");
		linkedWorktree(calc, worktree);
		// The projects file names the main checkout, as a Mac whose Profile lands Runs in
		// worktrees does, so the worktree itself is not a project on its own.
		mac.projects([calc]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }],
				comments: { "fac-1": [{ text: askComment("decision", "fac-1", "Which total?", "2026-11-18 09:05") }] },
			},
		});

		const result = mac.run(["asks", "--json", "--project", worktree]);
		assert.equal(result.status, 0, result.stderr);

		assert.deepEqual(JSON.parse(result.stdout), [
			{
				project: "calc",
				kind: "decision",
				bead: "fac-1",
				status: "open",
				question: "Which total?",
				how_to_answer: 'factory answer fac-1 "<your answer>"',
				asked: "2026-11-18 09:05",
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

test("factory ask fails with a factory: line naming the Bead when bd refuses the comment", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.failOn(["comments"]);

		const result = mac.run(["ask", "fac-nope", "decision", "Which total?"], repo);

		assert.notEqual(result.status, 0, "the command fails with bd");
		assert.match(result.stderr, /^factory: .*fac-nope/m, "the failure names the Bead");
		assert.doesNotMatch(result.stderr, /Traceback/, "the command reports in its own words");
		assert.deepEqual(
			mac.calls().filter((call) => call[0] !== "comments"),
			[],
			"a Bead with no Ask comment is not labelled",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks skips a project whose bd answer is not JSON and still lists the rest", () => {
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
			[news]: { list: [], comments: {}, warning: "bd: warning: no database yet" },
		});

		const result = mac.run(["asks", "--json"]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			JSON.parse(result.stdout).map((ask: { bead: string }) => ask.bead),
			["fac-1"],
			"the project bd could not answer for contributes nothing",
		);
		assert.match(result.stderr, /news/, "the skipped project is named");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --project takes the repo to run in, so --project . finds that repo", () => {
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

		const result = mac.run(["asks", "--json", "--project", "."], news);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			JSON.parse(result.stdout).map((ask: { bead: string }) => ask.bead),
			["news-7"],
			"the repo the command runs in is the one project listed",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory answer refuses a Bead whose Ask is no longer open, and writes nothing", () => {
	// The Bead carries `answered`, the state after the Human's first answer, so a late relay
	// or a second tap is refused rather than recording the words twice (fac-3mz.2).
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.beads({ [repo]: { list: [], comments: {}, labels: { "fac-1": ["answered"] } } });

		const result = mac.run(["answer", "fac-1", "Yes, round up."], repo);

		assert.notEqual(result.status, 0, "the answer is refused");
		assert.match(result.stderr, /fac-1/, "the refusal names the Bead");
		assert.match(result.stderr, /open Ask/, "the refusal says the Ask is not open");
		assert.deepEqual(bdWrites(mac), [], "nothing is written to the Bead");
		assert.deepEqual(mac.notices(), [], "the Project Manager is told nothing");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory answer records the Human's words on the Bead as one dated comment", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.beads({ [repo]: { list: [], comments: {}, labels: { "fac-1": ["waiting-on-human"] } } });

		// A shell that does not quote the answer still records all of it.
		const result = mac.run(["answer", "fac-1", "Yes,", "round", "up."], repo);

		assert.equal(result.status, 0, result.stderr);
		const comment = bdWrites(mac).find((call) => call[0] === "comments" && call[1] === "add");
		assert.ok(comment, "the answer is one comment on the Bead");
		assert.deepEqual(comment.slice(0, 3), ["comments", "add", "fac-1"], "the comment goes on that Bead");
		assert.match(comment[3], /^The Human's answer, \d{4}-\d{2}-\d{2} \d{2}:\d{2}: Yes, round up\.$/);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory answer replaces the Ask's waiting-on-human label with answered", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.beads({ [repo]: { list: [], comments: {}, labels: { "fac-1": ["waiting-on-human"] } } });

		const result = mac.run(["answer", "fac-1", "Yes, round up."], repo);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			bdWrites(mac).filter((call) => call[0] === "label"),
			[
				["label", "remove", "fac-1", "waiting-on-human"],
				["label", "add", "fac-1", "answered"],
			],
			"the Bead stops waiting on the Human and shows the Ask answered",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory answer leaves one Notice line naming the project, the Bead and the answer", () => {
	// The run happens in the project folder, as a screen or a Project Manager does, so the
	// pane's Notice file is the one the project's .archon/.env names (fac-3mz.2).
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.projectEnv(repo, ["FACTORY_CHECK=scripts/check", "FACTORY_PM_AGENT=pm-calc"]);
		mac.beads({ [repo]: { list: [], comments: {}, labels: { "fac-1": ["waiting-on-human"] } } });

		const result = mac.run(["answer", "fac-1", "Yes, round up."], repo);

		assert.equal(result.status, 0, result.stderr);
		const lines = mac.notice("pm-calc").split("\n").filter(Boolean);
		assert.equal(lines.length, 1, "the answer is one Notice, as a Run's ending is");
		assert.match(lines[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} The Human answered Ask fac-1 in calc: Yes, round up\.$/);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("an answer whose project names no pane is still recorded, and the missing Notice is reported", () => {
	// The answer is state first: a project whose .archon/.env names no pane loses the
	// Notice, never the answer (fac-3mz.2).
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.beads({ [repo]: { list: [], comments: {}, labels: { "fac-1": ["waiting-on-human"] } } });

		const result = mac.run(["answer", "fac-1", "Yes, round up."], repo);

		assert.notEqual(result.status, 0, "the missing Notice is reported");
		assert.match(result.stderr, /recorded the Human's answer/, "the report says the answer is in state");
		assert.match(result.stderr, /FACTORY_PM_AGENT/, "the report names what the project is missing");
		assert.ok(
			bdWrites(mac).some((call) => call[0] === "comments" && call[1] === "add"),
			"the answer is on the Bead",
		);
		assert.deepEqual(mac.notices(), [], "no Notice file is left");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks lists an answered Ask with its status beside the open ones", () => {
	// An answered Ask whose Notice was lost still shows here until its Project Manager acts
	// and removes the label, so no answer waits on a Notice (fac-3mz.2).
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		mac.projects([calc]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }, { id: "fac-2" }],
				comments: {
					"fac-1": [{ text: askComment("decision", "fac-1", "Should the total round up?", "2026-11-18 09:05") }],
					"fac-2": [{ text: askComment("grilling", "fac-2", "Which feeds?", "2026-11-17 16:40") }],
				},
				labels: { "fac-1": ["waiting-on-human"], "fac-2": ["answered"] },
			},
		});

		const result = mac.run(["asks"]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(result.stdout.split("\n").filter(Boolean), [
			"calc  fac-1  decision  open  asked 2026-11-18 09:05",
			"  Should the total round up?",
			'  How to answer: factory answer fac-1 "<your answer>"',
			"calc  fac-2  grilling  answered  asked 2026-11-17 16:40",
			"  Which feeds?",
			'  How to answer: factory answer fac-2 "<your answer>"',
		]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --open leaves the answered Asks out", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		mac.projects([calc]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }, { id: "fac-2" }],
				comments: {
					"fac-1": [{ text: askComment("decision", "fac-1", "Should the total round up?", "2026-11-18 09:05") }],
					"fac-2": [{ text: askComment("grilling", "fac-2", "Which feeds?", "2026-11-17 16:40") }],
				},
				labels: { "fac-1": ["waiting-on-human"], "fac-2": ["answered"] },
			},
		});

		const result = mac.run(["asks", "--json", "--open"]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			JSON.parse(result.stdout).map((ask: { bead: string }) => ask.bead),
			["fac-1"],
			"only the Ask still waiting on the Human is listed",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

/** A paused Human gate as Archon reports it: the approval wait, its question and when it paused. */
const gate = (runId: string, message: string, pausedAt: string): Gate => ({
	kind: "attention",
	form: "approval",
	runId,
	message,
	pausedAt,
});

test("factory asks --json lists a paused Human gate in every project with its Bead from the Run's message", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		const news = mac.project("news");
		mac.projects([calc, news]);
		mac.beads({ [calc]: { list: [], comments: {} }, [news]: { list: [], comments: {} } });
		mac.archon({
			[calc]: {
				items: [gate("f0a1", "Taste and fit: does the total widget look right?", "2026-11-18T18:51:09.649Z")],
				runs: { f0a1: { user_message: "pm-calc · fac-1" } },
			},
			[news]: {
				items: [gate("b2c3", "Taste and fit: does the feed look right?", "2026-11-18T09:05:00.000Z")],
				runs: { b2c3: { user_message: "pm-news · news-7" } },
			},
		});

		const result = mac.run(["asks", "--json"]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(result.stdout), [
			{
				project: "calc",
				kind: "gate",
				bead: "fac-1",
				run: "f0a1",
				status: "open",
				question: "Taste and fit: does the total widget look right?",
				how_to_answer: 'factory answer f0a1 approve, or factory answer f0a1 reject "<your words>"',
				asked: "2026-11-18 18:51",
			},
			{
				project: "news",
				kind: "gate",
				bead: "news-7",
				run: "b2c3",
				status: "open",
				question: "Taste and fit: does the feed look right?",
				how_to_answer: 'factory answer b2c3 approve, or factory answer b2c3 reject "<your words>"',
				asked: "2026-11-18 09:05",
			},
		]);
		assert.deepEqual(
			mac
				.archonCalls()
				.filter((call) => call.args.slice(0, 3).join(" ") === "workflow attention --json")
				.map((call) => call.cwd),
			[realpathSync(calc), realpathSync(news)],
			"each project's attention queue is read in that project's folder",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory answer approves a gate in Archon, comments the answer on its Bead and tells the Project Manager", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.beads({ [repo]: { list: [], comments: {} } });
		mac.archon({
			[repo]: {
				items: [gate("run-a", "Taste and fit: does the total widget look right?", "2026-11-18T18:51:09.649Z")],
				runs: { "run-a": { user_message: "pm-calc · fac-1" } },
			},
		});

		const result = mac.run(["answer", "run-a", "approve"], repo);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			mac.archonCalls().map((call) => call.args),
			[
				["workflow", "attention", "run-a", "--json"],
				["workflow", "get", "run-a", "--json"],
				["workflow", "approve", "run-a", "--detach"],
			],
			"Archon is asked whether the gate still waits, which Bead it names, and then to approve it",
		);
		const comment = bdWrites(mac).find((call) => call[0] === "comments" && call[1] === "add");
		assert.ok(comment, "the answer is a comment on the Run's Bead");
		assert.deepEqual(comment.slice(0, 3), ["comments", "add", "fac-1"], "the comment goes on the Bead the Run's message names");
		assert.match(comment[3], /^The Human's answer, \d{4}-\d{2}-\d{2} \d{2}:\d{2}: approved gate Run run-a$/);
		assert.match(
			mac.notice("pm-calc").trim(),
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} The Human answered Ask fac-1 in calc: approved gate Run run-a$/,
			"the Project Manager reads the gate's answer",
		);
		assert.equal(
			bdWrites(mac).filter((call) => call[0] === "label").length,
			0,
			"a gate has no answered label: Archon's queue is its state",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory answer rejects a gate with the Human's words as Archon's reason, and records them", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.beads({ [repo]: { list: [], comments: {} } });
		mac.archon({
			[repo]: {
				items: [gate("run-a", "Taste and fit: does the total widget look right?", "2026-11-18T18:51:09.649Z")],
				runs: { "run-a": { user_message: "pm-calc · fac-1" } },
			},
		});

		// A shell that does not quote the reason still sends all of it.
		const result = mac.run(["answer", "run-a", "reject", "The", "title", "is", "too", "big"], repo);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			mac.archonCalls().map((call) => call.args).filter((args) => args[1] !== "attention" && args[1] !== "get"),
			[["workflow", "reject", "run-a", "--reason", "The title is too big", "--detach"]],
			"Archon records the Human's own words as the reason the Run goes back",
		);
		const comment = bdWrites(mac).find((call) => call[0] === "comments" && call[1] === "add");
		assert.ok(comment, "the answer is a comment on the Run's Bead");
		assert.match(comment[3], /^The Human's answer, \d{4}-\d{2}-\d{2} \d{2}:\d{2}: rejected gate Run run-a: The title is too big$/);
		assert.match(
			mac.notice("pm-calc").trim(),
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} The Human answered Ask fac-1 in calc: rejected gate Run run-a: The title is too big$/,
			"the Project Manager reads the rejection and its words",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory answer refuses a gate Archon no longer lists and runs no approve or reject", () => {
	// A gate is done when Archon no longer lists it, so a late or repeated answer is
	// refused and writes nothing (fac-3mz.3).
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.beads({ [repo]: { list: [], comments: {} } });
		mac.archon({ [repo]: { items: [], runs: { "run-a": { user_message: "pm-calc · fac-1" } } } });

		const result = mac.run(["answer", "run-a", "approve"], repo);

		assert.notEqual(result.status, 0, "the answer is refused");
		assert.match(result.stderr, /run-a/, "the refusal names the Run");
		assert.match(result.stderr, /no longer waits/, "the refusal says the gate is gone");
		assert.deepEqual(
			mac.archonCalls().map((call) => call.args).filter((args) => args[1] === "approve" || args[1] === "reject"),
			[],
			"no answer reaches Archon",
		);
		assert.deepEqual(bdWrites(mac), [], "nothing is written to the Bead");
		assert.deepEqual(mac.notices(), [], "the Project Manager is told nothing");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory answer still answers a Bead whose words begin with approve, because a Bead id names no Run", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.beads({ [repo]: { list: [], comments: {}, labels: { "fac-1": ["waiting-on-human"] } } });

		const result = mac.run(["answer", "fac-1", "approve", "the", "plan", "as", "written"], repo);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			mac.archonCalls().map((call) => call.args),
			[["workflow", "attention", "fac-1", "--json"]],
			"Archon is asked whether the id is a Run, and it is not",
		);
		const comment = bdWrites(mac).find((call) => call[0] === "comments" && call[1] === "add");
		assert.ok(comment, "the answer is recorded on the Bead");
		assert.match(comment[3], /^The Human's answer, \d{4}-\d{2}-\d{2} \d{2}:\d{2}: approve the plan as written$/);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory ask records a gate's question on the Bead without the waiting-on-human label", () => {
	// The gate waits in Archon's queue, so its record on the Bead carries no label that
	// would make factory asks read a second, stale copy of it (fac-3mz.3).
	const mac = makeMac();
	try {
		const repo = mac.project("calc");

		const result = mac.run(["ask", "fac-1", "gate", "Taste and fit: does the total widget look right?"], repo);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			mac.calls().map((call) => call.slice(0, 2)),
			[["comments", "add"]],
			"the question is recorded as one comment and no label is added",
		);
		const lines = mac.calls()[0][3].split("\n");
		assert.equal(lines[0], "Ask: gate", "the comment names the gate");
		assert.match(lines[1], /^Asked: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "the record is dated");
		assert.equal(lines[2], "Question: Taste and fit: does the total widget look right?");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory ask tells each connector the Profile names the Ask as JSON", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.profile(["CONNECTORS=first second"]);
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.connector("first");
		mac.connector("second");

		const result = mac.run(["ask", "fac-1", "decision", "Should the total round up?"], repo);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			mac.connectorCalls().map((call) => call.name),
			["first", "second"],
			"each connector the Profile names is told, in its order",
		);
		const ask = mac.connectorCalls()[0].ask;
		assert.deepEqual(
			{
				project: ask.project,
				repo: ask.repo,
				pane: ask.pane,
				kind: ask.kind,
				bead: ask.bead,
				question: ask.question,
				how_to_answer: ask.how_to_answer,
			},
			{
				project: "calc",
				repo: realpathSync(repo),
				pane: "pm-calc",
				kind: "decision",
				bead: "fac-1",
				question: "Should the total round up?",
				how_to_answer: 'factory answer fac-1 "<your answer>"',
			},
			"the connector is told the Ask, its project and its Project Manager's pane",
		);
		assert.match(String(ask.asked), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "the connector is told when the Ask was asked");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a Profile without CONNECTORS tells factoryclaw when FactoryClaw is the outer layer, sending the Ask to its Telegram chat", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.profile(["OUTER_LAYER=factoryclaw"]);
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc", "FACTORYCLAW_SESSION=agent:factoryclaw:telegram:direct:123"]);

		const result = mac.run(["ask", "fac-1", "decision", "Should the total round up?"], repo);

		assert.equal(result.status, 0, result.stderr);
		const calls = mac.openclawCalls();
		assert.equal(calls.length, 1, "FactoryClaw is told once");
		const [command, ...args] = calls[0];
		assert.equal(command, "agent", "the connector uses the openclaw agent command");
		assert.deepEqual(
			args.slice(0, 4),
			["--session-key", "agent:factoryclaw:telegram:direct:123", "--deliver", "--message"],
			"the Ask goes to the Telegram chat the project's .env names",
		);
		const message = args[4];
		assert.match(message, /calc/, "the message names the project");
		assert.match(message, /pm-calc/, "the message names the Project Manager's pane");
		assert.match(message, /Should the total round up\?/, "the message carries the question");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a Profile without CONNECTORS tells nobody when there is no outer layer", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.profile(["OUTER_LAYER=none"]);
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc", "FACTORYCLAW_SESSION=agent:factoryclaw:telegram:direct:123"]);

		const result = mac.run(["ask", "fac-1", "decision", "Should the total round up?"], repo);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(mac.openclawCalls(), [], "no connector is told about the Ask");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("an explicit empty CONNECTORS tells nobody even when FactoryClaw is the outer layer", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.profile(["OUTER_LAYER=factoryclaw", "CONNECTORS="]);
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc", "FACTORYCLAW_SESSION=agent:factoryclaw:telegram:direct:123"]);

		const result = mac.run(["ask", "fac-1", "decision", "Should the total round up?"], repo);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(mac.openclawCalls(), [], "a Mac that names no connectors tells nobody");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory ask tells the connectors about a Human gate's Ask too", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.profile(["CONNECTORS=telegram"]);
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.connector("telegram");

		const result = mac.run(["ask", "fac-1", "gate", "Taste and fit: does the total widget look right?"], repo);

		assert.equal(result.status, 0, result.stderr);
		const calls = mac.connectorCalls();
		assert.equal(calls.length, 1, "the connector is told");
		assert.equal(calls[0].ask.kind, "gate");
		assert.equal(calls[0].ask.how_to_answer, null, "a gate is answered by its Run's id, which this Ask does not carry");
		assert.deepEqual(
			mac.calls().filter((call) => call[0] === "label"),
			[],
			"the gate's record still carries no label",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a failed connector leaves a dated note and a lasting label, and the Ask stays open", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.profile(["CONNECTORS=telegram"]);
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.connector("telegram", { failure: "telegram is down" });

		const result = mac.run(["ask", "fac-1", "decision", "Which total?"], repo);

		assert.equal(result.status, 0, result.stderr);
		const comments = mac.calls().filter((call) => call[0] === "comments" && call[1] === "add");
		assert.equal(comments.length, 2, "the Ask is written and its failed send is noted");
		assert.equal(comments[0][3].split("\n")[0], "Ask: decision", "the Ask itself is written first");
		assert.match(
			comments[1][3],
			/^Connector telegram failed, \d{4}-\d{2}-\d{2} \d{2}:\d{2}: telegram is down$/,
			"the note is dated and names the connector and its error",
		);
		assert.deepEqual(
			mac.calls().filter((call) => call[0] === "label" && call[1] === "add"),
			[
				["label", "add", "fac-1", "waiting-on-human"],
				["label", "add", "fac-1", "connector-failed"],
			],
			"the Ask still waits on the Human, and the failed send keeps a label that outlives the Ask",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --failures counts the failed-send notes per connector", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		mac.projects([calc]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }, { id: "fac-2" }],
				comments: {
					"fac-1": [
						{ text: askComment("decision", "fac-1", "Which total?", "2026-11-18 09:05") },
						{ text: "Connector factoryclaw failed, 2026-11-18 09:06: telegram is down" },
						{ text: "Connector factoryclaw failed, 2026-11-18 09:10: telegram is down" },
					],
					"fac-2": [
						{ text: askComment("grilling", "fac-2", "Which feeds?", "2026-11-17 16:40") },
						{ text: "Connector email failed, 2026-11-17 16:41: no mail server" },
					],
				},
				labels: { "fac-1": ["waiting-on-human", "connector-failed"], "fac-2": ["waiting-on-human", "connector-failed"] },
			},
		});

		const result = mac.run(["asks", "--failures"]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(result.stdout.split("\n").filter(Boolean), ["email  1", "factoryclaw  2"]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --failures counts only the project --project names", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		const news = mac.project("news");
		mac.projects([calc, news]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }],
				comments: {
					"fac-1": [{ text: "Connector factoryclaw failed, 2026-11-18 09:06: telegram is down" }],
				},
				labels: { "fac-1": ["connector-failed"] },
			},
			[news]: {
				list: [{ id: "fac-2" }],
				comments: {
					"fac-2": [{ text: "Connector factoryclaw failed, 2026-11-17 16:41: telegram is down" }],
				},
				labels: { "fac-2": ["connector-failed"] },
			},
		});

		const result = mac.run(["asks", "--failures", "--project", calc]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			result.stdout.split("\n").filter(Boolean),
			["factoryclaw  1"],
			"only the project --project names is counted",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --failures counts a failed send after its Ask is done and its Bead closed", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		mac.projects([calc]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }, { id: "fac-2" }],
				comments: {
					"fac-1": [
						{ text: askComment("decision", "fac-1", "Which total?", "2026-11-18 09:05") },
						{ text: "The Human's answer, 2026-11-18 10:02: round up" },
						{ text: "Connector factoryclaw failed, 2026-11-18 09:06: telegram is down" },
					],
					"fac-2": [{ text: "Connector email failed, 2026-11-17 16:41: no mail server" }],
				},
				labels: { "fac-1": ["connector-failed"], "fac-2": ["connector-failed"] },
				closed: ["fac-2"],
			},
		});

		const result = mac.run(["asks", "--failures"]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			result.stdout.split("\n").filter(Boolean),
			["email  1", "factoryclaw  1"],
			"a failure still counts once its Ask is done and once its Bead is closed",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("an Ask whose connector failed still lists when factory asks reads its Bead", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		mac.projects([calc]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }],
				comments: {
					"fac-1": [
						{ text: askComment("decision", "fac-1", "Which total?", "2026-11-18 09:05") },
						{ text: "Connector telegram failed, 2026-11-18 09:06: telegram is down" },
					],
				},
				labels: { "fac-1": ["waiting-on-human", "connector-failed"] },
			},
		});

		const result = mac.run(["asks", "--json"]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(
			JSON.parse(result.stdout).map((ask: { bead: string }) => ask.bead),
			["fac-1"],
			"the failure note does not hide the Ask",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory asks --failures counts a failed send noted on a Human gate's Bead after the gate is answered", () => {
	const mac = makeMac();
	try {
		const calc = mac.project("calc");
		mac.projects([calc]);
		mac.beads({
			[calc]: {
				list: [{ id: "fac-1" }],
				comments: {
					"fac-1": [{ text: "Connector factoryclaw failed, 2026-11-18 18:52: telegram is down" }],
				},
				labels: { "fac-1": ["connector-failed"] },
			},
		});
		mac.archon({ [calc]: { items: [] } });

		const result = mac.run(["asks", "--failures"]);

		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(result.stdout.split("\n").filter(Boolean), ["factoryclaw  1"]);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("factory ask gives up on a connector that hangs and notes the timeout", () => {
	const mac = makeMac();
	try {
		const repo = mac.project("calc");
		mac.profile(["CONNECTORS=slow"]);
		mac.projectEnv(repo, ["FACTORY_PM_AGENT=pm-calc"]);
		mac.connector("slow", { hang: true });
		mac.setEnv({ FACTORY_CONNECTOR_TIMEOUT: "0.5" });

		const result = mac.run(["ask", "fac-1", "decision", "Which total?"], repo, { timeout: 10_000 });

		assert.equal(result.status, 0, result.stderr);
		const comments = mac.calls().filter((call) => call[0] === "comments" && call[1] === "add");
		assert.equal(comments.length, 2, "the Ask is written and its timed-out send is noted");
		assert.match(
			comments[1][3],
			/^Connector slow failed, \d{4}-\d{2}-\d{2} \d{2}:\d{2}: no answer within 0\.5 seconds$/,
			"the note names the connector and that it did not answer in time",
		);
		assert.deepEqual(
			mac.calls().filter((call) => call[0] === "label" && call[1] === "add"),
			[
				["label", "add", "fac-1", "waiting-on-human"],
				["label", "add", "fac-1", "connector-failed"],
			],
			"the Ask still waits on the Human, and the timeout keeps the label that outlives it",
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});
