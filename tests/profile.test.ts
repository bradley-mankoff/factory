/**
 * The Profile is one Mac's settings file (GLOSSARY.md, `Profile`; fac-qpv.6.3, fac-qpv.6.7).
 * The seam is installation: scripts/install.sh runs with a temporary HOME and stand-ins at
 * the system's edges (OpenClaw, Archon, herdr, launchd, pi and npm), and the test reads back
 * the files install leaves on that Mac and the log each stand-in wrote. Nothing here looks
 * inside install.sh.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac, profileValue, repoRoot as root, shippedProfile, squashProfile } from "./fixtures/install-mac.ts";

test("install copies the one example Profile when none exists and never overwrites it", () => {
	const mac = makeMac();
	try {
		const first = mac.install();
		assert.equal(first.status, 0, first.stderr || first.stdout);
		assert.equal(readFileSync(mac.profile, "utf8"), shippedProfile(), "install ships the example Profile");

		// A Profile the person has edited is the Mac's own: install must leave it alone.
		const mine = readFileSync(mac.profile, "utf8").replace("PM_MODEL=chain/pm", "PM_MODEL=test/mine");
		writeFileSync(mac.profile, mine);
		const second = mac.install();
		assert.equal(second.status, 0, second.stderr || second.stdout);
		assert.equal(readFileSync(mac.profile, "utf8"), mine, "a second install leaves the Profile as it is");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("with the example Profile install writes FactoryClaw's files and uses the default Archon home", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const claw = join(mac.home, ".openclaw", "workspace-factoryclaw");
		assert.equal(readFileSync(join(claw, "AGENTS.md"), "utf8"), readFileSync(join(root, "factoryclaw", "AGENTS.md"), "utf8"));
		assert.ok(existsSync(join(claw, "skills", "panes", "SKILL.md")), "FactoryClaw's skills are installed");
		assert.ok(existsSync(join(claw, "demos")), "FactoryClaw's demo folder is installed");
		assert.match(logOf(mac.logs.launchctl), /bootstrap gui\/\d+ .*factory\.herdr\.plist/, "the herdr job is started at login");
		assert.match(
			logOf(mac.logs.openclaw),
			/config set agents\.entries\.factoryclaw\.model opencode-go\/muse-spark-1\.3-contributor/,
			"FactoryClaw's model comes from the Profile",
		);

		const archon = join(mac.home, ".local", "share", "factory", "archon");
		assert.ok(existsSync(join(archon, "workflows", "factory", "build", "build.yaml")), "the core Workflows are in the default Archon home");
		const wrapped = spawnSync(join(mac.home, ".local", "bin", "archon"), ["--version"], { encoding: "utf8", env: mac.env });
		assert.equal(wrapped.status, 0, wrapped.stderr);
		assert.ok(logOf(mac.logs.archon).includes(`ARCHON_HOME=${archon} `), "the wrapper points Archon at that home");
		assert.ok(
			logOf(mac.logs.archon).includes(`LIBRARY=${join(archon, "workflows")} `),
			"the wrapper points a Run at the Profile's Workflow library",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a Mac whose Profile chooses the squash landing installs no FactoryClaw or OpenClaw file and puts Archon's home and library where the Profile says", () => {
	const extra = "LIBRARY=$HOME/factory-local/library\n";
	const mac = makeMac({ profile: squashProfile, profileExtra: extra });
	try {
		assert.equal(readFileSync(mac.profile, "utf8"), squashProfile + extra, "install leaves the Mac's own Profile as it is");
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(existsSync(join(mac.home, ".openclaw")), false, "no OpenClaw files exist");
		assert.equal(logOf(mac.logs.openclaw), "", "OpenClaw is never called");
		assert.equal(
			existsSync(join(mac.home, ".local", "share", "factory", "openclaw-plugins")),
			false,
			"FactoryClaw's plugin is not installed",
		);

		const archon = join(mac.home, "factory-local", ".archon");
		const library = join(mac.home, "factory-local", "library");
		assert.ok(existsSync(join(library, "factory", "build", "build.yaml")), "the core Workflows are in the Profile's Workflow library");
		assert.equal(existsSync(join(archon, "workflows")), false, "install does not put a library under the Archon home");
		assert.equal(existsSync(join(mac.home, ".local", "share", "factory", "archon")), false, "the default Archon home is not used");
		assert.equal(
			readFileSync(join(library, "other", "mine", "mine.yaml"), "utf8"),
			"name: mine\n",
			"the person's own Workflows are untouched",
		);
		const wrapped = spawnSync(join(mac.home, ".local", "bin", "archon"), ["--version"], { encoding: "utf8", env: mac.env });
		assert.equal(wrapped.status, 0, wrapped.stderr);
		assert.ok(logOf(mac.logs.archon).includes(`ARCHON_HOME=${archon} `), "the wrapper points Archon at the Profile's home");
		assert.ok(logOf(mac.logs.archon).includes(`LIBRARY=${library} `), "the wrapper points a Run at the Profile's Workflow library");
		// A core Workflow reads its flows from the library the Profile names, not the
		// example's path.
		const build = readFileSync(join(library, "factory", "build", "build.yaml"), "utf8");
		assert.ok(build.includes("${LIBRARY:-$ARCHON_HOME/workflows}/factory/build"), "the installed Workflow follows the Profile's library");
		assert.equal(build.includes("~/.local/share/factory/archon/workflows"), false);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("on a Mac whose Profile chooses the squash landing, setting up a project needs no FactoryClaw and keeps demo videos in the Factory's root", () => {
	const mac = makeMac({ profile: squashProfile });
	try {
		const repo = join(mac.home, "repo");
		mkdirSync(join(repo, ".beads"), { recursive: true });
		execFileSync("git", ["init", "-q", repo]);
		mkdirSync(join(repo, ".archon"), { recursive: true });
		writeFileSync(join(repo, ".archon", ".env"), "FACTORY_CHECK=true\n");
		writeFileSync(join(mac.home, ".config", "factory", "projects"), `${repo}\n`);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(logOf(mac.logs.openclaw), "", "OpenClaw is never called, so no Telegram chat is needed");
		assert.equal(existsSync(join(mac.home, ".openclaw")), false, "no OpenClaw file is written");
		const env = readFileSync(join(repo, ".archon", ".env"), "utf8");
		assert.match(env, /FACTORY_PM_AGENT=pm-repo/);
		assert.ok(env.includes(`FACTORY_DEMOS=${join(mac.home, ".local", "share", "factory", "demos")}`), env);
		assert.equal(env.includes("FACTORYCLAW_SESSION"), false, "no FactoryClaw session is written");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("project setup writes the Profile's git identity into the project's .env and its repo", () => {
	const identity = [
		"GIT_NAME='Bradley Mankoff'",
		"GIT_EMAIL='52721920+bradley-mankoff@users.noreply.github.com'",
	].join("\n");
	const mac = makeMac({ profile: squashProfile + identity + "\n" });
	try {
		const repo = join(mac.home, "repo");
		mkdirSync(join(repo, ".beads"), { recursive: true });
		execFileSync("git", ["init", "-q", repo]);
		mkdirSync(join(repo, ".archon"), { recursive: true });
		writeFileSync(join(repo, ".archon", ".env"), "FACTORY_CHECK=true\n");
		writeFileSync(join(mac.home, ".config", "factory", "projects"), `${repo}\n`);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		// The Run's nodes read these four variables from the project's env.
		const env = readFileSync(join(repo, ".archon", ".env"), "utf8");
		assert.match(env, /^GIT_AUTHOR_NAME='Bradley Mankoff'$/m);
		assert.match(env, /^GIT_COMMITTER_NAME='Bradley Mankoff'$/m);
		assert.match(env, /^GIT_AUTHOR_EMAIL=52721920\+bradley-mankoff@users\.noreply\.github\.com$/m);
		assert.match(env, /^GIT_COMMITTER_EMAIL=52721920\+bradley-mankoff@users\.noreply\.github\.com$/m);

		const config = (key: string) =>
			execFileSync("git", ["-C", repo, "config", "--local", key], { encoding: "utf8" }).trim();
		assert.equal(config("user.name"), "Bradley Mankoff");
		assert.equal(config("user.email"), "52721920+bradley-mankoff@users.noreply.github.com");

		// A commit made with the project's env, as a Run's nodes have it, carries that identity.
		writeFileSync(join(repo, "work.txt"), "work\n");
		execFileSync("git", ["-C", repo, "add", "work.txt"]);
		const commit = spawnSync("sh", ["-c", 'set -a; . "$1"; set +a; git -C "$2" commit -q -m work', "sh", join(repo, ".archon", ".env"), repo], { encoding: "utf8" });
		assert.equal(commit.status, 0, commit.stderr);
		assert.equal(
			execFileSync("git", ["-C", repo, "log", "-1", "--format=%an <%ae> | %cn <%ce>"], { encoding: "utf8" }).trim(),
			"Bradley Mankoff <52721920+bradley-mankoff@users.noreply.github.com> | Bradley Mankoff <52721920+bradley-mankoff@users.noreply.github.com>",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a Profile that names no git identity leaves a project's repo git as it is", () => {
	const mac = makeMac({ profile: squashProfile });
	try {
		const repo = join(mac.home, "repo");
		mkdirSync(join(repo, ".beads"), { recursive: true });
		execFileSync("git", ["init", "-q", repo]);
		execFileSync("git", ["-C", repo, "config", "user.name", "The repo's own name"]);
		execFileSync("git", ["-C", repo, "config", "user.email", "someone@example.test"]);
		mkdirSync(join(repo, ".archon"), { recursive: true });
		writeFileSync(join(repo, ".archon", ".env"), "FACTORY_CHECK=true\n");
		writeFileSync(join(mac.home, ".config", "factory", "projects"), `${repo}\n`);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const env = readFileSync(join(repo, ".archon", ".env"), "utf8");
		assert.equal(env.includes("GIT_AUTHOR_NAME"), false, "project setup writes no identity");
		const config = (key: string) =>
			execFileSync("git", ["-C", repo, "config", "--local", key], { encoding: "utf8" }).trim();
		assert.equal(config("user.name"), "The repo's own name", "the repo's own name is left alone");
		assert.equal(config("user.email"), "someone@example.test", "the repo's own email is left alone");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the one shipped Profile names the personal Mac's choices", () => {
	const mac = makeMac();
	const example = join(root, "config", "profile");
	const value = (key: string) => profileValue(mac.home, example, key);
	try {
		assert.deepEqual(
			{ landing: value("LANDING"), outer: value("OUTER_LAYER"), workspace: value("WORKSPACE") },
			{ landing: "pull-request", outer: "factoryclaw", workspace: "project" },
		);
		assert.equal(value("PROTECTED_TARGETS"), "");
		assert.equal(value("ARCHON_HOME"), join(mac.home, ".local", "share", "factory", "archon"));
		assert.equal(value("LIBRARY"), join(mac.home, ".local", "share", "factory", "archon", "workflows"));

		// The identity a Run commits as, from the hard rule that the work email never reaches
		// a public repo: the example names the GitHub private address (fac-woi).
		assert.equal(value("GIT_NAME"), "Bradley Mankoff");
		assert.equal(value("GIT_EMAIL"), "52721920+bradley-mankoff@users.noreply.github.com");

		// It names the Chains file install fills in, the Project Manager's role, and the
		// port the board and its links use.
		assert.equal(value("CHAINS"), join(mac.home, ".config", "factory", "chains.json"));
		assert.equal(value("PM_MODEL"), "chain/pm");
		assert.equal(value("BOARD_PORT"), "3917");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
