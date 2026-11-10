/**
 * FactoryClaw checks nothing about Claude usage and cannot run such a check even if told to:
 * the Chains carry a Project Manager and its reviews past an account that runs out, and the
 * model-roles skill holds the Human's model preferences (fac-vse). The seam is installation:
 * scripts/install.sh runs against a temporary Mac, and the test reads back the allowlist it
 * sent OpenClaw and the instructions it put in FactoryClaw's workspace.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac, type Mac } from "./fixtures/install-mac.ts";

/** Install into a fresh Mac, the way the example Profile names FactoryClaw as the outer layer. */
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

/** FactoryClaw's own instructions: its three files and the skills install copies beside them. */
const instructions = (mac: Mac): { file: string; text: string }[] => {
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
			{ pattern: join(mac.home, ".local", "bin", "archon"), argPattern: "^workflow (status|runs)( |$)" },
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
		// The helpers the Workflows and the Project Manager call still are, so the check
		// above is about this one helper rather than an install that copied no helper.
		assert.ok(existsSync(join(bin, "node-prompts")), "the other helpers are installed");
		assert.ok(existsSync(join(bin, "land")), "the other helpers are installed");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("FactoryClaw's installed instructions say nothing about Claude", () => {
	const mac = installedMac();
	try {
		for (const { file, text } of instructions(mac)) {
			assert.doesNotMatch(text, /claude/i, `${file} says nothing about Claude`);
		}
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
