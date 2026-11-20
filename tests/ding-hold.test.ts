/**
 * ding-hold: a Project Manager's pane stays silent at the end of a turn while one of its
 * project's Runs is still moving and nothing waits on the Human (fac-o2r, fac-o2r.1).
 *
 * The seam is the pi extension in a Project Manager's session, driven the way a Project
 * Manager drives it: pi in RPC mode with the extension and a stand-in for pi-herdr-ding,
 * the package that turns the extension's hold into silence for the turn. The stand-in
 * writes down whether each settled turn was held or would have played, so a test reads the
 * decision without playing a sound. Stand-ins for `factory` and `archon` first on PATH
 * answer the state the extension asks for, and write down every call, so a test sets the
 * project's Asks, paused Runs and running Runs without a real Archon or Beads database.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dingHold = path.join(repoRoot, "project-manager", "ding-hold.ts");
const testProvider = path.join(repoRoot, "tests", "fixtures", "reply-test-provider.ts");
const herdrDing = path.join(repoRoot, "tests", "fixtures", "herdr-ding-log.ts");
const pane = "w1:p1";

/** One open Ask, as `factory asks --project <repo> --open --json` lists it. */
const OPEN_ASK = [
	{
		project: "repo",
		kind: "decision",
		bead: "fac-1",
		status: "open",
		question: "Ship the smaller screen first?",
		how_to_answer: 'factory answer fac-1 "<your answer>"',
		asked: "2026-11-18 10:00",
	},
];

/** One Run paused at an attention wait, as `archon workflow attention --json` lists it. */
const PAUSED_RUN = [
	{
		runId: "run-a",
		kind: "attention",
		form: "response",
		message: "Does the smaller screen land first?",
		pausedAt: "2026-11-18T10:00:00Z",
	},
];

/** One Run still moving, as `archon workflow runs --status running --json` lists it. */
const RUNNING_RUN = [{ id: "run-b", status: "running" }];

type Fixtures = {
	/** The project's open Asks, as `factory asks --project <repo> --open --json` lists them. */
	asks?: unknown[];
	/** The paused Runs, as `archon workflow attention --json` lists them. */
	attention?: unknown[];
	/** The Runs still moving, as `archon workflow runs --status running --json` lists them. */
	runs?: unknown[];
	/** What the stand-in for `factory` exits with, when a test wants it to fail. */
	factoryStatus?: number;
	/** What the stand-in for `archon` exits with, when a test wants it to fail. */
	archonStatus?: number;
	/** Leave a command off PATH, the way a Mac without it would have it. */
	withoutCommand?: "factory" | "archon";
};

type Machine = {
	root: string;
	home: string;
	repo: string;
	agentDir: string;
	factoryLog: string;
	archonLog: string;
	dingLog: string;
	providerLog: string;
};

/** One temporary Mac for one test: a home, a pi folder, a project repo, the state the two
 * commands answer from, and the stand-ins on PATH. */
function makeMachine(fixtures: Fixtures = {}): Machine {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-ding-hold-"));
	const home = path.join(root, "home");
	const repo = path.join(root, "repo");
	const bin = path.join(root, "bin");
	fs.mkdirSync(home, { recursive: true });
	fs.mkdirSync(repo, { recursive: true });
	fs.mkdirSync(bin, { recursive: true });
	fs.mkdirSync(path.join(root, "pi-agent"), { recursive: true });
	const asksFile = path.join(root, "asks.json");
	const attentionFile = path.join(root, "attention.json");
	const runsFile = path.join(root, "runs.json");
	fs.writeFileSync(asksFile, `${JSON.stringify(fixtures.asks ?? [])}\n`);
	fs.writeFileSync(attentionFile, `${JSON.stringify({ ok: true, action: "attention", items: fixtures.attention ?? [] })}\n`);
	fs.writeFileSync(runsFile, `${JSON.stringify({ runs: fixtures.runs ?? [] })}\n`);

	if (fixtures.withoutCommand !== "factory") {
		const factory = path.join(bin, "factory");
		// The stand-in answers `asks` with the Asks file and exits with the status the test
		// asked for; every call is written down.
		fs.writeFileSync(
			factory,
			`#!/bin/sh
printf '%s\\n' "$*" >> "$FACTORY_LOG"
[ -s "$FACTORY_STATUS" ] && exit "$(cat "$FACTORY_STATUS")"
cat "$FACTORY_ASKS"
`,
		);
		fs.chmodSync(factory, 0o755);
	}
	if (fixtures.withoutCommand !== "archon") {
		const archon = path.join(bin, "archon");
		// The stand-in answers the two reads by their subcommand, in the folder it ran in,
		// and exits with the status the test asked for.
		fs.writeFileSync(
			archon,
			`#!/bin/sh
printf '%s\\t%s\\n' "$PWD" "$*" >> "$ARCHON_LOG"
[ -s "$ARCHON_STATUS" ] && exit "$(cat "$ARCHON_STATUS")"
case "$1 $2" in
	"workflow attention") cat "$ARCHON_ATTENTION" ;;
	"workflow runs") cat "$ARCHON_RUNS" ;;
esac
`,
		);
		fs.chmodSync(archon, 0o755);
	}
	if (fixtures.factoryStatus) fs.writeFileSync(path.join(root, "factory.status"), `${fixtures.factoryStatus}\n`);
	if (fixtures.archonStatus) fs.writeFileSync(path.join(root, "archon.status"), `${fixtures.archonStatus}\n`);

	return {
		root,
		home,
		repo,
		agentDir: path.join(root, "pi-agent"),
		factoryLog: path.join(root, "factory.log"),
		archonLog: path.join(root, "archon.log"),
		dingLog: path.join(root, "ding.log"),
		providerLog: path.join(root, "requests.jsonl"),
	};
}

/** pi itself, found on the test's own PATH: the child's PATH cannot name a folder with the
 * Mac's own `factory` or `archon` commands. */
function piOnPath(): string {
	const found = (process.env.PATH ?? "")
		.split(":")
		.map((entry) => path.join(entry, "pi"))
		.find((file) => fs.existsSync(file));
	if (!found) throw new Error("the tests need pi on PATH");
	return found;
}

/** The environment pi runs in: the stand-ins first on PATH, so `factory` and `archon` always
 * resolve to them or to nothing, and no folder with the Mac's own copies, so the Mac's state
 * is never read. */
function childEnv(machine: Machine): NodeJS.ProcessEnv {
	const bin = path.join(machine.root, "bin");
	const inherited = (process.env.PATH ?? "")
		.split(":")
		.filter((entry) => entry && !fs.existsSync(path.join(entry, "factory")) && !fs.existsSync(path.join(entry, "archon")));
	const env: NodeJS.ProcessEnv = { ...process.env };
	for (const key of Object.keys(env)) if (key.startsWith("HERDR_")) delete env[key];
	return {
		...env,
		HOME: machine.home,
		PATH: [bin, ...inherited].join(":"),
		PI_CODING_AGENT_DIR: machine.agentDir,
		PI_SKIP_VERSION_CHECK: "1",
		PI_OFFLINE: "1",
		PI_TELEMETRY: "0",
		HERDR_ENV: "1",
		HERDR_PANE_ID: pane,
		FACTORY_LOG: machine.factoryLog,
		FACTORY_ASKS: path.join(machine.root, "asks.json"),
		FACTORY_STATUS: path.join(machine.root, "factory.status"),
		ARCHON_LOG: machine.archonLog,
		ARCHON_ATTENTION: path.join(machine.root, "attention.json"),
		ARCHON_RUNS: path.join(machine.root, "runs.json"),
		ARCHON_STATUS: path.join(machine.root, "archon.status"),
		HERDR_DING_LOG: machine.dingLog,
		REPLY_TEST_LOG: machine.providerLog,
	};
}

type Pi = {
	/** Sends one message and waits for its turn to settle. */
	turn: (message: string) => Promise<void>;
	stop: () => Promise<void>;
};

/** A pi session in RPC mode with the extension under test, the reply provider, and the
 * stand-in for pi-herdr-ding loaded last, as the installed package loads after the command
 * line's extensions in a Project Manager's session. */
function startPi(machine: Machine): Pi {
	const extensions = [dingHold, testProvider, herdrDing];
	const child: ChildProcess = spawn(
		piOnPath(),
		[
			"--mode",
			"rpc",
			"-ne",
			"-ns",
			"-np",
			"-nc",
			"--no-mcp",
			...extensions.flatMap((extension) => ["-e", extension]),
			"--model",
			"reply-test/reply",
		],
		{ cwd: machine.repo, stdio: ["pipe", "pipe", "pipe"], env: childEnv(machine) },
	);

	let buffer = "";
	let stderr = "";
	let settled = 0;
	let sent = 0;
	child.stdout!.setEncoding("utf8");
	child.stdout!.on("data", (chunk: string) => {
		buffer += chunk;
		let newline = buffer.indexOf("\n");
		while (newline >= 0) {
			const line = buffer.slice(0, newline).replace(/\r$/, "");
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");
			if (!line) continue;
			if ((JSON.parse(line) as { type?: string }).type === "agent_settled") settled += 1;
		}
	});
	child.stderr!.setEncoding("utf8");
	child.stderr!.on("data", (chunk: string) => {
		stderr += chunk;
	});

	const waitForSettled = async (count: number): Promise<void> => {
		const start = Date.now();
		while (settled < count) {
			if (child.exitCode !== null) throw new Error(`pi exited before the turn ended\n${stderr}`);
			if (Date.now() - start > 20000) throw new Error(`pi's turn never settled\n${stderr}`);
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	};

	const turn = async (message: string): Promise<void> => {
		const wanted = settled + 1;
		child.stdin!.write(`${JSON.stringify({ type: "prompt", message, id: `p${++sent}` })}\n`);
		await waitForSettled(wanted);
	};

	const stop = async (): Promise<void> => {
		child.stdin!.end();
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				resolve();
			}, 5000);
			child.once("exit", () => {
				clearTimeout(timer);
				resolve();
			});
		});
	};

	return { turn, stop };
}

/** The lines a stand-in wrote, or none when it was never called. */
const lines = (file: string): string[] =>
	fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];

/** Wait until a log holds `count` lines, so a test reads a call that is on its way. */
async function waitForLines(file: string, count: number, timeoutMs = 15000): Promise<string[]> {
	const start = Date.now();
	for (;;) {
		const written = lines(file);
		if (written.length >= count) return written;
		if (Date.now() - start > timeoutMs) {
			throw new Error(`${path.basename(file)} holds ${written.length} lines, not ${count}: ${written.join(" | ")}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

/** Runs one turn and returns what the stand-in for pi-herdr-ding wrote for it: `held` when
 * the extension held the sound, `played` when it left the turn to play. */
async function settledTurn(machine: Machine): Promise<string> {
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		return (await waitForLines(machine.dingLog, 1))[0];
	} finally {
		await pi.stop();
	}
}

test("a running Run with no open Ask holds the ding", async () => {
	const machine = makeMachine({ runs: RUNNING_RUN });

	assert.equal(await settledTurn(machine), "held");
});

test("an open Ask plays the ding", async () => {
	const machine = makeMachine({ asks: OPEN_ASK, runs: RUNNING_RUN });

	assert.equal(await settledTurn(machine), "played");
});

test("a Run paused at an attention wait plays the ding", async () => {
	// A wait `factory asks` does not list: one for a plain answer, or an approval wait whose
	// Bead it could not read. The Run waits on the Human either way, so the pane speaks up.
	const machine = makeMachine({ attention: PAUSED_RUN });

	assert.equal(await settledTurn(machine), "played");
});

test("a project with no running Run plays the ding", async () => {
	const machine = makeMachine();

	assert.equal(await settledTurn(machine), "played");
});

test("the check reads this project's state in the session's folder", async () => {
	// The pane is one project's. `factory asks` reads every project the Mac lists unless
	// --project narrows it, and Archon reads the project of the folder it runs in, so a
	// check that named neither would answer for another project's Runs and Asks.
	const machine = makeMachine({ runs: RUNNING_RUN });
	await settledTurn(machine);
	const factoryCalls = await waitForLines(machine.factoryLog, 1);
	const archonFolders = (await waitForLines(machine.archonLog, 2)).map((call) => call.split("\t")[0]);

	assert.equal(factoryCalls[0], `asks --project ${fs.realpathSync(machine.repo)} --open --json`);
	assert.deepEqual(archonFolders, [fs.realpathSync(machine.repo), fs.realpathSync(machine.repo)]);
});

test("a factory command that fails plays the ding rather than holding it", async () => {
	const machine = makeMachine({ runs: RUNNING_RUN, factoryStatus: 1 });

	assert.equal(await settledTurn(machine), "played");
});

test("without the factory command the ding plays", async () => {
	const machine = makeMachine({ runs: RUNNING_RUN, withoutCommand: "factory" });

	assert.equal(await settledTurn(machine), "played");
});

test("an archon command that fails plays the ding rather than holding it", async () => {
	const machine = makeMachine({ runs: RUNNING_RUN, archonStatus: 1 });

	assert.equal(await settledTurn(machine), "played");
});

test("without the archon command the ding plays", async () => {
	const machine = makeMachine({ runs: RUNNING_RUN, withoutCommand: "archon" });

	assert.equal(await settledTurn(machine), "played");
});
