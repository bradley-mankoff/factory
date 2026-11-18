/**
 * The blocked mark: a Project Manager's herdr pane shows blocked while its project has an
 * open Ask, so herdr, Heeler and archon-bar tell the Human he owes an answer without
 * anyone sending a message (fac-3mz.5, fac-3mz.9, the Epic's Spec fac-3mz).
 *
 * The seam is the pi extension in a Project Manager's session, driven the way a Project
 * Manager drives it: pi in RPC mode with the extension and a stand-in for herdr's own pi
 * integration, the one thing that turns pi's `herdr:blocked` event into a pane report. The
 * stand-in writes down every event the extension emits, so a test reads what herdr would be
 * told without starting herdr. A stub `factory` first on PATH holds the project's Asks, and
 * a stub `herdr` first on PATH catches any pane report the extension might still run.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blockedMark = path.join(repoRoot, "project-manager", "blocked-mark.ts");
const testProvider = path.join(repoRoot, "tests", "fixtures", "reply-test-provider.ts");
const herdrIntegration = path.join(repoRoot, "tests", "fixtures", "herdr-blocked-log.ts");
const pane = "w1:p1";

/** The JSON `factory asks --json` lists for the project, written by the test. */
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

const ANSWERED_ASK = [{ ...OPEN_ASK[0], status: "answered" }];

type Fixtures = {
	/** The project's Asks, as `factory asks --json` lists them; `--open` leaves the answered ones out. */
	asks: unknown[];
	/** What the stand-in for `factory` prints instead of the Asks, raw: a failed read. */
	prints?: string;
	/** What the stand-in for `factory` exits with, when a test wants it to fail. */
	factoryStatus?: number;
	/** Leave `factory` off PATH, the way a Mac without the command would have it. */
	withoutFactory?: boolean;
	/** Hold `factory` before it answers until the test removes its hold file: every call, or
	 * only the first, so a later check can overtake it. */
	factoryHolds?: "every" | "first";
	/** Start pi outside herdr, where the session has no HERDR_PANE_ID. */
	outsideHerdr?: boolean;
};

type Machine = {
	root: string;
	home: string;
	repo: string;
	agentDir: string;
	factoryLog: string;
	factoryCalls: string;
	herdrLog: string;
	blockedLog: string;
	providerLog: string;
	/** The Asks the stand-in for `factory` prints, which a test rewrites as the project moves. */
	asksFile: string;
	/** One marker per `factory` call that has taken the Asks, before a hold or an answer. */
	factoryRead: string;
	/** The file whose removal lets a held `factory` answer. */
	factoryHold: string;
	/** The file whose removal lets a held model reply. */
	replyHold: string;
	/** What this Mac was built with, so the pi session started on it holds the same case. */
	fixtures: Fixtures;
};

/** One temporary Mac for one test: a home, a pi folder, a project repo and the stand-ins on
 * PATH. */
function makeMachine(fixtures: Fixtures): Machine {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-blocked-mark-"));
	const home = path.join(root, "home");
	const repo = path.join(root, "repo");
	const bin = path.join(root, "bin");
	fs.mkdirSync(home, { recursive: true });
	fs.mkdirSync(repo, { recursive: true });
	fs.mkdirSync(bin, { recursive: true });
	fs.mkdirSync(path.join(root, "pi-agent"), { recursive: true });
	const factoryLog = path.join(root, "factory.log");
	const factoryRead = path.join(root, "factory.read");
	const factoryCalls = path.join(root, "factory.calls");
	const herdrLog = path.join(root, "herdr.log");
	const blockedLog = path.join(root, "blocked.jsonl");
	const factoryHold = path.join(root, "factory.hold");
	const replyHold = path.join(root, "reply.hold");
	const asksFile = path.join(root, "asks.json");

	fs.writeFileSync(asksFile, fixtures.prints ?? `${JSON.stringify(openOf(fixtures.asks))}\n`);
	if (fixtures.factoryStatus) fs.writeFileSync(path.join(root, "factory.status"), `${fixtures.factoryStatus}\n`);
	if (fixtures.factoryHolds) fs.writeFileSync(factoryHold, fixtures.factoryHolds === "first" ? "1\n" : "every\n");
	if (!fixtures.withoutFactory) {
		const factory = path.join(bin, "factory");
		// The stand-in takes the Asks file, writes down that it has them, and answers after a
		// hold the test may put in its way: every call, or only the first. It exits with the
		// status the test asked for, so a test reads every call it made.
		fs.writeFileSync(
			factory,
			`#!/bin/sh
printf '%s\\n' "$*" >> "$FACTORY_LOG"
n=$(( $(cat "$FACTORY_CALLS" 2>/dev/null || echo 0) + 1 ))
printf '%s\\n' "$n" > "$FACTORY_CALLS"
[ -s "$FACTORY_STATUS" ] && exit "$(cat "$FACTORY_STATUS")"
out=$(cat "$FACTORY_ASKS")
printf 'read\n' >> "$FACTORY_READ"
if [ -e "$FACTORY_HOLD" ]; then
  hold=$(cat "$FACTORY_HOLD")
  if [ "$hold" = every ] || [ "$hold" = "$n" ]; then
    while [ -e "$FACTORY_HOLD" ]; do sleep 0.1; done
  fi
fi
printf '%s\\n' "$out"
`,
		);
		fs.chmodSync(factory, 0o755);
	}
	const herdr = path.join(bin, "herdr");
	fs.writeFileSync(herdr, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$HERDR_LOG"\nexit 0\n`);
	fs.chmodSync(herdr, 0o755);

	return {
		root,
		home,
		repo,
		agentDir: path.join(root, "pi-agent"),
		factoryLog,
		factoryRead,
		factoryCalls,
		herdrLog,
		blockedLog,
		providerLog: path.join(root, "requests.jsonl"),
		asksFile,
		factoryHold,
		replyHold,
		fixtures,
	};
}

/** The Asks of the fixture that are still open, which is what `factory asks --open` lists. */
const openOf = (asks: unknown[]): unknown[] =>
	asks.filter((ask) => (ask as { status: string }).status === "open");

/** Rewrites the project's Asks, as an answer or a new Ask would, for the stand-in to print. */
function setAsks(machine: Machine, asks: unknown[]): void {
	fs.writeFileSync(machine.asksFile, `${JSON.stringify(openOf(asks))}\n`);
}

/** Releases a held command: `factory` or the model replies once its hold file is gone. */
function release(file: string): void {
	fs.rmSync(file, { force: true });
}

/** pi itself, found on the test's own PATH: the child's PATH cannot name a folder with the
 * Mac's `factory` command. */
function piOnPath(): string {
	const found = (process.env.PATH ?? "")
		.split(":")
		.map((entry) => path.join(entry, "pi"))
		.find((file) => fs.existsSync(file));
	if (!found) throw new Error("the tests need pi on PATH");
	return found;
}

/** The environment pi runs in: the stand-ins first on PATH, so `herdr` and `factory` always
 * resolve to them, and no folder with a real `factory`, so the Mac's Asks are never read. */
function childEnv(machine: Machine): NodeJS.ProcessEnv {
	const bin = path.join(machine.root, "bin");
	const inherited = (process.env.PATH ?? "")
		.split(":")
		.filter((entry) => entry && !fs.existsSync(path.join(entry, "factory")));
	const env: NodeJS.ProcessEnv = { ...process.env };
	for (const key of Object.keys(env)) if (key.startsWith("HERDR_")) delete env[key];
	const child: NodeJS.ProcessEnv = {
		...env,
		HOME: machine.home,
		PATH: [bin, ...inherited].join(":"),
		PI_CODING_AGENT_DIR: machine.agentDir,
		PI_SKIP_VERSION_CHECK: "1",
		PI_OFFLINE: "1",
		PI_TELEMETRY: "0",
		HERDR_PANE_ID: pane,
		FACTORY_LOG: machine.factoryLog,
		FACTORY_READ: machine.factoryRead,
		FACTORY_CALLS: machine.factoryCalls,
		FACTORY_ASKS: machine.asksFile,
		FACTORY_STATUS: path.join(machine.root, "factory.status"),
		FACTORY_HOLD: machine.factoryHold,
		HERDR_LOG: machine.herdrLog,
		HERDR_BLOCKED_LOG: machine.blockedLog,
		REPLY_TEST_LOG: machine.providerLog,
		REPLY_TEST_HOLD: machine.replyHold,
	};
	// A session outside herdr has no pane id at all, so there is no pane to mark.
	if (machine.fixtures.outsideHerdr) delete child.HERDR_PANE_ID;
	return child;
}

type Pi = {
	/** Sends one message and returns at once, before its turn ends. */
	send: (message: string) => void;
	/** How many turns have settled so far. */
	settled: () => number;
	/** Waits until this many turns have settled, when every extension's turn-end handler
	 * has run. */
	waitForSettled: (count: number) => Promise<void>;
	/** Sends one message and waits for its turn to settle. */
	turn: (message: string) => Promise<void>;
	stop: () => Promise<void>;
};

/** A pi session in RPC mode with the extension under test, the reply provider, and the
 * stand-in for herdr's integration loaded last, as that integration loads after the
 * command line's extensions in a Project Manager's session. */
function startPi(machine: Machine): Pi {
	const extensions = [blockedMark, testProvider, herdrIntegration];
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

	const send = (message: string): void => {
		child.stdin!.write(`${JSON.stringify({ type: "prompt", message, id: `p${++sent}` })}\n`);
	};

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
		send(message);
		await waitForSettled(wanted);
	};

	const stop = async (): Promise<void> => {
		release(machine.factoryHold);
		release(machine.replyHold);
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

	return { send, settled: () => settled, waitForSettled, turn, stop };
}

/** The lines a stand-in wrote, or none when it was never called. */
const lines = (file: string): string[] =>
	fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];

/** The `herdr:blocked` events the stand-in integration wrote down, in the order they came. */
const events = (file: string): unknown[] =>
	lines(file).map((line) => JSON.parse(line) as unknown);

/** Wait until the file holds `count` lines, so a test reads a call that is on its way. */
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

/** Wait until the stand-in has written `count` events, so a test reads one that is on its way. */
async function waitForEvents(file: string, count: number, timeoutMs = 15000): Promise<unknown[]> {
	const start = Date.now();
	for (;;) {
		const written = events(file);
		if (written.length >= count) return written;
		if (Date.now() - start > timeoutMs) {
			throw new Error(
				`${path.basename(file)} holds ${written.length} events, not ${count}: ${JSON.stringify(written)}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

/** Wait until the stand-in for `factory` has taken the Asks for `count` checks, so a test
 * knows what the check it waits on read, not merely that it started. */
async function waitForReads(machine: Machine, count: number): Promise<void> {
	await waitForLines(machine.factoryRead, count);
}

/** How long a test waits before reading the events when it expects none: the extension asks
 * factory at the turn's start and end, and the event arrives once the answer is read, so a
 * test that read at once could miss one still on its way. */
const QUIET_MS = 1000;

test("an open Ask raises herdr:blocked with a label naming it", async () => {
	const machine = makeMachine({ asks: OPEN_ASK });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		const recorded = await waitForEvents(machine.blockedLog, 1);

		assert.deepEqual(recorded[0], {
			active: true,
			label: "fac-1 decision: Ship the smaller screen first?",
		});
	} finally {
		await pi.stop();
	}
});

test("no open Ask raises no event at all", async () => {
	const machine = makeMachine({ asks: [] });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForReads(machine, 2);
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(events(machine.blockedLog), []);
	} finally {
		await pi.stop();
	}
});

test("the check asks factory for this project's open Asks", async () => {
	// `--open` is what keeps an answered Ask from marking the pane, since the answer swaps
	// the waiting-on-human label for answered and blocked means the Human owes one; the
	// project is the session's folder.
	const machine = makeMachine({ asks: OPEN_ASK });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		const calls = await waitForLines(machine.factoryLog, 1);

		assert.equal(calls[0], `asks --project ${fs.realpathSync(machine.repo)} --open --json`);
	} finally {
		await pi.stop();
	}
});

test("a later turn with the Ask still open raises no second event", async () => {
	const machine = makeMachine({ asks: OPEN_ASK });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForEvents(machine.blockedLog, 1);
		await pi.turn("read the Run's report");
		await waitForLines(machine.factoryLog, 4);
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(events(machine.blockedLog), [
			{ active: true, label: "fac-1 decision: Ship the smaller screen first?" },
		]);
	} finally {
		await pi.stop();
	}
});

test("an answered Ask clears the mark as soon as the next turn starts", async () => {
	// The Notice that carries the answer starts a turn, and the check at that turn's start
	// is what clears the mark. The model's reply is held here, so the turn is still running
	// when the clear arrives: a check that ran only at a turn's end could not have sent it.
	const machine = makeMachine({ asks: OPEN_ASK });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForEvents(machine.blockedLog, 1);
		await waitForReads(machine, 2);

		setAsks(machine, ANSWERED_ASK);
		fs.writeFileSync(machine.replyHold, "");
		pi.send("the Human answered: yes, ship it");
		await waitForEvents(machine.blockedLog, 2);
		const turnsSettled = pi.settled();

		assert.deepEqual(events(machine.blockedLog)[1], { active: false });
		assert.equal(turnsSettled, 1, "the turn that carries the answer is still running");
	} finally {
		await pi.stop();
	}
});

test("an Ask answered during a turn clears the mark when the turn ends", async () => {
	// The Human can answer from archon-bar, where no Notice starts a turn, so the check at a
	// turn's end has to clear the mark by itself. The reply is held, so the answer lands
	// while the turn runs, after the check at its start has already seen the open Ask.
	const machine = makeMachine({ asks: OPEN_ASK });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForEvents(machine.blockedLog, 1);
		await waitForReads(machine, 2);

		fs.writeFileSync(machine.replyHold, "");
		pi.send("check the board");
		await waitForReads(machine, 3);
		setAsks(machine, ANSWERED_ASK);
		release(machine.replyHold);
		await pi.waitForSettled(2);
		const recorded = await waitForEvents(machine.blockedLog, 2);

		assert.deepEqual(recorded[1], { active: false });
	} finally {
		await pi.stop();
	}
});

test("a slow factory does not hold up the turn", async () => {
	// `factory asks` can take a while, so the check must not keep pi's turn open for it. The
	// stand-in factory waits here, and the turn still ends; only then is the factory let go,
	// and the mark still arrives.
	const machine = makeMachine({ asks: OPEN_ASK, factoryHolds: "every" });
	const pi = startPi(machine);
	try {
		pi.send("plan the next Bead");
		await pi.waitForSettled(1);
		const recordedWhileHeld = events(machine.blockedLog);

		release(machine.factoryHold);
		const recorded = await waitForEvents(machine.blockedLog, 1);

		assert.deepEqual(recordedWhileHeld, [], "the check could not have answered while factory was held");
		assert.deepEqual(recorded[0], {
			active: true,
			label: "fac-1 decision: Ship the smaller screen first?",
		});
	} finally {
		await pi.stop();
	}
});

test("a factory that cannot answer leaves a standing mark alone", async () => {
	// A failed read says nothing about whether the Human still owes an answer, so the mark
	// must stand: clearing it would tell Heeler and archon-bar the Human owes nothing.
	const machine = makeMachine({ asks: OPEN_ASK });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForEvents(machine.blockedLog, 1);
		await waitForReads(machine, 2);

		fs.writeFileSync(machine.asksFile, "bd: could not read the Beads database\n");
		await pi.turn("read the Run's report");
		await waitForReads(machine, 4);
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(events(machine.blockedLog), [
			{ active: true, label: "fac-1 decision: Ship the smaller screen first?" },
		]);
	} finally {
		await pi.stop();
	}
});

test("a factory that answers with something other than the Asks raises no event", async () => {
	const machine = makeMachine({
		asks: OPEN_ASK,
		prints: "bd: could not read the Beads database\n",
	});
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForReads(machine, 2);
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(events(machine.blockedLog), []);
	} finally {
		await pi.stop();
	}
});

test("a factory command that fails raises no event", async () => {
	const machine = makeMachine({ asks: OPEN_ASK, factoryStatus: 1 });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForLines(machine.factoryLog, 2);
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(events(machine.blockedLog), []);
	} finally {
		await pi.stop();
	}
});

test("without the factory command no event is raised", async () => {
	const machine = makeMachine({ asks: OPEN_ASK, withoutFactory: true });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(events(machine.blockedLog), [], "a Mac with no factory command still runs its Project Managers");
	} finally {
		await pi.stop();
	}
});

test("the extension runs no herdr command, because herdr's integration reports the mark", async () => {
	const machine = makeMachine({ asks: OPEN_ASK });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForEvents(machine.blockedLog, 1);
		await waitForReads(machine, 2);

		assert.deepEqual(lines(machine.herdrLog), [], "the pane is left to herdr's own pi integration");
	} finally {
		await pi.stop();
	}
});

test("outside herdr, where there is no pane to mark, the project's Asks are not read", async () => {
	const machine = makeMachine({ asks: OPEN_ASK, outsideHerdr: true });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(lines(machine.factoryLog), [], "nothing could be marked, so nothing is read");
		assert.deepEqual(events(machine.blockedLog), []);
	} finally {
		await pi.stop();
	}
});

test("an Ask that comes back after a clear raises the mark again", async () => {
	// herdr's integration counts blocks, so every mark is raised once and lowered once: a
	// second open Ask after an answer raises a new mark rather than staying silent.
	const machine = makeMachine({ asks: OPEN_ASK });
	const pi = startPi(machine);
	try {
		await pi.turn("plan the next Bead");
		await waitForEvents(machine.blockedLog, 1);
		await waitForReads(machine, 2);

		setAsks(machine, ANSWERED_ASK);
		await pi.turn("take up the answer");
		await waitForEvents(machine.blockedLog, 2);
		await waitForReads(machine, 4);

		setAsks(machine, OPEN_ASK);
		await pi.turn("ask the next question");
		await waitForReads(machine, 6);
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(events(machine.blockedLog), [
			{ active: true, label: "fac-1 decision: Ship the smaller screen first?" },
			{ active: false },
			{ active: true, label: "fac-1 decision: Ship the smaller screen first?" },
		]);
	} finally {
		await pi.stop();
	}
});

test("a check overtaken by a later one raises no stale mark", async () => {
	// A turn can end before the check at its start has answered. That older read must not
	// raise a mark the later one has already decided against, or the pane would stay blocked
	// on an Ask the Human has answered.
	const machine = makeMachine({ asks: OPEN_ASK, factoryHolds: "first" });
	const pi = startPi(machine);
	try {
		fs.writeFileSync(machine.replyHold, "");
		pi.send("plan the next Bead");
		await waitForReads(machine, 1);
		setAsks(machine, ANSWERED_ASK);
		release(machine.replyHold);
		await pi.waitForSettled(1);
		await waitForReads(machine, 2);
		release(machine.factoryHold);
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

		assert.deepEqual(events(machine.blockedLog), []);
	} finally {
		await pi.stop();
	}
});
