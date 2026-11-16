/**
 * FactoryClaw checks nothing about Claude usage and cannot run such a check even if told to:
 * the Chains carry a Project Manager and its reviews past an account that runs out, and the
 * model-roles skill holds the Human's model preferences (fac-vse). The seam is installation:
 * scripts/install.sh runs against a temporary Mac, and the test reads back the allowlist it
 * sent OpenClaw, the helpers it installed and the instructions it put in FactoryClaw's
 * workspace.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac, type Mac } from "./fixtures/install-mac.ts";

/** Install into a fresh Mac with the example Profile, which names FactoryClaw as the outer layer. */
const installedMac = (): Mac => {
	const mac = makeMac();
	const result = mac.install();
	if (result.status !== 0) {
		// The test's own finally has not started yet, so this path tidies up after a failed
		// install itself rather than leaving the temporary Mac behind.
		rmSync(dirname(mac.home), { recursive: true, force: true });
		assert.fail(result.stderr || result.stdout);
	}
	return mac;
};

/** FactoryClaw's own instruction files: its three files and the skills install copies beside them. */
const instructionFiles = (mac: Mac): { file: string; text: string }[] => {
	const workspace = join(mac.home, ".openclaw", "workspace-factoryclaw");
	const files = ["AGENTS.md", "BOOT.md", "HEARTBEAT.md"].map((name) => join(workspace, name));
	for (const skill of readdirSync(join(workspace, "skills"))) {
		// plain-voice is the Human's skill for writing messages, not FactoryClaw's routing.
		if (skill !== "plain-voice") files.push(join(workspace, "skills", skill, "SKILL.md"));
	}
	return files.map((file) => ({ file, text: readFileSync(file, "utf8") }));
};

test("install gives FactoryClaw exactly the four commands, with no Claude usage check among them", () => {
	const mac = installedMac();
	try {
		// The four commands, and no Claude usage check among them (fac-vse).
		const allowed = JSON.parse(logOf(mac.logs.approvals)).agents.factoryclaw.allowlist;
		assert.deepEqual(allowed, [
			{ pattern: "herdr" },
			{ pattern: "launchctl", argPattern: "^start factory\\.herdr$" },
			{ pattern: "bd", argPattern: "^-C \\S+ (show|list|ready|comments)( |$)" },
			{ pattern: realpathSync(join(mac.home, ".local", "bin", "archon")), argPattern: "^workflow (status|runs)( |$)" },
		]);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install leaves no Claude usage helper among the installed helpers", () => {
	const mac = installedMac();
	try {
		const bin = join(mac.home, ".local", "share", "factory", "bin");
		assert.equal(existsSync(join(bin, "claude-usage")), false, "the Claude usage helper is not installed");
		// The helpers the Workflows and the Project Manager call are installed too, so the check
		// above is about this one helper rather than an install that copied no helper.
		for (const helper of ["node-prompts", "land"]) assert.ok(existsSync(join(bin, helper)), `${helper} is installed`);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("FactoryClaw's installed instructions say nothing about Claude", () => {
	const mac = installedMac();
	try {
		for (const { file, text } of instructionFiles(mac)) {
			assert.doesNotMatch(text, /claude/i, `${file} says nothing about Claude`);
		}
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the panes skill looks for a running Project Manager before it opens one, and types into the one it finds", () => {
	const mac = installedMac();
	try {
		const panes = instructionFiles(mac).find(({ file }) => file.endsWith(join("skills", "panes", "SKILL.md")));
		assert.ok(panes, "install puts the panes skill in FactoryClaw's workspace");
		const text = panes.text;
		// The Human starts his own Project Manager with `pm` in his own terminal, and it is in
		// this server too, so a look at the live agents is the only check that sees it.
		const list = text.indexOf("herdr agent list");
		assert.ok(list >= 0, "the skill names herdr agent list");
		assert.ok(list < text.indexOf("workspace create"), "the skill looks before it opens a pane");
		const found = text
			.split("\n")
			.find((line) => line.includes("agent list") && line.includes("<pane>"));
		assert.ok(found, "a line of the skill looks the project's pane up in the list");
		assert.match(text, /herdr agent prompt <pane>/, "the skill types into a Project Manager it found");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("FactoryClaw's installed instructions name no herdr session", () => {
	const mac = installedMac();
	try {
		for (const { file, text } of instructionFiles(mac)) {
			assert.doesNotMatch(
				text,
				/--session|session attach factory|session `factory`/,
				`${file} names no herdr session, so FactoryClaw sees the panes the Human sees`,
			);
		}
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
