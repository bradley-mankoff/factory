import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The seam is the pm command, run with stand-ins for pi and herdr on PATH. The stand-ins
// write down what the launcher asked them to do; the tests read that instead of looking
// inside the launcher.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Launch = {
	cwd: string;
	args: string[];
	env: Record<string, string>;
};

type Result = {
	status: number | null;
	stdout: string;
	stderr: string;
	capture: string;
};

function makeHarness(options: { shippedSettings?: boolean; profile?: string; worktree?: boolean } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pm-"));
	const home = path.join(root, "home");
	const repo = path.join(root, "repo");
	const bin = path.join(root, "bin");
	const herdrLog = path.join(root, "herdr.log");
	const archonLog = path.join(root, "archon.log");
	fs.mkdirSync(path.join(home, ".config", "factory"), { recursive: true });
	fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
	fs.mkdirSync(bin, { recursive: true });
	fs.mkdirSync(repo, { recursive: true });
	execFileSync("git", ["init", "-q", "-b", "main", repo]);
	// A branch for a Project Manager to lead, cut from the repo's main checkout the way
	// Archon cuts a Run's worktree. The main checkout stays on main.
	const worktree = path.join(root, "worktrees", "build-1");
	if (options.worktree) {
		fs.writeFileSync(path.join(repo, "README.md"), "the repo\n");
		execFileSync("git", ["-C", repo, "add", "README.md"]);
		execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "first"]);
		fs.mkdirSync(path.dirname(worktree), { recursive: true });
		execFileSync("git", ["-C", repo, "worktree", "add", "-q", "-b", "build-1", worktree]);
	}
	fs.writeFileSync(
		path.join(home, ".config", "factory", "profile"),
		options.profile ??
			(options.shippedSettings
				? fs.readFileSync(path.join(repoRoot, "config", "profile"), "utf8")
				: [
					"# Settings the test chose, not the Factory's defaults.",
					"PM_MODEL=test-provider/chosen-model",
					"LIBRARY=$HOME/.local/share/factory/archon/workflows",
					"ARCHON_HOME=$HOME/.local/share/factory/archon",
					...(options.worktree ? ["WORKSPACE=worktree"] : []),
				].join("\n") + "\n"),
	);
	// Archon's own binary, at the Archon home the Profile names: a stand-in that writes down
	// the folder each call ran in and its arguments.
	const archon = path.join(home, ".local", "share", "factory", "archon", "bin", "archon");
	fs.mkdirSync(path.dirname(archon), { recursive: true });
	fs.writeFileSync(archon, `#!/bin/sh\nprintf '%s|%s\\n' "$PWD" "$*" >> "$ARCHON_LOG"\nexit 0\n`);
	fs.chmodSync(archon, 0o755);

	const pi = path.join(bin, "pi");
	fs.writeFileSync(
		pi,
		`#!/bin/sh
{
	printf 'cwd=%s\\n' "$PWD"
	printf 'env.PI_CODING_AGENT_DIR=%s\\n' "\${PI_CODING_AGENT_DIR-<unset>}"
	printf 'env.PI_SKIP_VERSION_CHECK=%s\\n' "\${PI_SKIP_VERSION_CHECK-<unset>}"
	printf 'env.LIBRARY=%s\\n' "\${LIBRARY-<unset>}"
	printf 'env.FACTORY_PM_AGENT=%s\\n' "\${FACTORY_PM_AGENT-<unset>}"
	printf 'env.WORKSPACE=%s\\n' "\${WORKSPACE-<unset>}"
	printf 'env.FACTORY_DEMOS=%s\\n' "\${FACTORY_DEMOS-<unset>}"
	printf 'env.FACTORY_CHECK=%s\\n' "\${FACTORY_CHECK-<unset>}"
	printf 'env.PI_NOTICES_FILE=%s\\n' "\${PI_NOTICES_FILE-<unset>}"
	printf 'env.BEADS_BOARD_PORT=%s\\n' "\${BEADS_BOARD_PORT-<unset>}"
	for arg in "$@"; do printf 'arg=%s\\n' "$arg"; done
} > "$CAPTURE"
exit 0
`,
	);
	const herdr = path.join(bin, "herdr");
	fs.writeFileSync(
		herdr,
		`#!/bin/sh
printf '%s\\n' "$*" >> "$HERDR_LOG"
exit 0
`,
	);
	fs.chmodSync(pi, 0o755);
	fs.chmodSync(herdr, 0o755);

	const baseEnv: NodeJS.ProcessEnv = { ...process.env };
	for (const key of Object.keys(baseEnv)) {
		if (key.startsWith("HERDR_")) delete baseEnv[key];
	}
	// A Run of this repo carries FACTORY_CHECK in its own environment; a test that reads
	// a .env must see the file's value, never one inherited from the Run.
	delete baseEnv.FACTORY_CHECK;
	let count = 0;

	function childEnv(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
		return {
			...baseEnv,
			HOME: home,
			PATH: `${bin}:${process.env.PATH}`,
			HERDR_LOG: herdrLog,
			ARCHON_LOG: archonLog,
			// The launcher must remove this, not pass an inherited one through: a Project
			// Manager uses the Human's own pi folder, the one plain pi uses.
			PI_CODING_AGENT_DIR: "/inherited/not-the-human-pi",
			FACTORY_DEMOS: "/inherited/demos",
			...extraEnv,
		};
	}

	// The three things a test ever varies: the extra environment, the folder and the
	// arguments, named at the call so a test never passes an empty placeholder to reach
	// the one after it.
	type RunOptions = {
		env?: Record<string, string>;
		cwd?: string;
		args?: string[];
	};

	function run(file: string, { env = {}, cwd = repo, args = [] }: RunOptions = {}): Result {
		const capture = path.join(root, `capture-${++count}`);
		const result = spawnSync(file, args, {
			cwd,
			encoding: "utf8",
			env: childEnv({ CAPTURE: capture, ...env }),
		});
		return {
			status: result.status,
			stdout: result.stdout,
			stderr: result.stderr,
			capture,
		};
	}

	function readLaunch(capture: string): Launch {
		const launch: Launch = { cwd: "", args: [], env: {} };
		for (const line of fs.readFileSync(capture, "utf8").split("\n")) {
			if (line.startsWith("cwd=")) launch.cwd = line.slice("cwd=".length);
			else if (line.startsWith("arg=")) launch.args.push(line.slice("arg=".length));
			else if (line.startsWith("env.")) {
				const [key, ...rest] = line.slice("env.".length).split("=");
				launch.env[key] = rest.join("=");
			}
		}
		return launch;
	}

	return { root, home, repo, worktree, herdrLog, archonLog, childEnv, run, readLaunch };
}

/** The Archon calls a launcher made: the folder each ran in, then its arguments. */
const archonCalls = (log: string): string[] => {
	const text = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim() : "";
	return text === "" ? [] : text.split("\n");
};

/**
 * The message project-manager/start gives pi when the Human gives none: the start routine
 * reviews what is waiting and proposes the next steps for the Human to accept
 * (fac-qpv.2.2). A session that starts with no message would sit at pi's prompt.
 */
const openingMessage =
	"Run your start routine now: review the claimed Beads, the Runs that ended and the ready Beads, then propose the obvious next steps and wait for the Human to accept.";

test("pm starts the Human's own pi in the repo's top folder with the role and glossary appended", () => {
	const h = makeHarness();
	const result = h.run(path.join(repoRoot, "project-manager", "pm"));

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "");
	const launch = h.readLaunch(result.capture);
	assert.equal(launch.cwd, fs.realpathSync(h.repo));
	assert.deepEqual(launch.args, [
		"--model",
		"test-provider/chosen-model",
		"--append-system-prompt",
		path.join(repoRoot, "project-manager", "instructions.md"),
		"--append-system-prompt",
		path.join(repoRoot, "GLOSSARY.md"),
		openingMessage,
	]);
	assert.equal(launch.env.PI_CODING_AGENT_DIR, "<unset>");
	assert.equal(launch.env.PI_SKIP_VERSION_CHECK, "1");
	assert.equal(
		launch.env.LIBRARY,
		path.join(h.home, ".local", "share", "factory", "archon", "workflows"),
	);
});

test("project-manager/start passes pi the opening message itself when the Human gives none", () => {
	const h = makeHarness();
	const result = h.run(path.join(repoRoot, "project-manager", "start"));

	assert.equal(result.status, 0, result.stderr);
	assert.equal(h.readLaunch(result.capture).args.at(-1), openingMessage);
});

test("a first message given on the command line replaces the opening message", () => {
	const h = makeHarness();
	const first = "FactoryClaw: The Human asks you to get to work.";
	const result = h.run(path.join(repoRoot, "project-manager", "pm"), { args: [first] });

	assert.equal(result.status, 0, result.stderr);
	const launch = h.readLaunch(result.capture);
	assert.deepEqual(launch.args.slice(-1), [first], "pi sends the Human's own message, not a second one");
	assert.ok(!launch.args.includes(openingMessage), "the opening message makes way for the Human's");
});

test("the Factory's settings start a Project Manager on the PM Chain, and the Chain sets its thinking level", () => {
	const h = makeHarness({ shippedSettings: true });
	const result = h.run(path.join(repoRoot, "project-manager", "pm"));

	assert.equal(result.status, 0, result.stderr);
	const launch = h.readLaunch(result.capture);
	assert.deepEqual(launch.args.slice(0, 2), ["--model", "chain/pm"]);
	assert.ok(!launch.args.includes("--thinking"), "a thinking flag would override the Chain's level");
});

test("a Project Manager takes its model and Workflow library from the Profile", () => {
	const h = makeHarness({ profile: "PM_MODEL=test-provider/from-the-profile\nLIBRARY=/elsewhere/workflows\n" });
	const result = h.run(path.join(repoRoot, "project-manager", "pm"));

	assert.equal(result.status, 0, result.stderr);
	const launch = h.readLaunch(result.capture);
	assert.deepEqual(launch.args.slice(0, 2), ["--model", "test-provider/from-the-profile"]);
	assert.equal(launch.env.LIBRARY, "/elsewhere/workflows", "the Profile names the library, not a fixed path");
});

test("start says how to make a Profile when the Mac has none", () => {
	const h = makeHarness();
	fs.rmSync(path.join(h.home, ".config", "factory", "profile"));

	const result = h.run(path.join(repoRoot, "project-manager", "start"));

	assert.equal(result.status, 2);
	assert.match(result.stderr, /no Profile at .*run scripts\/install\.sh/);
});

test("pm run from a subfolder starts pi in the repo's top folder", () => {
	const h = makeHarness();
	const subfolder = path.join(h.repo, "src", "deep");
	fs.mkdirSync(subfolder, { recursive: true });

	const result = h.run(path.join(repoRoot, "project-manager", "pm"), { cwd: subfolder });

	assert.equal(result.status, 0, result.stderr);
	assert.equal(h.readLaunch(result.capture).cwd, fs.realpathSync(h.repo));
});

test("start points pi-notices at the pane's Notice file and pi-links at the Profile's board port", () => {
	// The packages read their own settings from the environment (fac-qpv.8.1): the Notice
	// file is the one bin/tell-pm writes, and the board's port is the Profile's.
	const h = makeHarness({ profile: "PM_MODEL=test-provider/chosen-model\nBOARD_PORT=3999\n" });
	const result = h.run(path.join(repoRoot, "project-manager", "pm"), {
		env: { HERDR_ENV: "1", HERDR_PANE_ID: "w1:p1" },
	});

	assert.equal(result.status, 0, result.stderr);
	const launch = h.readLaunch(result.capture);
	assert.equal(
		launch.env.PI_NOTICES_FILE,
		path.join(h.home, ".local", "share", "factory", "notices", "pm-repo.md"),
	);
	assert.equal(launch.env.BEADS_BOARD_PORT, "3999");
});

test("in a herdr pane, pm renames the pane pm-<folder> and names the Project Manager with it", () => {
	const h = makeHarness();
	const result = h.run(path.join(repoRoot, "project-manager", "pm"), {
		env: { HERDR_ENV: "1", HERDR_PANE_ID: "w1:p1" },
	});

	assert.equal(result.status, 0, result.stderr);
	const launch = h.readLaunch(result.capture);
	assert.equal(launch.env.FACTORY_PM_AGENT, "pm-repo");
	assert.equal(fs.readFileSync(h.herdrLog, "utf8").trim(), "pane rename w1:p1 pm-repo");
});

test("with the worktree shape, start leads the worktree, names its pane pm-<worktree folder>, and registers the repo with Archon from its main checkout", () => {
	// The work Mac's Profile gives every Project Manager one worktree to lead (fac-qpv.6.5).
	// Archon finds a worktree's project only through the repo's main checkout, so start
	// registers that checkout before a Run starts: the stand-in Archon writes down where
	// the registration call ran.
	const h = makeHarness({ worktree: true });
	const result = h.run(path.join(repoRoot, "project-manager", "start"), {
		cwd: h.worktree,
		env: { HERDR_ENV: "1", HERDR_PANE_ID: "w1:p1" },
	});

	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, `archon-register: registered ${fs.realpathSync(h.repo)} with Archon\n`);
	const launch = h.readLaunch(result.capture);
	assert.equal(launch.cwd, fs.realpathSync(h.worktree), "the Project Manager leads the worktree, not the main checkout");
	assert.equal(launch.env.FACTORY_PM_AGENT, "pm-build-1");
	assert.equal(fs.readFileSync(h.herdrLog, "utf8").trim(), "pane rename w1:p1 pm-build-1");
	assert.deepEqual(archonCalls(h.archonLog), [
		`${fs.realpathSync(h.repo)}|workflow run factory-register --no-worktree --base-branch main register`,
	]);
});

test("with the worktree shape, start links the main checkout's .archon/.env into a worktree that has none, and reads it", () => {
	// A linked worktree holds only what is committed, so the project's uncommitted
	// .archon/.env is missing there and a Run started from the worktree would read an
	// empty FACTORY_CHECK. start links the main checkout's file in, one file behind a
	// symlink, so every Project Manager worktree gets the project's settings (fac-u2c).
	const h = makeHarness({ worktree: true });
	fs.mkdirSync(path.join(h.repo, ".archon"));
	fs.writeFileSync(path.join(h.repo, ".archon", ".env"), "FACTORY_CHECK=make-check\n");

	const result = h.run(path.join(repoRoot, "project-manager", "start"), { cwd: h.worktree });

	assert.equal(result.status, 0, result.stderr);
	const link = path.join(h.worktree, ".archon", ".env");
	assert.ok(fs.lstatSync(link).isSymbolicLink(), "one file: the worktree's .env is a symlink, not a copy");
	assert.equal(fs.realpathSync(link), fs.realpathSync(path.join(h.repo, ".archon", ".env")));
	assert.equal(
		h.readLaunch(result.capture).env.FACTORY_CHECK,
		"make-check",
		"the linked settings reach the Project Manager's pi",
	);
});

test("with the worktree shape, start leaves a worktree's own .archon/.env as it is", () => {
	const h = makeHarness({ worktree: true });
	fs.mkdirSync(path.join(h.repo, ".archon"));
	fs.writeFileSync(path.join(h.repo, ".archon", ".env"), "FACTORY_CHECK=the-main-checkouts-check\n");
	fs.mkdirSync(path.join(h.worktree, ".archon"));
	fs.writeFileSync(path.join(h.worktree, ".archon", ".env"), "FACTORY_CHECK=the-worktrees-own-check\n");

	const result = h.run(path.join(repoRoot, "project-manager", "start"), { cwd: h.worktree });

	assert.equal(result.status, 0, result.stderr);
	const own = path.join(h.worktree, ".archon", ".env");
	assert.ok(!fs.lstatSync(own).isSymbolicLink(), "the worktree's own file stays a file");
	assert.equal(fs.readFileSync(own, "utf8"), "FACTORY_CHECK=the-worktrees-own-check\n");
	assert.equal(h.readLaunch(result.capture).env.FACTORY_CHECK, "the-worktrees-own-check");
});

test("the Profile's settings win when a project's .env names the same keys", () => {
	// A .env is read for the project's values, but PM_MODEL and WORKSPACE belong to the
	// Mac, so a project file that names them changes neither.
	const h = makeHarness({ profile: "PM_MODEL=test-provider/from-the-profile\nLIBRARY=/from/the/profile\n" });
	fs.mkdirSync(path.join(h.repo, ".archon"));
	fs.writeFileSync(path.join(h.repo, ".archon", ".env"), "PM_MODEL=test-provider/from-the-env\nWORKSPACE=worktree\n");

	const result = h.run(path.join(repoRoot, "project-manager", "start"));

	assert.equal(result.status, 0, result.stderr);
	const launch = h.readLaunch(result.capture);
	assert.equal(launch.env.WORKSPACE, "project", "the shape stays the Mac's");
	assert.equal(launch.args[1], "test-provider/from-the-profile", "the model stays the Mac's");
});

test("pm-pane prints a pane name herdr accepts whatever the folder is called", () => {
	// herdr agent names match [a-z][a-z0-9_-]{0,31}, so the folder is lowercased, any
	// other character becomes a dash, and the name stops at 32 characters.
	const cases: Array<[string, string]> = [
		["/Users/me/Developer/personal_code/factory", "pm-factory"],
		["/Users/me/Developer/My.Project_Name", "pm-my-project_name"],
		["/Users/me/Developer/My Project", "pm-my-project"],
		[`/Users/me/Developer/${"a".repeat(40)}`, `pm-${"a".repeat(29)}`],
	];

	for (const [folder, pane] of cases) {
		const printed = execFileSync(path.join(repoRoot, "bin", "pm-pane"), [folder], {
			encoding: "utf8",
		});
		assert.equal(printed, `${pane}\n`, folder);
	}
});

test("project-manager/start starts the same Project Manager as pm", () => {
	const h = makeHarness();
	const viaPm = h.run(path.join(repoRoot, "project-manager", "pm"));
	const viaStart = h.run(path.join(repoRoot, "project-manager", "start"));

	assert.equal(viaPm.status, 0, viaPm.stderr);
	assert.equal(viaStart.status, 0, viaStart.stderr);
	assert.deepEqual(h.readLaunch(viaStart.capture), h.readLaunch(viaPm.capture));
});

test("pm leaves the Human's pi settings alone, so plain pi stays plain", () => {
	const h = makeHarness();
	const settings = path.join(h.home, ".pi", "agent", "settings.json");
	fs.writeFileSync(settings, '{"theme":"plain-test"}\n');
	const before = fs.readdirSync(path.join(h.home, ".pi", "agent")).sort();

	const result = h.run(path.join(repoRoot, "project-manager", "pm"));

	assert.equal(result.status, 0, result.stderr);
	assert.equal(fs.readFileSync(settings, "utf8"), '{"theme":"plain-test"}\n');
	assert.deepEqual(fs.readdirSync(path.join(h.home, ".pi", "agent")).sort(), before);
});

test("pm keeps the project's settings but ignores the Factory pi folder beside them", () => {
	const h = makeHarness();
	fs.mkdirSync(path.join(h.repo, ".archon"));
	fs.writeFileSync(
		path.join(h.repo, ".archon", ".env"),
		"PI_CODING_AGENT_DIR=/factory/pi-agent\nFACTORY_DEMOS=/factory/demos\n",
	);

	const result = h.run(path.join(repoRoot, "project-manager", "pm"));

	assert.equal(result.status, 0, result.stderr);
	const launch = h.readLaunch(result.capture);
	assert.equal(launch.env.PI_CODING_AGENT_DIR, "<unset>");
	assert.equal(launch.env.FACTORY_DEMOS, "/factory/demos");
});
