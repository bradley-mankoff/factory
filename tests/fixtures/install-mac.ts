/**
 * One temporary Mac, for the tests whose seam is installation: a HOME with the files a Mac
 * already has, and stand-ins on PATH for the commands scripts/install.sh calls outside the
 * Factory (OpenClaw, Archon, the release's curl, herdr, launchd, pi, npm and bdui). A test
 * reads back the files install leaves on that Mac and the log each stand-in wrote; nothing
 * looks inside install.sh.
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
 * The value scripts/install.sh pins under one name at its top, read the way the installer
 * reads it. Its top is the one place the version set lives (`map/paths.txt`), so a Mac that
 * stands in for this one reports that release rather than a copy of the number here.
 */
export const pinnedValue = (name: string): string => {
	const line = readFileSync(join(repoRoot, "scripts", "install.sh"), "utf8")
		.split("\n")
		.find((each) => each.startsWith(`${name}=`));
	if (!line) throw new Error(`scripts/install.sh pins no ${name}`);
	return line.slice(name.length + 1);
};

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

/** A stand-in at one edge of the system: a command that writes down how it was called.
 * `interpreter` is what runs it, `/bin/sh` unless the stand-in needs another. */
export const stub = (path: string, body: string, interpreter = "/bin/sh") => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `#!${interpreter}\n${body}\n`);
	chmodSync(path, 0o755);
};

export type Mac = {
	home: string;
	profile: string;
	env: NodeJS.ProcessEnv;
	logs: {
		openclaw: string;
		// The approvals file install last sent back with `openclaw approvals set`, whole: a
		// test reads it as one JSON document.
		approvals: string;
		archon: string;
		// Each download install asked for, so a test can prove a Mac already at the pinned
		// release never reaches the network.
		curl: string;
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
 * must follow it; with none, install ships the example. `archonVersion` is the Archon the
 * Mac starts with: the pinned release by default, and an earlier one for a test that
 * watches install move it. `pluginReloadFails` makes OpenClaw refuse a plugin reload, as a
 * gateway still draining its admitted work does.
 */
export const makeMac = (options: {
	profile?: string;
	profileExtra?: string;
	archonVersion?: string;
	pluginReloadFails?: boolean;
} = {}): Mac => {
	const dir = mkdtempSync(join(tmpdir(), "factory-install-"));
	const home = join(dir, "home");
	const bin = join(dir, "bin");
	const logs = {
		openclaw: join(dir, "openclaw.log"),
		approvals: join(dir, "approvals.log"),
		archon: join(dir, "archon.log"),
		curl: join(dir, "curl.log"),
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
	// the core one. The binary reports the Archon version this Mac starts with, and a
	// `provider add pi` writes that version into the receipt, as Archon's own command does.
	// The test does not check the binary's version by default; it checks where install
	// points Archon.
	const archonHome = options.profile
		? profileValue(home, profile, "ARCHON_HOME")
		: join(home, ".local", "share", "factory", "archon");
	const library = options.profile ? profileValue(home, profile, "LIBRARY") : join(archonHome, "workflows");
	const pinnedArchon = `v${pinnedValue("archon_version")}`;
	const archonVersion = options.archonVersion ?? pinnedArchon;
	const receipt = join(archonHome, "plugins", "installed", "coleam00", "Archon", "plugins", "provider-pi", "receipt.json");
	/** An Archon binary that behaves as far as install can tell: it names its version, logs
	 * each call, writes its provider receipt on `provider add`, and lists no aliases. */
	const archonStub = (version: string): string => `
printf 'ARCHON_HOME=%s LIBRARY=%s args=%s\\n' "\${ARCHON_HOME-}" "\${LIBRARY-}" "$*" >> "$ARCHON_LOG"
case "$1" in --version) printf 'archon ${version}\\n' ;; esac
case "$1 $2" in
	"provider add")
		mkdir -p "$(dirname "${receipt}")"
		printf '{"tag": "${version}", "descriptor": {"protocol": 3}}\\n' > "${receipt}"
		;;
	esac
# bin/archon-roles lists the aliases to unset the install-scope ones it does not set;
# this Mac starts with none, and no install test seeds one.
case "$1 $2 $3" in "ai alias list") printf '{"aliases": []}\\n' ;; esac
exit 0`;
	stub(join(archonHome, "bin", "archon"), archonStub(archonVersion));
	mkdirSync(dirname(receipt), { recursive: true });
	writeFileSync(receipt, `{"tag": "${archonVersion}", "descriptor": {"protocol": 3}}\n`);
	// The release asset a download gets, and the checksums file that names it: a binary for
	// the pinned release, so a Mac on an earlier one can be moved without the network.
	const asset = join(dir, "archon-release");
	const assetName = `archon-${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
	writeFileSync(asset, `#!/bin/sh\n${archonStub(pinnedArchon)}\n`);
	chmodSync(asset, 0o755);
	stub(
		join(bin, "curl"),
		`printf '%s\\n' "$*" >> "$CURL_LOG"
url=''
out=''
while [ $# -gt 0 ]; do
	case "$1" in
		-o) out=$2; shift 2 ;;
		-*) shift ;;
		*) url=$1; shift ;;
	esac
done
case "$url" in
	*/checksums.txt) printf '%s  %s\\n' "$(shasum -a 256 "${asset}" | cut -d' ' -f1)" "${assetName}" ;;
	*/${assetName}) cp "${asset}" "$out" ;;
	*) printf 'curl: not a release URL: %s\\n' "$url" >&2; exit 22 ;;
esac`,
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
	// OpenClaw, as far as install can tell: each call is logged, `config set` writes the
	// value into the Mac's own openclaw.json and `config get` reads it back, the way
	// OpenClaw's CLI does. `models list --agent` applies OpenClaw's rule that an agent's
	// model resolves only when models.providers holds a matching models[] entry.
	const openclawConfig = join(home, ".openclaw", "openclaw.json");
	stub(
		join(bin, "openclaw"),
		`const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.OPENCLAW_LOG, args.join(" ") + "\\n");
const read = () => {
	try {
		return JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG, "utf8"));
	} catch {
		return {};
	}
};
const at = (path) => path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), read());
const put = (path, value) => {
	const data = read();
	const keys = path.split(".");
	let node = data;
	for (const key of keys.slice(0, -1)) {
		if (node[key] == null || typeof node[key] !== "object") node[key] = {};
		node = node[key];
	}
	node[keys[keys.length - 1]] = value;
	fs.writeFileSync(process.env.OPENCLAW_CONFIG, JSON.stringify(data, null, 2) + "\\n");
};
const reply = (value) => process.stdout.write(JSON.stringify(value, null, 2) + "\\n");
const deny = (message) => {
	reply({ ok: false, error: { type: "cli_error", message } });
	process.exit(1);
};
switch (args[0] + " " + args[1]) {
	case "plugins inspect":
		break;
	case "plugins reload":
		if (process.env.OPENCLAW_PLUGIN_RELOAD_FAILS === "1") {
			process.stderr.write("openclaw: the previous plugin generation stays active\\n");
			process.exit(1);
		}
		break;
	case "approvals get":
		reply({ file: {} });
		break;
	case "approvals set":
		fs.writeFileSync(process.env.APPROVALS_LOG, fs.readFileSync(0, "utf8"));
		break;
	case "sessions --agent":
		// FactoryClaw's Telegram chat, which a Mac has before install sets up a project.
		reply({ sessions: [{ key: "agent:factoryclaw:telegram:direct:1" }] });
		break;
	case "config set":
		put(args[2], args.includes("--strict-json") ? JSON.parse(args[3]) : args[3]);
		break;
	case "config get": {
		const value = at(args[2]);
		if (value === undefined) deny("Config path is valid but unset: " + args[2]);
		reply(value);
		break;
	}
	case "models list": {
		const agent = args[args.indexOf("--agent") + 1];
		const model = String(at("agents.entries." + agent + ".model"));
		const provider = model.split("/")[0];
		const id = model.split("/").slice(1).join("/");
		const models = at("models.providers." + provider + ".models") || [];
		if (!models.some((entry) => entry.id === id))
			deny("Unknown model: " + model + ". Found agents.entries." + agent + ".model but no matching models.providers." + provider + ".models[] entry.");
		reply({ count: 1, models: [{ key: model }] });
		break;
	}
}
`,
		"/usr/bin/env node",
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
		OPENCLAW_CONFIG: openclawConfig,
		APPROVALS_LOG: logs.approvals,
		ARCHON_LOG: logs.archon,
		CURL_LOG: logs.curl,
		LAUNCHCTL_LOG: logs.launchctl,
		BDUI_LOG: logs.bdui,
		BDUI_REGISTERED: logs.registered,
		PI_LOG: logs.pi,
		SWIFT_LOG: logs.swift,
		CODESIGN_LOG: logs.codesign,
	};
	if (options.pluginReloadFails) env.OPENCLAW_PLUGIN_RELOAD_FAILS = "1";
	// The Profile is the one place a Mac's settings come from, not an inherited shell.
	delete env.ARCHON_HOME;
	delete env.LIBRARY;

	const install = () => spawnSync(join(repoRoot, "scripts", "install.sh"), [], { cwd: home, encoding: "utf8", env });

	return { home, profile, env, logs, install };
};

/**
 * A project repo on this temporary Mac, ready for install: git and Beads as `bd init`
 * leaves them, a .env holding the check command, and an entry in the one list of projects
 * (~/.config/factory/projects), so install's per-project setup loop reaches it.
 */
export const projectRepo = (mac: Mac): string => {
	const repo = join(mac.home, "repo");
	mkdirSync(join(repo, ".beads"), { recursive: true });
	execFileSync("git", ["init", "-q", repo]);
	mkdirSync(join(repo, ".archon"), { recursive: true });
	writeFileSync(join(repo, ".archon", ".env"), "FACTORY_CHECK=true\n");
	writeFileSync(join(mac.home, ".config", "factory", "projects"), `${repo}\n`);
	return repo;
};

/** Read a log a stand-in wrote; a command never run leaves no file. */
export const logOf = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8") : "");
