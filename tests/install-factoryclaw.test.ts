/**
 * FactoryClaw's settings and instructions, read from the workspace install fills: it checks
 * nothing about Claude usage and cannot run such a check even if told to, because the Chains
 * carry a Project Manager and its reviews past an account that runs out, and the model-roles
 * skill holds the Human's model preferences (fac-vse). It reaches its Project Managers
 * through herdr's default server, the one the Human's own windows attach to, so it finds the
 * Project Manager he started himself instead of opening a second (fac-6l8). The seam is
 * installation: scripts/install.sh runs against a temporary Mac, and the test reads back the
 * allowlist it sent OpenClaw, the helpers it installed and the instructions it put in
 * FactoryClaw's workspace.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

/**
 * A project repo ready for install: git and Beads as `bd init` leaves them, a .env holding
 * the check command, and an entry in the one list of projects.
 */
const projectRepo = (mac: Mac): string => {
	const repo = join(mac.home, "repo");
	mkdirSync(join(repo, ".beads"), { recursive: true });
	execFileSync("git", ["init", "-q", repo]);
	mkdirSync(join(repo, ".archon"), { recursive: true });
	writeFileSync(join(repo, ".archon", ".env"), "FACTORY_CHECK=true\n");
	writeFileSync(join(mac.home, ".config", "factory", "projects"), `${repo}\n`);
	return repo;
};

/**
 * FactoryClaw's plugin reload fails when OpenClaw's gateway is not loaded or still draining
 * admitted work, and the old plugin generation staying active is safe (fac-hdc). Install
 * says so and carries on, so the projects after that step are still set up.
 */
test("a FactoryClaw plugin reload that fails warns and leaves every project set up", () => {
	const mac = makeMac({ pluginReloadFails: true });
	try {
		const repo = projectRepo(mac);
		const result = mac.install();
		assert.match(result.stderr, /note: workshop-catch's reload/, "install says the reload did not finish");
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.match(
			readFileSync(join(repo, ".archon", ".env"), "utf8"),
			/FACTORY_PM_AGENT=pm-repo/,
			"the listed project is set up after the failed reload",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

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

/** The panes skill as install leaves it in FactoryClaw's workspace. */
const panesSkill = (mac: Mac): string => {
	const panes = instructionFiles(mac).find(({ file }) => file.endsWith(join("skills", "panes", "SKILL.md")));
	assert.ok(panes, "install puts the panes skill in FactoryClaw's workspace");
	return panes.text;
};

/** The part of a skill under one heading, so a check reads the steps that carry the behaviour. */
const skillSection = (text: string, heading: string): string => {
	const from = text.indexOf(`## ${heading}`);
	assert.ok(from >= 0, `the skill has a ${heading} section`);
	const to = text.indexOf("\n## ", from + 1);
	return text.slice(from, to === -1 ? undefined : to);
};

/** Where one step sits in a section, so a step the section lacks fails here rather than in an order check. */
const stepAt = (text: string, step: string): number => {
	const at = text.indexOf(step);
	assert.ok(at >= 0, `the steps name ${step}`);
	return at;
};

test("the panes skill looks in herdr agent list for a running Project Manager before it opens a pane", () => {
	const mac = installedMac();
	try {
		const start = skillSection(panesSkill(mac), "Start");
		// The Human starts his own Project Manager with `pm` in one of his windows, and it is in
		// this same server, so the live agents are the only check that sees it (fac-6l8).
		assert.ok(
			stepAt(start, "herdr agent list") < stepAt(start, 'open it as "Open"'),
			"Start looks in the list before it opens a pane",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the panes skill prompts the Project Manager it found, instead of opening a second under its name", () => {
	const mac = installedMac();
	try {
		const start = skillSection(panesSkill(mac), "Start");
		assert.ok(
			stepAt(start, "herdr agent prompt <pane>") < stepAt(start, 'open it as "Open"'),
			"Start prompts the pane it found before it opens one",
		);
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
