/**
 * The blocked mark: a Project Manager's herdr pane shows blocked while its project has an
 * open Ask, so herdr, Heeler and archon-bar tell the Human he owes an answer without
 * anyone sending a message (fac-3mz.5, the Epic's Spec fac-3mz).
 *
 * The seam is the pi extension in a Project Manager's session, driven the way a Project
 * Manager drives it: pi in RPC mode with the extension, a turn run to its end, and stand-ins
 * for the two commands at the system's edge, `factory` and `herdr`, first on PATH. Both write
 * down every call, so a test reads what the pane was told without reaching into the
 * extension. The stand-in `herdr` shadows the Mac's own, and every folder holding a real
 * `factory` is dropped from the child's PATH, so neither the Mac's panes nor its Asks are
 * ever touched.
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
const pane = "w1:p1";

/** pi's own turn-end report, the idle line herdr's pi integration sends at a turn's end. */
const IDLE_REPORT = `pane report-agent ${pane} --source herdr:pi --agent pi --state idle`;

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
	/** What `factory asks --json` lists without --open: every Ask of the project. */
	listed: unknown[];
	/** What the stand-in for `factory` exits with, when a test wants it to fail. */
	factoryStatus?: number;
	/** Leave `factory` off PATH, the way a Mac without the command would have it. */
	withoutFactory?: boolean;
	/** What the stand-in for `factory` prints instead of the open Asks, raw. */
	answers?: string;
	/** Load the stand-in for pi's own turn-end report, as a Project Manager's session has one. */
	piReport?: boolean;
	/** Start pi outside a herdr pane, where the session has no HERDR_PANE_ID. */
	noPane?: boolean;
};

type Machine = {
	root: string;
	home: string;
	repo: string;
	agentDir: string;
	factoryLog: string;
	herdrLog: string;
	providerLog: string;
};

/** One temporary Mac for one test: a home, a pi folder, a project repo and the two
 * stand-ins on PATH. */
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
	const herdrLog = path.join(root, "herdr.log");

	fs.writeFileSync(path.join(root, "listed.json"), `${JSON.stringify(fixtures.listed)}\n`);
	fs.writeFileSync(
		path.join(root, "open.json"),
		fixtures.answers ??
			`${JSON.stringify(fixtures.listed.filter((ask) => (ask as { status: string }).status === "open"))}\n`,
	);
	if (!fixtures.withoutFactory) {
		const factory = path.join(bin, "factory");
		fs.writeFileSync(
			factory,
			`#!/bin/sh
printf '%s\\n' "$*" >> "$FACTORY_LOG"
[ "\${FACTORY_STATUS:-0}" = 0 ] || exit "\${FACTORY_STATUS}"
case " $* " in
  *" --open "*) cat "$FACTORY_OPEN" ;;
  *) cat "$FACTORY_LISTED" ;;
esac
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
		herdrLog,
		providerLog: path.join(root, "requests.jsonl"),
	};
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

/** The environment pi runs in: the stand-ins first on PATH, so `herdr` always resolves to the
 * stand-in, and no folder with a real `factory`, so the Mac's Asks are never read. */
function childEnv(machine: Machine, fixtures: Fixtures): NodeJS.ProcessEnv {
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
		FACTORY_LISTED: path.join(machine.root, "listed.json"),
		FACTORY_OPEN: path.join(machine.root, "open.json"),
		FACTORY_STATUS: String(fixtures.factoryStatus ?? 0),
		HERDR_LOG: machine.herdrLog,
		REPLY_TEST_LOG: machine.providerLog,
	};
	// A session outside herdr has no pane id at all, so the extension finds no pane to mark.
	if (fixtures.noPane) delete child.HERDR_PANE_ID;
	return child;
}

type Pi = {
	/** Sends one message and waits until the turn has settled, when every extension's
	 * turn-end handler has run. */
	turn: (message: string) => Promise<void>;
	stop: () => Promise<void>;
};

/** A pi session in RPC mode with the extension under test, the reply provider and, when a
 * test asks, a stand-in for pi's own turn-end report. */
function startPi(machine: Machine, fixtures: Fixtures): Pi {
	const extensions = [blockedMark, testProvider];
	if (fixtures.piReport) extensions.push(path.join(repoRoot, "tests", "fixtures", "pi-turn-end-report.ts"));
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
		{ cwd: machine.repo, stdio: ["pipe", "pipe", "pipe"], env: childEnv(machine, fixtures) },
	);

	let buffer = "";
	let stderr = "";
	let settled = 0;
	const waiting: Array<() => void> = [];
	child.stdout!.setEncoding("utf8");
	child.stdout!.on("data", (chunk: string) => {
		buffer += chunk;
		let newline = buffer.indexOf("\n");
		while (newline >= 0) {
			const line = buffer.slice(0, newline).replace(/\r$/, "");
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");
			if (!line) continue;
			if ((JSON.parse(line) as { type?: string }).type === "agent_settled") {
				settled += 1;
				waiting.splice(0).forEach((wake) => wake());
			}
		}
	});
	child.stderr!.setEncoding("utf8");
	child.stderr!.on("data", (chunk: string) => {
		stderr += chunk;
	});

	const turn = async (message: string): Promise<void> => {
		const wanted = settled + 1;
		child.stdin!.write(`${JSON.stringify({ type: "prompt", message, id: `p${wanted}` })}\n`);
		const start = Date.now();
		while (settled < wanted) {
			if (child.exitCode !== null) throw new Error(`pi exited before the turn ended\n${stderr}`);
			if (Date.now() - start > 20000) throw new Error(`pi's turn never settled\n${stderr}`);
			await new Promise<void>((wake) => {
				waiting.push(wake);
				setTimeout(wake, 50);
			});
		}
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

test("an open Ask marks the Project Manager's pane blocked", async () => {
	const machine = makeMachine({ listed: OPEN_ASK });
	const pi = startPi(machine, { listed: OPEN_ASK });
	try {
		await pi.turn("plan the next Bead");
		const calls = await waitForLines(machine.herdrLog, 1);

		assert.equal(
			calls[0],
			`pane report-agent ${pane} --source factory:asks --agent pi --state blocked`,
			"the pane is reported blocked on the Ask, for the pane this session runs in",
		);
	} finally {
		await pi.stop();
	}
});

test("the check asks factory for this project's open Asks, so an answered Ask cannot mark the pane", async () => {
	// The project is the session's folder, and `--open` is what leaves answered Asks out:
	// the answer swaps waiting-on-human for answered, and blocked means the Human owes one.
	const machine = makeMachine({ listed: ANSWERED_ASK });
	const pi = startPi(machine, { listed: ANSWERED_ASK });
	try {
		await pi.turn("plan the next Bead");
		const calls = await waitForLines(machine.factoryLog, 1);

		assert.equal(calls[0], `asks --project ${fs.realpathSync(machine.repo)} --open --json`);
	} finally {
		await pi.stop();
	}
});

test("with no Ask at all the pane is left to pi's own turn-end report", async () => {
	const machine = makeMachine({ listed: [] });
	const pi = startPi(machine, { listed: [] });
	try {
		await pi.turn("plan the next Bead");
		await waitForLines(machine.factoryLog, 1);
		await new Promise((resolve) => setTimeout(resolve, 500));

		assert.deepEqual(lines(machine.herdrLog), [], "nothing was reported, so pi's own idle report stands");
	} finally {
		await pi.stop();
	}
});

test("an answered Ask does not mark the pane, because the Human owes no answer", async () => {
	const machine = makeMachine({ listed: ANSWERED_ASK });
	const pi = startPi(machine, { listed: ANSWERED_ASK });
	try {
		await pi.turn("plan the next Bead");
		await waitForLines(machine.factoryLog, 1);
		await new Promise((resolve) => setTimeout(resolve, 500));

		assert.deepEqual(lines(machine.herdrLog), []);
	} finally {
		await pi.stop();
	}
});

test("a factory command that fails leaves pi's own report standing", async () => {
	const fixtures = { listed: OPEN_ASK, factoryStatus: 1 };
	const machine = makeMachine(fixtures);
	const pi = startPi(machine, { ...fixtures, piReport: true });
	try {
		await pi.turn("plan the next Bead");
		await waitForLines(machine.factoryLog, 1);
		await new Promise((resolve) => setTimeout(resolve, 500));

		assert.deepEqual(
			lines(machine.herdrLog),
			[IDLE_REPORT],
			"a failed read is not a reason to tell the Human he owes an answer, so pi's report is the only one",
		);
	} finally {
		await pi.stop();
	}
});

test("without the factory command the turn ends as it did before", async () => {
	const fixtures = { listed: OPEN_ASK, withoutFactory: true };
	const machine = makeMachine(fixtures);
	const pi = startPi(machine, { ...fixtures, piReport: true });
	try {
		await pi.turn("plan the next Bead");
		await waitForLines(machine.herdrLog, 1);
		await new Promise((resolve) => setTimeout(resolve, 500));

		assert.deepEqual(lines(machine.herdrLog), [IDLE_REPORT], "a Mac with no factory command still runs its Project Managers");
	} finally {
		await pi.stop();
	}
});

test("a factory answer that is not the Asks list reports nothing", async () => {
	const fixtures = { listed: OPEN_ASK, answers: "bd: could not read the Beads database\n" };
	const machine = makeMachine(fixtures);
	const pi = startPi(machine, { ...fixtures, piReport: true });
	try {
		await pi.turn("plan the next Bead");
		await waitForLines(machine.factoryLog, 1);
		await new Promise((resolve) => setTimeout(resolve, 500));

		assert.deepEqual(lines(machine.herdrLog), [IDLE_REPORT]);
	} finally {
		await pi.stop();
	}
});

test("outside herdr, where there is no pane to mark, the project's Asks are not read", async () => {
	const fixtures = { listed: OPEN_ASK, noPane: true };
	const machine = makeMachine(fixtures);
	const pi = startPi(machine, fixtures);
	try {
		await pi.turn("plan the next Bead");
		await new Promise((resolve) => setTimeout(resolve, 750));

		assert.deepEqual(lines(machine.factoryLog), [], "nothing could be marked, so nothing is read");
		assert.deepEqual(lines(machine.herdrLog), []);
	} finally {
		await pi.stop();
	}
});

test("the blocked report reaches herdr after pi's own turn-end report", async () => {
	// herdr keeps the state of the latest report for a pane from any source, so a blocked
	// report that arrived first would be overwritten by pi's idle one at the same turn end.
	// The stand-in for pi's report loads after the extension, as herdr's integration does in
	// a Project Manager's session.
	const machine = makeMachine({ listed: OPEN_ASK });
	const pi = startPi(machine, { listed: OPEN_ASK, piReport: true });
	try {
		await pi.turn("plan the next Bead");
		const calls = await waitForLines(machine.herdrLog, 2);

		assert.deepEqual(calls, [
			IDLE_REPORT,
			`pane report-agent ${pane} --source factory:asks --agent pi --state blocked`,
		]);
	} finally {
		await pi.stop();
	}
});
