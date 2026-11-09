/**
 * tell-pm is how a Run's last node leaves its Notice for its Project Manager
 * (GLOSSARY.md, `Notice`; fac-qpv.2.1). The seam is the command itself: run it with the
 * pane and the line it is given, a temporary home and a stand-in herdr on PATH that writes
 * down every call, then read the Notice file it wrote and the log of what it typed. A
 * Notice file belongs to one Project Manager, at ~/.local/share/factory/notices/<pane>.md.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tellPm = path.join(repoRoot, "bin", "tell-pm");

type Result = { status: number | null; stderr: string };

function makeHarness() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-tell-pm-"));
	const home = path.join(root, "home");
	const bin = path.join(root, "bin");
	const herdrLog = path.join(root, "herdr.log");
	fs.mkdirSync(home, { recursive: true });
	fs.mkdirSync(bin, { recursive: true });
	const herdr = path.join(bin, "herdr");
	fs.writeFileSync(herdr, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$HERDR_LOG"\nexit 0\n`);
	fs.chmodSync(herdr, 0o755);

	function env(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
		return {
			...process.env,
			HOME: home,
			PATH: `${bin}:${process.env.PATH}`,
			HERDR_LOG: herdrLog,
			...extraEnv,
		};
	}

	function runTellPm(pane: string, message: string, extraEnv: Record<string, string> = {}, cwd = home): Result {
		const result = spawnSync(tellPm, [pane, message], { cwd, encoding: "utf8", env: env(extraEnv) });
		return { status: result.status, stderr: result.stderr };
	}

	/** The command a Workflow's last node runs: the pane is the message's first field. */
	function runWorkflowNotice(runMessage: string, notice: string): Result {
		const result = spawnSync("/bin/sh", ["-c", '"$0" "${ARGUMENTS%% · *}" "$1"', tellPm, notice], {
			cwd: home,
			encoding: "utf8",
			env: env({ ARGUMENTS: runMessage }),
		});
		return { status: result.status, stderr: result.stderr };
	}

	const noticeFile = (pane: string) => path.join(home, ".local", "share", "factory", "notices", `${pane}.md`);
	const noticeLines = (pane: string): string[] =>
		fs.readFileSync(noticeFile(pane), "utf8").split("\n").filter(Boolean);
	const herdrCalls = () => (fs.existsSync(herdrLog) ? fs.readFileSync(herdrLog, "utf8") : "");

	return { root, home, runTellPm, runWorkflowNotice, noticeFile, noticeLines, herdrCalls };
}

test("tell-pm appends one dated line to the pane's Notice file and types nothing into any pane", () => {
	const harness = makeHarness();

	const first = harness.runTellPm("pm-factory", "Run 50ae54e5 (factory-build) for Bead fac-qpv.2.1 ended failed.");
	const second = harness.runTellPm("pm-factory", "Run 61bf65f6 (factory-build) for Bead fac-qpv.2.2 ended merged.");

	assert.equal(first.status, 0, first.stderr);
	assert.equal(second.status, 0, second.stderr);
	const lines = harness.noticeLines("pm-factory");
	assert.equal(lines.length, 2, "each call adds one line");
	assert.match(lines[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} Run 50ae54e5 \(factory-build\) for Bead fac-qpv\.2\.1 ended failed\.$/);
	assert.match(lines[1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} Run 61bf65f6 \(factory-build\) for Bead fac-qpv\.2\.2 ended merged\.$/);
	assert.equal(harness.herdrCalls(), "", "tell-pm must not type into any pane");
});

test("tell-pm names the Notice file after the pane it is given, not the folder it runs in", () => {
	// The pane is the whole address of a Notice: the Run's message starts with it, and the
	// last node passes it on. Nothing else names the file (fac-qpv.9).
	const harness = makeHarness();
	const project = path.join(harness.root, "My.Project_Name");
	fs.mkdirSync(project, { recursive: true });

	const result = harness.runTellPm("pm-build-1", "Run 50ae54e5 for Bead fac-qpv.2.1 ended failed.", { FACTORY_PM_AGENT: "pm-elsewhere" }, project);

	assert.equal(result.status, 0, result.stderr);
	assert.match(fs.readFileSync(harness.noticeFile("pm-build-1"), "utf8"), /Run 50ae54e5/);
	assert.equal(fs.existsSync(harness.noticeFile("pm-elsewhere")), false, "the environment does not name the file");
	assert.equal(fs.existsSync(harness.noticeFile("pm-my-project_name")), false, "the folder does not name the file");
});

test("a Workflow's last node gives tell-pm the pane from the first field of '<pane> · <bead id>'", () => {
	// Every Workflow starts a Run with "<pane> · <bead id>" as its message and its last node
	// passes "${ARGUMENTS%% · *}" to tell-pm (fac-qpv.9).
	const harness = makeHarness();

	const result = harness.runWorkflowNotice("pm-factory · fac-qpv.9", "Run 50ae54e5 (factory-build) for Bead fac-qpv.9 ended merged.");

	assert.equal(result.status, 0, result.stderr);
	assert.match(fs.readFileSync(harness.noticeFile("pm-factory"), "utf8"), /Run 50ae54e5/);
});

test("a message that carries a line break still makes one Notice line", () => {
	const harness = makeHarness();

	const result = harness.runTellPm("pm-factory", "Run 50ae54e5 ended failed.\nThe merge node failed.");

	assert.equal(result.status, 0, result.stderr);
	const lines = harness.noticeLines("pm-factory");
	assert.equal(lines.length, 1, "the extension delivers one line as one Notice");
	assert.match(lines[0], /Run 50ae54e5 ended failed\. The merge node failed\.$/);
});
