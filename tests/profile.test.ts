/**
 * The Profile is one Mac's settings file (GLOSSARY.md, `Profile`; fac-qpv.6.3, fac-qpv.6.7).
 * The seam is installation: scripts/install.sh runs with a temporary HOME and stand-ins at
 * the system's edges (OpenClaw, Archon, herdr, tailscale, launchd, pi and npm), and the test
 * reads back the files install leaves on that Mac and the log each stand-in wrote. Nothing
 * here looks inside install.sh.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, type Mac, makeMac, pinnedValue, profileValue, repoRoot as root, shippedProfile, squashProfile } from "./fixtures/install-mac.ts";

/**
 * The commit identity the tests expect a Run to use: a name and GitHub's private address,
 * the only address a public repo may carry, because the Human's work email must never reach
 * one (fac-woi).
 */
const gitName = "Bradley Mankoff";
const gitEmail = "52721920+bradley-mankoff@users.noreply.github.com";
const runIdentity = `${gitName} <${gitEmail}>`;

/**
 * A project repo on this Mac, ready for install: git and Beads as `bd init` leaves them, a
 * .env holding the check command, and an entry in the one list of projects.
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

/** The demo folder install makes, ~/.local/share/factory/demos. */
const demosFolder = (mac: Mac): string => join(mac.home, ".local", "share", "factory", "demos");

/** A value the project's own repo holds in its local git config. */
const gitConfig = (repo: string, key: string): string =>
	execFileSync("git", ["-C", repo, "config", "--local", key], { encoding: "utf8" }).trim();

/** One value install wrote into the project's .env, or undefined when the key is absent. */
const envValue = (repo: string, key: string): string | undefined =>
	readFileSync(join(repo, ".archon", ".env"), "utf8")
		.split("\n")
		.find((line) => line.startsWith(`${key}=`))
		?.slice(key.length + 1);

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

test("install copies the example Chains when a Mac has none and never overwrites the Chains it has", () => {
	const mac = makeMac();
	try {
		const first = mac.install();
		assert.equal(first.status, 0, first.stderr || first.stdout);
		const chains = join(mac.home, ".config", "factory", "chains.json");
		assert.equal(
			readFileSync(chains, "utf8"),
			readFileSync(join(root, "config", "chains.json"), "utf8"),
			"install ships the example Chains",
		);

		// A Mac's Chains name accounts that exist on that Mac, so the copy is the Mac's own.
		const mine = `${JSON.stringify({ work: [{ model: "test/local-model", thinking: "max" }] }, null, 2)}\n`;
		writeFileSync(chains, mine);
		const second = mac.install();
		assert.equal(second.status, 0, second.stderr || second.stdout);
		assert.equal(readFileSync(chains, "utf8"), mine, "a second install leaves this Mac's Chains as they are");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install skips a listed project whose folder is gone and still sets up the ones after it", () => {
	// The squash Profile, because the stand-in Mac cannot answer FactoryClaw's project setup;
	// the loop that skips the folder is the same under either Profile.
	const mac = makeMac({ profile: squashProfile });
	try {
		const repo = projectRepo(mac);
		const gone = join(mac.home, "gone");
		writeFileSync(join(mac.home, ".config", "factory", "projects"), `${gone}\n${repo}\n`);
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.match(result.stderr, /skipped: .*gone is in .*projects but not on this Mac/);
		assert.match(readFileSync(join(repo, ".archon", ".env"), "utf8"), /FACTORY_PM_AGENT=pm-repo/, "the project after the missing one is set up");
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
		assert.ok(existsSync(join(archon, "workflows", "factory", "factory-build", "factory-build.yaml")), "the core Workflows are in the default Archon home");
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
		assert.ok(existsSync(join(library, "factory", "factory-build", "factory-build.yaml")), "the core Workflows are in the Profile's Workflow library");
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
		const buildYaml = readFileSync(join(library, "factory", "factory-build", "factory-build.yaml"), "utf8");
		assert.ok(buildYaml.includes("${LIBRARY:-$ARCHON_HOME/workflows}/factory/factory-build"), "the installed Workflow follows the Profile's library");
		assert.equal(buildYaml.includes("~/.local/share/factory/archon/workflows"), false);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install makes the Factory's demo folder, names it in the project's .env, and links FactoryClaw's workspace demos to it", () => {
	const mac = makeMac();
	try {
		const repo = projectRepo(mac);
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const demos = demosFolder(mac);
		assert.ok(statSync(demos).isDirectory(), "install makes the Factory's demo folder");
		assert.equal(envValue(repo, "FACTORY_DEMOS"), demos, "the project's .env names the Factory's folder");
		const workspaceDemos = join(mac.home, ".openclaw", "workspace-factoryclaw", "demos");
		assert.ok(lstatSync(workspaceDemos).isSymbolicLink(), "FactoryClaw's workspace demos is a link");
		assert.equal(realpathSync(workspaceDemos), realpathSync(demos), "the link reaches the Factory's folder");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install over the folder an earlier install made moves its videos to the Factory's folder and links the workspace demos there", () => {
	const mac = makeMac();
	try {
		const old = join(mac.home, ".openclaw", "workspace-factoryclaw", "demos");
		mkdirSync(old, { recursive: true });
		writeFileSync(join(old, "run-old.mp4"), "the video");

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const demos = demosFolder(mac);
		assert.equal(readFileSync(join(demos, "run-old.mp4"), "utf8"), "the video", "the old video moves to the Factory's folder");
		assert.equal(realpathSync(old), realpathSync(demos), "the workspace demos is a link to it");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

/**
 * The port install pins for the server that publishes the demo folder. The top of
 * scripts/install.sh is the one place it lives, so the login job and the tailscale serve
 * command cannot name two ports (fac-3mz.10).
 */
const demosPort = pinnedValue("demos_port");

test("a Profile with DEMOS_SERVE=tailscale starts a login job that runs the demo server over the demo folder at the pinned port", () => {
	const mac = makeMac({ profile: squashProfile, profileExtra: "DEMOS_SERVE=tailscale\n" });
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const job = JSON.parse(
			execFileSync("plutil", ["-convert", "json", "-o", "-", join(mac.home, "Library", "LaunchAgents", "factory.demos.plist")], {
				encoding: "utf8",
			}),
		);
		assert.equal(job.Label, "factory.demos");
		assert.equal(job.RunAtLoad, true, "the server starts at login");
		assert.deepEqual(
			job.ProgramArguments,
			[join(mac.home, ".local", "share", "factory", "bin", "demos-serve"), demosFolder(mac), String(demosPort)],
			"the job runs the Factory's server over the demo folder at the pinned port",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a Profile with DEMOS_SERVE=tailscale publishes the demo folder at /demos, forwarded to the local server", () => {
	const mac = makeMac({ profile: squashProfile, profileExtra: "DEMOS_SERVE=tailscale\n" });
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		// The Mac App Store edition of Tailscale cannot serve a folder from disk, and it can
		// forward a path to a server, which is what the login job above runs (fac-3mz.10).
		assert.equal(logOf(mac.logs.tailscale).trim(), `serve --bg --set-path /demos http://127.0.0.1:${demosPort}`);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a second install leaves one demo job and one tailnet entry", () => {
	const mac = makeMac({ profile: squashProfile, profileExtra: "DEMOS_SERVE=tailscale\n" });
	try {
		assert.equal(mac.install().status, 0);
		const afterFirst = logOf(mac.logs.launchctl);
		assert.equal(mac.install().status, 0);

		const serve = `serve --bg --set-path /demos http://127.0.0.1:${demosPort}`;
		assert.deepEqual(logOf(mac.logs.tailscale).trim().split("\n"), [serve, serve], "both installs set the same path to the same target, so the tailnet holds one entry");
		assert.equal(afterFirst.match(/bootstrap gui\/\d+ .*factory\.demos\.plist/g)?.length, 1, "the first install loads the job once");
		const second = logOf(mac.logs.launchctl).slice(afterFirst.length);
		assert.doesNotMatch(second, /(bootout|bootstrap) gui\/\d+.*factory\.demos/, "a second install leaves the running server alone");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("without DEMOS_SERVE install starts no demo job and publishes nothing", () => {
	const mac = makeMac({ profile: squashProfile });
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(existsSync(join(mac.home, "Library", "LaunchAgents", "factory.demos.plist")), false, "no demo job is written");
		assert.doesNotMatch(logOf(mac.logs.launchctl), /factory\.demos/, "no demo job is loaded");
		assert.equal(logOf(mac.logs.tailscale), "", "tailscale is never called");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the one shipped Profile documents DEMOS_URL and DEMOS_SERVE beside the other choices", () => {
	const profile = shippedProfile();
	assert.match(profile, /^# DEMOS_URL=/m, "the example shows how DEMOS_URL is written");
	assert.match(profile, /^# DEMOS_SERVE=tailscale$/m, "the example shows how DEMOS_SERVE is written");
});

test("on a Mac whose Profile chooses the squash landing, setting up a project needs no FactoryClaw and keeps demo videos in the Factory's root", () => {
	const mac = makeMac({ profile: squashProfile });
	try {
		const repo = projectRepo(mac);

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

test("project setup writes the Profile's commit identity into the project's .env and its repo", () => {
	const identity = [`GIT_NAME='${gitName}'`, `GIT_EMAIL='${gitEmail}'`].join("\n");
	const mac = makeMac({ profile: squashProfile + identity + "\n" });
	try {
		const repo = projectRepo(mac);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		// The Run's nodes read these four variables from the project's env, written as the
		// shell needs them: the name quoted for its space, the address as it is.
		assert.equal(envValue(repo, "GIT_AUTHOR_NAME"), `'${gitName}'`);
		assert.equal(envValue(repo, "GIT_COMMITTER_NAME"), `'${gitName}'`);
		assert.equal(envValue(repo, "GIT_AUTHOR_EMAIL"), gitEmail);
		assert.equal(envValue(repo, "GIT_COMMITTER_EMAIL"), gitEmail);

		// The project's own repo holds the same identity, so a commit needs no env at all.
		assert.equal(gitConfig(repo, "user.name"), gitName);
		assert.equal(gitConfig(repo, "user.email"), gitEmail);

		// A commit made with the project's env, as a Run's nodes have it, carries that identity.
		writeFileSync(join(repo, "work.txt"), "work\n");
		execFileSync("git", ["-C", repo, "add", "work.txt"]);
		const commit = spawnSync(
			"sh",
			["-c", 'set -a; . "$1"; set +a; git -C "$2" commit -q -m work', "sh", join(repo, ".archon", ".env"), repo],
			{ encoding: "utf8" },
		);
		assert.equal(commit.status, 0, commit.stderr);
		assert.equal(
			execFileSync("git", ["-C", repo, "log", "-1", "--format=%an <%ae> | %cn <%ce>"], { encoding: "utf8" }).trim(),
			`${runIdentity} | ${runIdentity}`,
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("project setup gives the project's repo the maintainer Beads role, so a fork reads its own Beads", () => {
	// `bd init` in a repo that has an `upstream` remote (a fork) leaves beads.role=contributor,
	// and bd then reads the empty contributor planning store instead of the repo's own .beads,
	// so `bd ready` shows no work (fac-3zx). The role bd reads is the repo's local git config.
	const mac = makeMac({ profile: squashProfile });
	try {
		const repo = projectRepo(mac);
		execFileSync("git", ["-C", repo, "remote", "add", "origin", "git@github.com:bradley-mankoff/thing.git"]);
		execFileSync("git", ["-C", repo, "remote", "add", "upstream", "git@github.com:ndokutovich/thing.git"]);
		execFileSync("git", ["-C", repo, "config", "beads.role", "contributor"]);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(gitConfig(repo, "beads.role"), "maintainer", "the fork's repo carries the role bd reads to plan from its own Beads");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a Profile that names no commit identity leaves the project's repo as it is", () => {
	const mac = makeMac({ profile: squashProfile });
	try {
		const repo = projectRepo(mac);
		execFileSync("git", ["-C", repo, "config", "user.name", "The repo's own name"]);
		execFileSync("git", ["-C", repo, "config", "user.email", "someone@example.test"]);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(envValue(repo, "GIT_AUTHOR_NAME"), undefined, "project setup writes no identity");
		assert.equal(gitConfig(repo, "user.name"), "The repo's own name", "the repo's own name is left alone");
		assert.equal(gitConfig(repo, "user.email"), "someone@example.test", "the repo's own email is left alone");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install links the factory command that puts and lists Asks into ~/.local/bin", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const link = join(mac.home, ".local", "bin", "factory");
		assert.ok(lstatSync(link).isSymbolicLink(), "~/.local/bin/factory is a link");
		assert.equal(
			realpathSync(link),
			realpathSync(join(mac.home, ".local", "share", "factory", "bin", "factory")),
			"the link resolves to the Factory's own command",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install accepts a Profile that names no CONNECTORS, as one written before the key does", () => {
	// An existing Profile is never overwritten, so the key has to be optional.
	const mac = makeMac({ profile: squashProfile });
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);
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
			{ landing: value("LANDING"), outer: value("OUTER_LAYER"), workspace: value("WORKSPACE"), connectors: value("CONNECTORS") },
			{ landing: "pull-request", outer: "factoryclaw", workspace: "project", connectors: "factoryclaw" },
		);
		assert.equal(value("PROTECTED_TARGETS"), "");
		assert.equal(value("ARCHON_HOME"), join(mac.home, ".local", "share", "factory", "archon"));
		assert.equal(value("LIBRARY"), join(mac.home, ".local", "share", "factory", "archon", "workflows"));

		// The commit identity a Run uses, from the hard rule that the work email never reaches
		// a public repo: the example names the GitHub private address (fac-woi).
		assert.equal(value("GIT_NAME"), gitName);
		assert.equal(value("GIT_EMAIL"), gitEmail);

		// It names the Chains file install fills in, the Project Manager's role, and the
		// port the board and its links use.
		assert.equal(value("CHAINS"), join(mac.home, ".config", "factory", "chains.json"));
		assert.equal(value("PM_MODEL"), "chain/pm");
		assert.equal(value("BOARD_PORT"), "3917");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
