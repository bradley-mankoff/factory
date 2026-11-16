/**
 * The status check is asked for, never automatic (fac-k10). The extension registers two
 * commands, `/status-check` for the session it runs in and `/new-and-status-check` for a
 * fresh one, and both send the text of `project-manager/status-check.md`. The seam is pi in
 * RPC mode with that extension, a temporary pi folder and a test provider at the edge: the
 * provider records the conversation each request carried, so a test sees the check's text
 * arrive, and `get_state` says which session it arrived in.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusCheckExtension = path.join(repoRoot, "project-manager", "status-check.ts");
const statusCheckText = fs.readFileSync(path.join(repoRoot, "project-manager", "status-check.md"), "utf8").trim();
const testProvider = path.join(repoRoot, "tests", "fixtures", "status-check-test-provider.ts");

/** One model request the test provider answered: the text of each message it was sent. */
type Request = { messages: string[] };
type ProtocolRecord = { type: string; [key: string]: unknown };

type Workspace = { dir: string; home: string; agentDir: string; log: string };

/** One temporary machine, whose pi folder and provider log the test owns. */
function makeWorkspace(): Workspace {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-status-check-"));
	const home = path.join(dir, "home");
	const agentDir = path.join(dir, "pi-agent");
	fs.mkdirSync(home, { recursive: true });
	fs.mkdirSync(agentDir, { recursive: true });
	return { dir, home, agentDir, log: path.join(dir, "requests.jsonl") };
}

const readRequests = (log: string): Request[] =>
	fs.existsSync(log)
		? fs
				.readFileSync(log, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as Request)
		: [];

/** A pi session in RPC mode: commands out, protocol records back. */
function startPi(workspace: Workspace) {
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
			statusCheckExtension,
			"-e",
			testProvider,
			"--model",
			"status-check-test/reply",
		],
		{
			cwd: workspace.dir,
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				HOME: workspace.home,
				PI_CODING_AGENT_DIR: workspace.agentDir,
				PI_SKIP_VERSION_CHECK: "1",
				PI_OFFLINE: "1",
				PI_TELEMETRY: "0",
				STATUS_CHECK_TEST_LOG: workspace.log,
			},
		},
	);

	const events: ProtocolRecord[] = [];
	const pending = new Map<string, (response: ProtocolRecord) => void>();
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
			const record = JSON.parse(line) as ProtocolRecord;
			const id = typeof record.id === "string" ? record.id : undefined;
			if (record.type === "response" && id && pending.has(id)) {
				const resolve = pending.get(id)!;
				pending.delete(id);
				resolve(record);
				continue;
			}
			events.push(record);
		}
	});
	child.stderr!.setEncoding("utf8");
	child.stderr!.on("data", (chunk: string) => {
		stderr += chunk;
	});

	const request = (command: Record<string, unknown>): Promise<ProtocolRecord> => {
		const id = `req-${++nextId}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`pi did not answer ${String(command.type)}\n${stderr}\n${JSON.stringify(events)}`));
			}, 15000);
			pending.set(id, (response) => {
				clearTimeout(timer);
				resolve(response);
			});
			child.stdin!.write(`${JSON.stringify({ ...command, id })}\n`);
		});
	};

	/** The session id `get_state` reports: a new session starts a different one. */
	const sessionId = async (): Promise<string> => {
		const { data } = await request({ type: "get_state" });
		return (data as { sessionId: string }).sessionId;
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

	return { events, request, sessionId, stop, stderr: () => stderr };
}

/** Wait until the test provider has answered `count` requests. */
async function waitForRequests(log: string, count: number, timeoutMs = 15000): Promise<Request[]> {
	const start = Date.now();
	while (readRequests(log).length < count) {
		if (Date.now() - start > timeoutMs) {
			throw new Error(`the test provider saw ${readRequests(log).length} requests, not ${count}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	return readRequests(log);
}

const conversation = (request: Request): string => request.messages.join("\n");

test("/status-check sends the check's text in the session it runs in", async () => {
	const workspace = makeWorkspace();
	const pi = startPi(workspace);
	try {
		const before = await pi.sessionId();
		const response = await pi.request({ type: "prompt", message: "/status-check" });

		assert.equal(
			(response.data as { disposition: string }).disposition,
			"handled",
			"the command answers the prompt itself, so no model run starts from the slash command",
		);
		const [request] = await waitForRequests(workspace.log, 1);
		assert.match(statusCheckText, /review the claimed Beads, the Runs that ended and the ready Beads/, "the check's file carries the review the Bead describes");
		assert.ok(conversation(request).includes(statusCheckText), "the model is sent the check's text");
		assert.equal(await pi.sessionId(), before, "the check runs in the session the Human is in");
	} finally {
		await pi.stop();
	}
});

test("/new-and-status-check starts a new session with the check's text as its first message", async () => {
	const workspace = makeWorkspace();
	const pi = startPi(workspace);
	try {
		const before = await pi.sessionId();
		const response = await pi.request({ type: "prompt", message: "/new-and-status-check" });

		assert.equal(
			(response.data as { disposition: string }).disposition,
			"handled",
			"the command answers the prompt itself, so no model run starts from the slash command",
		);
		const [request] = await waitForRequests(workspace.log, 1);
		assert.ok(conversation(request).includes(statusCheckText), "the model is sent the check's text");
		const after = await pi.sessionId();
		assert.notEqual(after, before, "the check runs in a new session, not the one the Human left");
	} finally {
		await pi.stop();
	}
});
