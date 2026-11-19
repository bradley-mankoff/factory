/**
 * Notices: each line of a Project Manager's Notice file arrives in its conversation as a
 * message of its own, never through the text box, and the file outlives the session, so a
 * Notice written before it started or one it was killed inside arrives too (GLOSSARY.md,
 * `Notice`; fac-qpv.2.1, fac-618).
 *
 * The seam is the extension in a Project Manager's session: pi in RPC mode with
 * `project-manager/notices.ts`, a Notice file in a temporary folder and the reply test
 * provider at the edge, which records the conversation each request carried. A test writes
 * the line `bin/tell-pm` writes and reads what reached the conversation: what the extension
 * keeps beside the file is its own to shape, so no test reads it. The platform's change
 * notification is the edge that failed in fac-8xl, so one test breaks it on purpose, and the
 * process is the pane's session, so a test can kill it and start the next one.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const noticesExtension = path.join(repoRoot, "project-manager", "notices.ts");
const testProvider = path.join(repoRoot, "tests", "fixtures", "reply-test-provider.ts");
const deadChangeNotification = path.join(repoRoot, "tests", "fixtures", "dead-change-notification.cjs");

/** One model request the test provider answered: the text of each message it was sent. */
type Request = { messages: string[] };

type Machine = {
	dir: string;
	home: string;
	agentDir: string;
	noticeFile: string;
	/** The test provider's record of every request: one JSON object a line. */
	log: string;
	/** Each watch the broken change notification broke, so a test proves the edge was in place. */
	deadWatchLog: string;
	/** The file whose removal lets a held model reply, so a turn stays open while a test reads. */
	replyHold: string;
};

/** One temporary machine whose Notice file lives in the folder `bin/tell-pm` writes to. */
function makeMachine(): Machine {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-notices-"));
	const home = path.join(dir, "home");
	fs.mkdirSync(home, { recursive: true });
	return {
		dir,
		home,
		agentDir: path.join(dir, "pi-agent"),
		noticeFile: path.join(home, ".local", "share", "factory", "notices", "pm-calc.md"),
		log: path.join(dir, "requests.jsonl"),
		deadWatchLog: path.join(dir, "dead-watches.txt"),
		replyHold: path.join(dir, "reply-hold"),
	};
}

/** The line a Run's last node leaves: one dated line, as bin/tell-pm writes it. */
const writeNotice = (machine: Machine, line: string): void => {
	fs.mkdirSync(path.dirname(machine.noticeFile), { recursive: true });
	fs.appendFileSync(machine.noticeFile, `${line}\n`);
};

/** The requests the test provider has answered so far, oldest first. */
const readRequests = (log: string): Request[] =>
	fs.existsSync(log)
		? fs
				.readFileSync(log, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as Request)
		: [];

/** A pi session in RPC mode with the Notices extension and the test provider, and nothing
 * else loaded: no skills, prompt templates, context files or MCP. `log` and `replyHold`
 * default to the machine's, and a test that runs two sessions gives each its own. */
function startPi(machine: Machine, options: { deadChangeNotification?: boolean; log?: string; replyHold?: string } = {}) {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		HOME: machine.home,
		PI_CODING_AGENT_DIR: machine.agentDir,
		PI_SKIP_VERSION_CHECK: "1",
		PI_OFFLINE: "1",
		PI_TELEMETRY: "0",
		FACTORY_NOTICES_FILE: machine.noticeFile,
		REPLY_TEST_LOG: options.log ?? machine.log,
		DEAD_CHANGE_LOG: machine.deadWatchLog,
		REPLY_TEST_HOLD: options.replyHold ?? machine.replyHold,
	};
	// The broken change notification loads only in the session a test asks for it in.
	delete env.NODE_OPTIONS;
	if (options.deadChangeNotification) env.NODE_OPTIONS = `--require ${deadChangeNotification}`;

	const child: ChildProcess = spawn(
		"pi",
		[
			"--mode",
			"rpc",
			"-ne",
			"-ns",
			"-np",
			"-nc",
			"--no-mcp",
			"-e",
			noticesExtension,
			"-e",
			testProvider,
			"--model",
			"reply-test/reply",
		],
		{ cwd: machine.dir, stdio: ["pipe", "pipe", "pipe"], env },
	);

	const pending = new Map<string, (response: Record<string, unknown>) => void>();
	let buffer = "";
	let stderr = "";
	let nextId = 0;

	child.stdout!.setEncoding("utf8");
	child.stdout!.on("data", (chunk: string) => {
		buffer += chunk;
		let newline = buffer.indexOf("\n");
		while (newline >= 0) {
			const line = buffer.slice(0, newline).replace(/\r$/, "");
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");
			if (!line) continue;
			const record = JSON.parse(line) as Record<string, unknown>;
			const id = typeof record.id === "string" ? record.id : undefined;
			if (record.type === "response" && id && pending.has(id)) {
				const resolve = pending.get(id)!;
				pending.delete(id);
				resolve(record);
				continue;
			}
		}
	});
	child.stderr!.setEncoding("utf8");
	child.stderr!.on("data", (chunk: string) => {
		stderr += chunk;
	});

	const request = (command: Record<string, unknown>): Promise<Record<string, unknown>> => {
		const id = `req-${++nextId}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`pi did not answer ${String(command.type)}\n${stderr}`));
			}, 15000);
			pending.set(id, (response) => {
				clearTimeout(timer);
				resolve(response);
			});
			child.stdin!.write(`${JSON.stringify({ ...command, id })}\n`);
		});
	};

	/** The session is up and the extension has taken its starting point in the file. */
	const ready = (): Promise<Record<string, unknown>> => request({ type: "get_state" });

	/** Waits for the session to exit, the way a pane closing ends it. */
	const exited = async (): Promise<void> => {
		if (child.exitCode !== null || child.signalCode !== null) return;
		await new Promise<void>((resolve) => child.once("exit", () => resolve()));
	};

	const stop = async (): Promise<void> => {
		child.stdin!.end();
		const killer = setTimeout(() => child.kill("SIGKILL"), 5000);
		await exited();
		clearTimeout(killer);
	};

	/** Ends the session without letting it tidy up, as a crashed pi does. */
	const crash = async (): Promise<void> => {
		child.kill("SIGKILL");
		await exited();
	};

	/** Waits until the session has run its turns: nothing streaming and nothing queued. */
	const idle = async (): Promise<void> => {
		const start = Date.now();
		for (;;) {
			const state = (await request({ type: "get_state" })).data as { isStreaming: boolean; pendingMessageCount: number };
			if (!state.isStreaming && state.pendingMessageCount === 0) return;
			if (Date.now() - start > 15000) throw new Error(`the session never finished its turns\n${stderr}`);
			await sleep(20);
		}
	};

	return { ready, request, idle, stop, crash };
}

/** Wait until the test provider has answered `count` requests, then return them all. */
async function waitForRequests(log: string, count: number): Promise<Request[]> {
	const start = Date.now();
	for (;;) {
		const requests = readRequests(log);
		if (requests.length >= count) return requests;
		if (Date.now() - start > 15000) {
			throw new Error(`the test provider saw ${requests.length} requests, not ${count}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

/** Wait until the test provider has answered `count` requests across `logs`, in the order
 * they arrived, then return them all. */
async function waitForRequestsIn(logs: string[], count: number): Promise<Request[]> {
	const start = Date.now();
	for (;;) {
		const requests = logs.flatMap(readRequests);
		if (requests.length >= count) return requests;
		if (Date.now() - start > 15000) {
			throw new Error(`the test provider saw ${requests.length} requests across ${logs.length} sessions, not ${count}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

/** How long a test waits before saying a Notice did not arrive: the file is read once a
 * second, so two reads pass in this window. */
const QUIET_MS = 1500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const conversation = (request: Request): string => request.messages.join("\n");

/** The test provider's record of one session's requests, in a folder of its own so a test
 * that runs two sessions can tell them apart. */
const logFile = (machine: Machine, name: string): string => path.join(machine.dir, `${name}.jsonl`);

test("a Notice arrives even when the platform tells the session nothing changed", async () => {
	// The watcher pi-notices used went silent in one pane with nothing to show it, and three
	// Notices never arrived (fac-8xl). The line below is written while the platform's change
	// notification is broken, so only a reader that looks at the file itself can find it.
	const machine = makeMachine();
	const pi = startPi(machine, { deadChangeNotification: true });
	try {
		await pi.ready();
		const line = "2026-11-19 10:00 Run 50ae54e5 (factory-build-gated) for Bead fac-1 waits for the Human's taste-and-fit check.";
		writeNotice(machine, line);

		const [request] = await waitForRequests(machine.log, 1);

		assert.ok(conversation(request).includes(line), `the turn was sent the Notice: ${conversation(request)}`);
		assert.equal(
			fs.readFileSync(machine.deadWatchLog, "utf8").split("\n")[0],
			"loaded",
			"the platform's change notification was broken for this session, so nothing announced the line",
		);
	} finally {
		await pi.stop();
	}
});

test("a Notice that arrives while a turn is running waits for that turn to end", async () => {
	const machine = makeMachine();
	// The reply waits for this file to go, the way a model that takes time holds its turn open.
	fs.writeFileSync(machine.replyHold, "");
	const pi = startPi(machine);
	try {
		await pi.ready();
		await pi.request({ type: "prompt", message: "what is running?" });
		const [running] = await waitForRequests(machine.log, 1);

		const line = "2026-11-19 10:05 Run 61bf65f6 (factory-build) for Bead fac-2 ended merged.";
		writeNotice(machine, line);
		await new Promise((resolve) => setTimeout(resolve, QUIET_MS));
		assert.equal(readRequests(machine.log).length, 1, "the running turn never saw the Notice");

		fs.rmSync(machine.replyHold);
		const [, after] = await waitForRequests(machine.log, 2);

		assert.ok(!conversation(running).includes(line), "the turn already running was not sent the Notice");
		assert.ok(conversation(after).includes(line), `the turn after it was sent the Notice: ${conversation(after)}`);
	} finally {
		await pi.stop();
	}
});

test("a Notice written while no session was open is delivered when the session starts", async () => {
	// The Project Manager's pane can be closed when a Run ends, and the Notice is the Run's
	// ending: the session pulls what is still pending on its way up rather than leaving the
	// Run to the status check.
	const machine = makeMachine();
	const line = "2026-11-19 09:00 Run 72c07607 (factory-build) for Bead fac-3 ended merged.";
	writeNotice(machine, line);
	const pi = startPi(machine);
	try {
		await pi.ready();

		const [request] = await waitForRequests(machine.log, 1);

		assert.ok(conversation(request).includes(line), `the session was sent the pending Notice: ${conversation(request)}`);
	} finally {
		await pi.stop();
	}
});

test("a Notice a session acted on is not delivered again to the next session", async () => {
	// A Notice that reached a turn is in the conversation, and the session after it resuming the
	// pane must not record the same Run twice (fac-618, fac-c94).
	const machine = makeMachine();
	const firstLog = logFile(machine, "first");
	const acted = "2026-11-19 10:00 Run 50ae54e5 (factory-build) for Bead fac-5 ended merged.";
	const first = startPi(machine, { log: firstLog });
	try {
		await first.ready();
		writeNotice(machine, acted);
		await waitForRequests(firstLog, 1);
		await first.idle();
	} finally {
		await first.stop();
	}

	const pending = "2026-11-19 10:20 Run 61bf65f6 (factory-build) for Bead fac-6 ended failed.";
	writeNotice(machine, pending);
	const nextLog = logFile(machine, "next");
	const next = startPi(machine, { log: nextLog });
	try {
		await next.ready();

		const [request] = await waitForRequests(nextLog, 1);
		assert.ok(conversation(request).includes(pending), "the next session delivers the pending Notice, so it is reading the file");
		await sleep(QUIET_MS);
		assert.equal(readRequests(nextLog).length, 1, `the Notice already acted on was not sent again: ${conversation(readRequests(nextLog)[0])}`);
	} finally {
		await next.stop();
	}
});

test("a Notice a session was killed before acting on is delivered again to the next session", async () => {
	// The turn that carried a Notice never settled, so nothing says the Project Manager did
	// what a Notice asks: the Notice is pulled again rather than lost with the process.
	const machine = makeMachine();
	const firstLog = logFile(machine, "first");
	const line = "2026-11-19 10:05 Run 61bf65f6 (factory-build) for Bead fac-7 ended merged.";
	// The reply waits for this file to go, so the Notice's turn is still running when it dies.
	fs.writeFileSync(machine.replyHold, "");
	writeNotice(machine, line);
	const first = startPi(machine, { log: firstLog });
	await first.ready();
	await waitForRequests(firstLog, 1);
	await first.crash();
	fs.rmSync(machine.replyHold);

	const nextLog = logFile(machine, "next");
	const next = startPi(machine, { log: nextLog });
	try {
		await next.ready();

		const [request] = await waitForRequests(nextLog, 1);

		assert.ok(conversation(request).includes(line), `the Notice the killed session never acted on arrives again: ${conversation(request)}`);
	} finally {
		await next.stop();
	}
});

test("two sessions under one pane name deliver each Notice once", async () => {
	// Two Project Manager sessions have run under one pane name and both acted on every Notice
	// (2026-11-11). Only the session that holds the pane's lock takes them.
	const machine = makeMachine();
	const logs = [logFile(machine, "one"), logFile(machine, "two")];
	// The reply is held, so the Notice's turn is still running in whichever session took it
	// when the other session looks: a second session that read the file too would send it again.
	fs.writeFileSync(machine.replyHold, "");
	const one = startPi(machine, { log: logs[0] });
	const two = startPi(machine, { log: logs[1] });
	try {
		await one.ready();
		await two.ready();
		const line = "2026-11-19 10:15 Run 50ae54e5 (factory-build) for Bead fac-8 ended merged.";
		writeNotice(machine, line);

		const delivered = await waitForRequestsIn(logs, 1);
		assert.ok(conversation(delivered[0]).includes(line), `the Notice reached one of the sessions: ${conversation(delivered[0])}`);
		await sleep(QUIET_MS);
		assert.equal(
			readRequests(logs[0]).length + readRequests(logs[1]).length,
			1,
			`the whole pane was sent the Notice once: ${JSON.stringify(logs.map(readRequests))}`,
		);
	} finally {
		fs.rmSync(machine.replyHold);
		await one.stop();
		await two.stop();
	}
});

test("the same Notice written twice reaches the Project Manager once", async () => {
	// A Run whose last node runs twice writes the same Notice again; it is one event, named by
	// the hash of its line, and the Project Manager records the Run once.
	const machine = makeMachine();
	const line = "2026-11-19 10:20 Run 83d18718 (factory-build) for Bead fac-9 ended merged.";
	writeNotice(machine, line);
	writeNotice(machine, line);
	const pi = startPi(machine);
	try {
		await pi.ready();

		const [request] = await waitForRequests(machine.log, 1);
		assert.ok(conversation(request).includes(line), `the Notice arrives: ${conversation(request)}`);
		await sleep(QUIET_MS);
		assert.equal(readRequests(machine.log).length, 1, `the second copy of the Notice was not sent: ${conversation(readRequests(machine.log)[0])}`);
	} finally {
		await pi.stop();
	}
});

test("a Notice whose turn the Human ended early is delivered again to the next session", async () => {
	// Esc ends the turn the Notice started, so nothing says the Project Manager did what the
	// Notice asks; the next session pulls it rather than leaving the Run unrecorded.
	const machine = makeMachine();
	const firstLog = logFile(machine, "first");
	const line = "2026-11-19 10:25 Run 72c07607 (factory-build) for Bead fac-10 ended failed.";
	// The reply is held, so the Notice's turn is still running when the Human ends it.
	fs.writeFileSync(machine.replyHold, "");
	writeNotice(machine, line);
	const first = startPi(machine, { log: firstLog });
	await first.ready();
	await waitForRequests(firstLog, 1);
	await first.request({ type: "abort" });
	await first.idle();
	fs.rmSync(machine.replyHold);
	await first.stop();

	const nextLog = logFile(machine, "next");
	const next = startPi(machine, { log: nextLog });
	try {
		await next.ready();

		const [request] = await waitForRequests(nextLog, 1);

		assert.ok(conversation(request).includes(line), `the Notice whose turn was cut short arrives again: ${conversation(request)}`);
	} finally {
		await next.stop();
	}
});
