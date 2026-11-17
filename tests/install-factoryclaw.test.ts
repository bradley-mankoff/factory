/**
 * FactoryClaw's settings and instructions, read from the workspace install fills: it checks
 * nothing about Claude usage and cannot run such a check even if told to, because the Chains
 * carry a Project Manager and its reviews past an account that runs out, and the model-roles
 * skill holds the Human's model preferences (fac-vse). It reaches its Project Managers
 * through herdr's default server, the one the Human's own windows attach to, so it finds the
 * Project Manager he started himself instead of opening a second (fac-6l8). The seam is
 * installation: scripts/install.sh runs against a temporary Mac, and the test reads back the
 * allowlist it sent OpenClaw, the model catalog it wrote there, the helpers it installed and
 * the instructions it put in FactoryClaw's workspace.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac, projectRepo, type Mac } from "./fixtures/install-mac.ts";

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

test("install registers FactoryClaw's model in OpenClaw's catalog with the route OpenCode Go serves it on", () => {
	const mac = installedMac();
	try {
		const config = JSON.parse(readFileSync(join(mac.home, ".openclaw", "openclaw.json"), "utf8"));
		assert.equal(config.agents.entries.factoryclaw.model, "opencode-go/muse-spark-1.3-contributor", "the registered model is the one the Profile names");
		const models: { id: string }[] = config.models.providers["opencode-go"].models;
		// The route is the one OpenCode Go publishes for Muse Spark 1.3 Contributor: an OpenAI
		// Responses model on its Go endpoint, with reasoning on so the Profile's high level
		// still applies (fac-s0q).
		assert.deepEqual(
			models.find((model) => model.id === "muse-spark-1.3-contributor"),
			{
				id: "muse-spark-1.3-contributor",
				name: "Muse Spark 1.3 Contributor",
				api: "openai-responses",
				baseUrl: "https://opencode.ai/inference/go/openai/v1",
				reasoning: true,
			},
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("OpenClaw resolves FactoryClaw's model after install, so its turns no longer fail with Unknown model", () => {
	const mac = installedMac();
	try {
		const resolved = spawnSync("openclaw", ["models", "list", "--agent", "factoryclaw", "--json"], { encoding: "utf8", env: mac.env });
		assert.equal(resolved.status, 0, resolved.stderr || resolved.stdout);
		const listed: { key: string }[] = JSON.parse(resolved.stdout).models;
		assert.ok(
			listed.some((model) => model.key === "opencode-go/muse-spark-1.3-contributor"),
			"the model FactoryClaw runs is among those OpenClaw resolves for it",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install keeps a model the Mac already registered under OpenCode Go's account", () => {
	const mac = makeMac();
	const alreadyRegistered = { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", api: "openai-completions", baseUrl: "https://opencode.ai/zen/go/v1" };
	writeFileSync(join(mac.home, ".openclaw", "openclaw.json"), JSON.stringify({ models: { providers: { "opencode-go": { models: [alreadyRegistered] } } } }));
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);
		const models: { id: string }[] = JSON.parse(readFileSync(join(mac.home, ".openclaw", "openclaw.json"), "utf8")).models.providers["opencode-go"].models;
		assert.deepEqual(models.map((model) => model.id), ["deepseek-v4.1-flash", "muse-spark-1.3-contributor"]);
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

/** One skill as install leaves it in FactoryClaw's workspace. */
const skillText = (mac: Mac, skill: string): string => {
	const found = instructionFiles(mac).find(({ file }) => file.endsWith(join("skills", skill, "SKILL.md")));
	assert.ok(found, `install puts the ${skill} skill in FactoryClaw's workspace`);
	return found.text;
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

test("the panes skill finds a running Project Manager by its pane label and pi agent in herdr pane list", () => {
	const mac = installedMac();
	try {
		const start = skillSection(skillText(mac, "panes"), "Start");
		// herdr names an agent only once it has detected pi, which is after the launcher has
		// exec'd pi, so no launcher can name one before it starts (fac-jke). project-manager/start
		// labels its pane before pi starts, so the pane's label together with the agent on it
		// is what says a Project Manager is running (fac-2gy). The Human's own `pm` starts a
		// Project Manager in this same server and labels the pane the same way, so this look
		// finds his too (fac-6l8).
		assert.match(start, /herdr pane list/, "Start reads herdr pane list");
		assert.match(start, /`label`/, "Start finds the pane by its label");
		assert.match(start, /`agent` is `pi`/, "Start checks for the pi agent on that pane");
		assert.ok(
			stepAt(start, "herdr pane list") < stepAt(start, 'as "Open" below says'),
			"Start looks in the list before it opens a pane",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the panes skill prompts the Project Manager it found, instead of opening a second for the project", () => {
	const mac = installedMac();
	try {
		const start = skillSection(skillText(mac, "panes"), "Start");
		assert.ok(
			stepAt(start, "herdr agent prompt <pane id>") < stepAt(start, 'as "Open" below says'),
			"Start prompts the pane it found before it opens one",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the panes skill lists a project as running when its labelled pane has the pi agent", () => {
	const mac = installedMac();
	try {
		const list = skillSection(skillText(mac, "panes"), "List");
		assert.match(list, /herdr pane list/, "List reads herdr pane list");
		assert.match(list, /`label`/, "List finds each project by its pane's label");
		assert.match(list, /`agent`/, "List checks the agent on that pane");
		assert.match(list, /`pi`/, "List counts a project as running only when pi runs in its pane");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

/**
 * One relay skill finds its Project Manager's pane in `herdr pane list`, by the pane's `label`
 * and the `pi` agent on it, before it types into that pane. A pane carries its label from
 * before pi starts, so the label and the agent on that pane are what say the Project Manager
 * is running, never an agent's name (fac-jke, fac-2gy).
 */
const assertRelayFindsThePane = (skill: string, prompt: string): void => {
	const mac = installedMac();
	try {
		const text = skillText(mac, skill);
		assert.match(text, /herdr pane list/, `${skill} reads herdr pane list`);
		assert.match(text, /`label`/, `${skill} finds the pane by its label`);
		assert.match(text, /`agent` is `pi`/, `${skill} checks for the pi agent on that pane`);
		assert.ok(
			stepAt(text, "herdr pane list") < stepAt(text, prompt),
			`${skill} looks the pane up before it types into it`,
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
};

test("relay-idea finds the Project Manager's pane by its label in herdr pane list", () => {
	// The Idea goes into the pane the project runs in.
	assertRelayFindsThePane("relay-idea", "herdr agent prompt <pane id>");
});

test("relay-message finds the Project Manager's pane by its label in herdr pane list", () => {
	// The Human's answer goes back into the pane that asked, found the same way.
	assertRelayFindsThePane("relay-message", "herdr agent prompt <pane id>");
});

test("FactoryClaw's installed instructions never look a Project Manager up by an agent name", () => {
	const mac = installedMac();
	try {
		for (const { file, text } of instructionFiles(mac)) {
			// herdr gives an agent a name only once it has detected pi, after the launcher has
			// exec'd it, so a name can never say whether a Project Manager runs (fac-jke). The
			// pane's label and its pi agent are what say that instead (fac-2gy).
			assert.doesNotMatch(text, /herdr agent (get|list)/, `${file} finds a Project Manager by its pane, not its agent`);
			assert.doesNotMatch(text, /(agent|Project Manager)'s `name`/, `${file} names no agent's name field for a Project Manager`);
		}
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
