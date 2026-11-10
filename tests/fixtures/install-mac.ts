/**
 * One temporary Mac, for the tests whose seam is installation: a HOME with the files a Mac
 * already has, and stand-ins on PATH for the commands scripts/install.sh calls outside the
 * Factory (OpenClaw, Archon, herdr, launchd, pi, npm and bdui). A test reads back the files
 * install leaves on that Mac and the log each stand-in wrote; nothing looks inside
 * install.sh.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The example Profile this repo ships, before install copies it to a Mac. */
export const shippedProfile = (): string => readFileSync(join(repoRoot, "config", "profile"), "utf8");

/**
 * A Profile a Mac that keeps its work local writes for itself: the squash landing, the
 * worktree shape, no outer layer, and placeholder repos and folders. No such Profile ships
 * in this repo (fac-qpv.6.7); a test that needs one writes it here.
 */
export const squashProfile =
	[
		"# A Mac whose Profile keeps its work local.",
		"LANDING=squash",
		"WORKSPACE=worktree",
		"OUTER_LAYER=none",
		'PROTECTED_TARGETS="myrepo:main,develop otherrepo"',
		"PM_MODEL=chain/pm",
		"BOARD_PORT=3917",
		"CHAINS=$HOME/.config/factory/chains.json",
		"ARCHON_HOME=$HOME/factory-local/.archon",
		"LIBRARY=$HOME/factory-local/.archon/workflows",
	].join("\n") + "\n";

/** A stand-in at one edge of the system: a command that writes down how it was called. */
export const stub = (path: string, body: string) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `#!/bin/sh\n${body}\n`);
	chmodSync(path, 0o755);
};

export type Mac = {
	home: string;
	profile: string;
	env: NodeJS.ProcessEnv;
	logs: {
		openclaw: string;
		// The approvals file install sends back with `openclaw approvals set`.
		approvals: string;
		archon: string;
		launchctl: string;
		bdui: string;
		registered: string;
		pi: string;
		swift: string;
		codesign: string;
	};
	install: () => { status: number | null; stdout: string; stderr: string };
};

/** The value a Profile gives a key, read the way the scripts read it: source it and ask. */
export const profileValue = (home: string, path: string, key: string): string =>
	execFileSync("/bin/sh", ["-c", '. "$1"\neval "value=\\$$2"\nprintf "%s" "$value"', "sh", path, key], {
		encoding: "utf8",
		env: { ...process.env, HOME: home },
	});

/**
 * One temporary Mac: a HOME with the files this Mac already has, and stand-ins on PATH for
 * the commands install calls outside the Factory. With a Profile already in place, install
 * must follow it; with none, install ships the example.
 */
export const makeMac = (options: { profile?: string; profileExtra?: string } = {}): Mac => {
	const dir = mkdtempSync(join(tmpdir(), "factory-install-"));
	const home = join(dir, "home");
	const bin = join(dir, "bin");
	const logs = {
		openclaw: join(dir, "openclaw.log"),
		approvals: join(dir, "approvals.log"),
		archon: join(dir, "archon.log"),
		launchctl: join(dir, "launchctl.log"),
		bdui: join(dir, "bdui.log"),
		// The workspaces the board knows, as beads-ui keeps them: one per path.
		registered: join(dir, "board.registered"),
		// Each `pi` call, as its agent folder and its arguments.
		pi: join(dir, "pi.log"),
		// Swift and codesign, which the Factory installs no app with; a test reads these to
		// prove install builds and signs nothing.
		swift: join(dir, "swift.log"),
		codesign: join(dir, "codesign.log"),
	};
	mkdirSync(join(home, ".config", "factory"), { recursive: true });
	const profile = join(home, ".config", "factory", "profile");
	if (options.profile) writeFileSync(profile, options.profile + (options.profileExtra ?? ""));
	// The Human's skill folders, where install links the Factory's skills.
	mkdirSync(join(home, ".agents", "skills"), { recursive: true });
	mkdirSync(join(home, ".pi", "agent"), { recursive: true });
	// FactoryClaw's OpenClaw workspace, which a Mac with an outer layer has before install
	// runs; a Mac whose Profile names none has no such folder. A Mac with no Profile gets
	// the shipped example.
	if (!options.profile || profileValue(home, profile, "OUTER_LAYER") === "factoryclaw") {
		mkdirSync(join(home, ".openclaw", "workspace-factoryclaw"), { recursive: true });
	}
	// Where the launchd jobs go, as every Mac has it.
	mkdirSync(join(home, "Library", "LaunchAgents"), { recursive: true });
	mkdirSync(bin, { recursive: true });

	// Archon's home, as this Mac would already have it: a binary at the release install
	// pins, its pi provider, and the Workflow library with the person's own group beside
	// the core one. The test does not check the binary's version; it checks where install
	// points Archon.
	const archonHome = options.profile
		? profileValue(home, profile, "ARCHON_HOME")
		: join(home, ".local", "share", "factory", "archon");
	const library = options.profile ? profileValue(home, profile, "LIBRARY") : join(archonHome, "workflows");
	stub(
		join(archonHome, "bin", "archon"),
		`printf 'ARCHON_HOME=%s LIBRARY=%s args=%s\\n' "\${ARCHON_HOME-}" "\${LIBRARY-}" "$*" >> "$ARCHON_LOG"
case "$1" in --version) printf 'archon v0.12.1\\n' ;; esac
exit 0`,
	);
	mkdirSync(join(archonHome, "plugins", "installed", "coleam00", "Archon", "plugins", "provider-pi"), { recursive: true });
	writeFileSync(
		join(archonHome, "plugins", "installed", "coleam00", "Archon", "plugins", "provider-pi", "receipt.json"),
		'{"tag": "v0.12.1"}\n',
	);
	mkdirSync(library, { recursive: true });
	writeFileSync(join(library, ".git"), "gitdir: ../library.git\n");
	mkdirSync(join(library, "other", "mine"), { recursive: true });
	writeFileSync(join(library, "other", "mine", "mine.yaml"), "name: mine\n");

	// The installed files the version checks read, so install never reaches for the network.
	const piAgent = join(home, ".local", "share", "factory", "pi-agent");
	mkdirSync(join(piAgent, "npm", "node_modules", "pi-claude-bridge"), { recursive: true });
	writeFileSync(join(piAgent, "npm", "node_modules", "pi-claude-bridge", "package.json"), '{"version": "0.9.3"}\n');
	mkdirSync(join(home, ".local", "share", "factory", "demo", "node_modules", "playwright-core"), { recursive: true });
	// The Human's plain-voice skill, which FactoryClaw's workspace copies.
	mkdirSync(join(home, "Developer", "personal_code", "pi-plain-voice", "skills", "plain-voice"), { recursive: true });
	writeFileSync(join(home, "Developer", "personal_code", "pi-plain-voice", "skills", "plain-voice", "SKILL.md"), "# plain-voice\n");

	stub(
		join(bin, "pi"),
		`printf '%s\\t%s\\n' "\${PI_CODING_AGENT_DIR-}" "$*" >> "$PI_LOG"
case "$1" in --version) printf "1.3.0\\n" ;; esac
exit 0`,
	);
	stub(join(bin, "npm"), 'printf "%s\\n" "$HOME/.npm-root"');
	stub(
		join(bin, "openclaw"),
		`printf '%s\\n' "$*" >> "$OPENCLAW_LOG"
case "$1 $2" in
	"plugins inspect") exit 0 ;;
	"approvals get") printf '{"file":{}}\\n' ;;
	"approvals set") cat >> "$APPROVALS_LOG" ;;
esac
exit 0`,
	);
	stub(join(bin, "herdr"), "exit 0");
	// launchd, as far as install can tell: a job it bootstraps is loaded until it is
	// booted out, so a second install leaves a loaded job alone instead of starting it
	// again. The log is what install asked; the state file is what the Mac has loaded.
	stub(
		join(bin, "launchctl"),
		`printf '%s\\n' "$*" >> "$LAUNCHCTL_LOG"
loaded=$HOME/.launchctl-loaded
touch "$loaded"
case "$1" in
print)
	label=$(printf '%s' "$2" | sed 's|.*/||')
	grep -qxF "$label" "$loaded"
	exit
	;;
bootstrap)
	label=$(basename "$3" .plist)
	grep -qxF "$label" "$loaded" && exit 0
	printf '%s\\n' "$label" >> "$loaded"
	exit
	;;
bootout)
	label=$(printf '%s' "$2" | sed 's|.*/||')
	grep -vxF "$label" "$loaded" > "$loaded.new" || true
	mv "$loaded.new" "$loaded"
	;;
esac
exit 0`,
	);
	// beads-ui, as far as install can tell: each project's path is one workspace, keyed by
	// its path the way the running server keeps them, and a start from a folder with no
	// Beads database registers nothing.
	stub(
		join(bin, "bdui"),
		`printf '%s\\t%s\\n' "$PWD" "$*" >> "$BDUI_LOG"
case "$1" in
start)
	[ -d "$PWD/.beads" ] || exit 0
	grep -qxF "$PWD" "$BDUI_REGISTERED" || printf '%s\\n' "$PWD" >> "$BDUI_REGISTERED"
	;;
esac
exit 0`,
	);

	// The Swift toolchain and codesign: the Factory installs no app of its own, so these
	// only record that something tried to build or sign one, and fail so that attempt
	// cannot write into the fake Mac.
	stub(join(bin, "swift"), `printf '%s\\n' "$*" >> "$SWIFT_LOG"\nexit 1`);
	stub(join(bin, "codesign"), `printf '%s\\n' "$*" >> "$CODESIGN_LOG"\nexit 1`);

	const env: NodeJS.ProcessEnv = {
		...process.env,
		HOME: home,
		PATH: `${bin}:${process.env.PATH}`,
		OPENCLAW_LOG: logs.openclaw,
		APPROVALS_LOG: logs.approvals,
		ARCHON_LOG: logs.archon,
		LAUNCHCTL_LOG: logs.launchctl,
		BDUI_LOG: logs.bdui,
		BDUI_REGISTERED: logs.registered,
		PI_LOG: logs.pi,
		SWIFT_LOG: logs.swift,
		CODESIGN_LOG: logs.codesign,
	};
	// The Profile is the one place a Mac's settings come from, not an inherited shell.
	delete env.ARCHON_HOME;
	delete env.LIBRARY;

	const install = () => spawnSync(join(repoRoot, "scripts", "install.sh"), [], { cwd: home, encoding: "utf8", env });

	return { home, profile, env, logs, install };
};

/** Read a log a stand-in wrote; a command never run leaves no file. */
export const logOf = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8") : "");
