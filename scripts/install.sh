#!/bin/sh
# Installs the Factory, or sets up one project for it.
#
#   scripts/install.sh                          install the Factory, then set up again
#                                               every project in ~/.config/factory/projects
#   scripts/install.sh <repo> ["<check cmd>"]   set up one project and add it to that
#                                               list; the check command is needed the
#                                               first time only
#
# Everything the Factory installs is under ~/.local/share/factory, its one root (the
# Human, 2026-10-21), except Archon's home, which the Profile names; the settings a person
# edits are in ~/.config/factory. Tools whose home is shared with other uses (OpenClaw,
# herdr, launchd, ~/.agents/skills, ~/.pi/agent) get only the Factory's own files.
#
# The Profile, ~/.config/factory/profile, says how the core behaves on this Mac: how Runs
# land, the outer layer, the workspace shape, the Archon home and the Workflow library, and
# the Chains file. install reads it and follows it, ships config/profile when no Profile
# exists, and never overwrites one (fac-qpv.6.3).
#
# Running either twice gives the same result. It never prints auth.json's contents.
set -eu

src=$(cd "$(dirname "$0")/.." && pwd)
factory=$HOME/.local/share/factory
# The archon wrapper install keeps for itself and links into ~/.local/bin; FactoryClaw's
# allowlist names this file's real path, because OpenClaw matches the entry against what
# the link resolves to (fac-lw9). The write gives the reasons for both.
archon_wrapper=$factory/commands/archon
pi_dir=$factory/pi-agent
config=$HOME/.config/factory
profile=$config/profile
# One version set for Archon, pi and pi-claude-bridge, upgraded together in one commit
# after a test Run, even when that leaves the Factory behind new pi features (the Human,
# 2026-10-21; fac-88m.1). pi must be the version Archon bundles in its pi provider,
# which Run nodes use: the @earendil-works/pi-coding-agent entry of Archon's bun.lock at
# the release tag (github.com/coleam00/Archon), 1.3.0 at v0.14.0. install.sh makes this
# machine match.
archon_version=0.14.0
pi_version=1.3.0
bridge=pi-claude-bridge@0.9.3
library_repo=https://github.com/bradley-mankoff/archon-workflows.git
# The port the local server for the demo folder listens on, on the loopback address alone.
# The login job factory.demos and the tailscale serve command that forwards /demos to it
# both read it from here, so the two cannot name different ports (fac-3mz.10). 8793 was free
# on this Mac's tailnet when the server was added.
demos_port=8793
claw=$HOME/.openclaw/workspace-factoryclaw
plain_voice=$HOME/Developer/personal_code/pi-plain-voice/skills/plain-voice

# The Profile, this Mac's one settings file (fac-qpv.6.3). install_factory copies the
# personal one in when the Mac has none; a step that reads it stops rather than run with no
# settings.
read_profile() {
	[ -f "$profile" ] || { echo "error: no Profile at $profile; run scripts/install.sh" >&2; exit 1; }
	# shellcheck source=/dev/null
	. "$profile"
	# bin/archon-roles reads Archon's home from the environment.
	export ARCHON_HOME
}

# The pi packages the Factory depends on, each in a repo of its own (fac-qpv.8.1). $1 is the
# pi folder to install into and the rest are the packages, so the Human's folder and a Run's
# differ only in that list.
pi_packages() {
	agent_dir=$1
	shift
	for package in "$@"; do
		PI_CODING_AGENT_DIR=$agent_dir pi install "git:github.com/bradley-mankoff/$package" >/dev/null
	done
}

install_factory() {
	mkdir -p "$factory" "$config"
	# A Mac with no Profile gets the shipped example, which is the personal Mac's; an edited
	# Profile is never overwritten.
	[ -f "$profile" ] || cp "$src/config/profile" "$profile"
	read_profile
	# The Chains file the Profile names. The Human edits this copy per Mac, and the pi-chains
	# package reads <agent dir>/chains.json, which install links to it in both pi folders
	# (fac-qpv.1.1, fac-qpv.8.1).
	[ -f "$CHAINS" ] || { mkdir -p "$(dirname "$CHAINS")"; cp "$src/config/chains.json" "$CHAINS"; }
	touch "$config/projects"
	install_versions
	# The wrapper on PATH points Archon at the Profile's Archon home and Workflow library.
	# It is written into the Factory's own folder and linked into ~/.local/bin, as pm is, so
	# whatever stands at that path is replaced: writing there would follow a link a Mac's
	# earlier Factory left and overwrite the file it points at (fac-lw9).
	mkdir -p "$factory/commands" "$HOME/.local/bin"
	cat > "$archon_wrapper" <<WRAPPER
#!/bin/sh
# Written by the Factory's scripts/install.sh: runs Archon with the Factory's Archon home
# and Workflow library, both from the Mac's Profile.
export ARCHON_HOME="\${ARCHON_HOME:-$ARCHON_HOME}"
export LIBRARY="\${LIBRARY:-$LIBRARY}"
export DEFAULT_AI_ASSISTANT="\${DEFAULT_AI_ASSISTANT:-pi}"
export ARCHON_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 PI_SKIP_VERSION_CHECK=1
# A Project Manager's shell names the workspace shape and the branch it leads. Under the
# worktree shape every Run it starts must start from and land on that branch, but Archon
# cuts a fresh Run from the project's default branch unless --base says otherwise, and
# refuses --base on an adopting Run (fac-02k). So a fresh Run gets --base with the
# Project Manager's branch, exported by start as FACTORY_PM_BRANCH; an adopting Run, a
# lane or base the caller chose, and every other shell pass through unchanged.
if [ "\${WORKSPACE:-}" = worktree ] && [ "\${1:-}" = workflow ] && [ "\${2:-}" = run ] && [ "\$#" -ge 3 ]; then
	chosen=
	for arg in "\$@"; do
		case \$arg in
		--base | --base=* | --adopt | --adopt=* | --resume | --branch | --branch=* | -b | -b=* | --from | --from=* | --from-branch | --from-branch=* | --no-worktree | --folder | --container) chosen=1 ;;
		esac
	done
	if [ -z "\$chosen" ]; then
		branch=\${FACTORY_PM_BRANCH:-}
		[ -n "\$branch" ] || branch=\$(git branch --show-current 2>/dev/null || true)
		[ -n "\$branch" ] || {
			echo "archon: WORKSPACE=worktree but no FACTORY_PM_BRANCH and no branch here, so this Run has no branch to land on: pass --base <branch>" >&2
			exit 2
		}
		name=\$3
		shift 3
		set -- workflow run "\$name" --base "\$branch" "\$@"
	fi
fi
exec "$ARCHON_HOME/bin/archon" "\$@"
WRAPPER
	chmod +x "$archon_wrapper"
	ln -sfn "$archon_wrapper" "$HOME/.local/bin/archon"
	# Archon's small, medium and large tiers and its @aliases name the Mac's Chain roles, so
	# a Workflow names a role and never a model or a seat (fac-qpv.1.4).
	"$src/bin/archon-roles"
	# project-manager/start finds its instructions and GLOSSARY.md beside its own folder.
	rsync -a --delete "$src/project-manager/" "$factory/project-manager/"
	# pm: the shorthand a session starts with, in the project folder it is in.
	ln -sfn "$factory/project-manager/pm" "$HOME/.local/bin/pm"
	# The helpers, for project-manager/start, the Workflows and the board's login job.
	rsync -a --delete "$src/bin/" "$factory/bin/"
	# factory: the one command that puts an Ask and lists the Mac's Asks, which screens and
	# Project Managers call (fac-3mz.1).
	ln -sfn "$factory/bin/factory" "$HOME/.local/bin/factory"
	# The node prompts that bin/node-prompts reads into every build Workflow.
	rsync -a --delete "$src/prompts/" "$factory/prompts/"
	rsync -a --delete "$src/skills/" "$factory/skills/"
	mkdir -p "$HOME/.pi/agent/extensions"
	# The pi extensions are packages in repos of their own, so the Factory depends on them
	# instead of holding them (fac-qpv.8.1): Beads, Bead links, Chains and the bash timeout for
	# Project Managers and the Human's own sessions. pi install records each in his pi folder's
	# settings.json and fetches it from its repo. Notices is the exception: its package watched
	# the Notice file with the platform's change notification, which went silent and lost three
	# Notices in one pane (fac-8xl), so project-manager/notices.ts reads the file on a timer
	# instead and the Factory holds it like its other two extensions.
	pi_packages "$HOME/.pi/agent" pi-beads pi-links pi-chains pi-bash-timeout
	# Both pi folders read the Chains file the Profile names: pi-chains looks for
	# <agent dir>/chains.json, so a link there points at the one file a person edits.
	ln -sfn "$CHAINS" "$HOME/.pi/agent/chains.json"
	# pi's sample subagent extension (fac-60v.20.16), with which Project Managers send
	# Scouts and the Human's own sessions start sub-agents. Linked from pi's install, not
	# copied, so it moves with pi's pinned version and adds nothing to the Factory's size.
	ln -sfn "$(npm root -g)/@earendil-works/pi-coding-agent/examples/extensions/subagent" "$HOME/.pi/agent/extensions/subagent"
	# The Workflow library, at the path the Profile names, holds the core group factory/
	# and the person's own groups beside it. The person's groups are their own git repo
	# that Project Managers add to (fac-60v.24), so it is cloned when missing and never
	# overwritten. Archon refuses a .git folder there, so the repo's git folder sits beside
	# it, named here by its full path because the Profile may put the library anywhere.
	if [ ! -e "$LIBRARY/.git" ]; then
		mkdir -p "$(dirname "$LIBRARY")"
		git clone -q --separate-git-dir="$ARCHON_HOME/library.git" "$library_repo" "$LIBRARY"
		printf 'gitdir: %s\n' "$ARCHON_HOME/library.git" > "$LIBRARY/.git"
	fi
	# The core Workflows ship with the core (fac-qpv.6.2): they are copied from this repo,
	# replacing the installed factory group whole. Every other group in the library is the
	# person's own and install never writes to it.
	"$src/scripts/install-workflows" "$LIBRARY"
	cp "$src/GLOSSARY.md" "$factory/GLOSSARY.md"
	# The planning skills serve every session, not only Project Managers (fac-60v.14), and
	# the engineering skills tdd, codebase-design and code-review replace Matt Pocock's raw
	# copies for Project Managers and the Human's own sessions alike (fac-6a7.5), so all
	# seven are linked where pi finds personal skills, in place of his copies of the same
	# names. Linking over his copies would nest a link inside them, so the install skips
	# such a skill and names the command that removes the copy.
	for s in grilling wayfinder to-spec to-beads tdd codebase-design code-review; do
		if [ -e "$HOME/.agents/skills/$s" ] && [ ! -L "$HOME/.agents/skills/$s" ]; then
			echo "skipped $s: ~/.agents/skills/$s is another copy; remove it with: npx skills remove -g $s -y" >&2
			continue
		fi
		ln -sfn "$factory/skills/$s" "$HOME/.agents/skills/$s"
	done
	# The record-demo skill, which a Project Manager uses when a Human gate's demo failed
	# and it records one itself. Linked where pi finds personal skills, like the planning
	# skills above, so the Human's own pi sessions and Project Managers both see it.
	ln -sfn "$factory/skills/record-demo" "$HOME/.agents/skills/record-demo"
	# The record-demo skill's tools: trim-idle, and playwright-core driving the Human's
	# own Chrome (channel 'chrome'), so no browser is downloaded.
	rsync -a --delete --exclude node_modules --exclude package.json --exclude package-lock.json "$src/demo/" "$factory/demo/"
	[ -d "$factory/demo/node_modules/playwright-core" ] || npm install --silent --prefix "$factory/demo" playwright-core@1.63.0 >/dev/null

	# The Factory's pi folder. Both files are merged, not copied: pi adds its own
	# settings as it runs, and project setup adds each project's repo to trust.json.
	mkdir -p "$pi_dir"
	# The Chains, Flows and bash timeout, so an AI node of a Run registers a model per role
	# (fac-qpv.1.1) and is sent back before it stops short (fac-qpv.3.1), and a command that
	# never returns cannot hold a Run open past Archon's idle timeout (fac-rh9). pi install
	# records them in this folder's settings.json, and every session here loads them.
	ln -sfn "$CHAINS" "$pi_dir/chains.json"
	pi_packages "$pi_dir" pi-chains pi-flows pi-bash-timeout
	merge_json "$pi_dir/settings.json" "$src/pi-agent/settings.json"
	merge_json "$pi_dir/trust.json" "$src/pi-agent/trust.json"
	merge_json "$pi_dir/claude-bridge.json" "$src/pi-agent/claude-bridge.json"
	# Extra pi extensions this Mac's Runs load, which the core cannot ship: the work Mac's
	# Chains reach GPT through two ChatGPT logins, registered by an extension that names work
	# accounts (fac-pbg). The Profile's RUN_EXTENSIONS lists absolute paths to extension files;
	# each is linked into the folder's extensions/, and a link there to a path no longer listed
	# is removed, so dropping one from the Profile undoes it at the next install. An unset or
	# empty key leaves the folder as it is: the Factory holds no extension of its own, so there
	# is nothing to tidy up for a Mac that names none.
	run_extensions=${RUN_EXTENSIONS-}
	if [ -n "$run_extensions" ]; then
		mkdir -p "$pi_dir/extensions"
		for extension in $run_extensions; do
			ln -sfn "$extension" "$pi_dir/extensions/$(basename "$extension")"
		done
		for link in "$pi_dir/extensions"/*; do
			[ -L "$link" ] || continue
			case " $run_extensions " in
			*" $(readlink "$link") "*) ;;
			*) rm -f "$link" ;;
			esac
		done
	fi
	# The subagent extension reads agent definitions from <pi folder>/agents, so the scout
	# goes into this folder for Project Managers and is linked into the Human's.
	rsync -a --delete "$src/pi-agent/agents/" "$pi_dir/agents/"
	mkdir -p "$HOME/.pi/agent/agents"
	ln -sfn "$pi_dir/agents/scout.md" "$HOME/.pi/agent/agents/scout.md"
	# A link, so one OAuth login serves both folders and no second refresh token goes stale.
	# On a computer with no personal pi, log in once with PI_CODING_AGENT_DIR set to this
	# folder instead (the Human, 2026-10-21).
	[ ! -e "$HOME/.pi/agent/auth.json" ] || ln -sfn "$HOME/.pi/agent/auth.json" "$pi_dir/auth.json"
	# pi-claude-bridge, for Runs and the Human's own pi, installed into this folder's own
	# npm folder rather than borrowed from the personal pi.
	grep -qs "\"version\": \"${bridge#*@}\"" "$pi_dir/npm/node_modules/${bridge%@*}/package.json" ||
		PI_CODING_AGENT_DIR="$pi_dir" pi install "npm:$bridge" >/dev/null

	# The demo videos a Run records for a Human gate, in a folder the Factory owns rather
	# than FactoryClaw's workspace, so the Factory does not depend on FactoryClaw being
	# installed (fac-3mz.7). Every project's .archon/.env names it as FACTORY_DEMOS.
	mkdir -p "$factory/demos"
	publish_demos
	# FactoryClaw and OpenClaw exist only where the Profile names that outer layer.
	if [ "$OUTER_LAYER" = factoryclaw ]; then
		install_factoryclaw
	fi
	herdr_job
	board_job
	# The Factory map, a page of every Factory path, built from map/paths.txt; it names
	# any listed path that is missing, so a stale entry shows up on every install. Last,
	# so paths the steps above create are not reported missing on a first install.
	"$src/map/render"
}

# Publishes the Factory's demo folder on this Mac's own tailnet when the Profile asks, so
# a gate's video link, <DEMOS_URL>/<run id>.mp4, plays wherever the Human taps it
# (fac-3mz.7). DEMOS_SERVE=tailscale starts a login job that serves the folder on the
# loopback address at the pinned port, and forwards the /demos path of the Mac's Tailscale
# address to it with tailscale serve, which only the tailnet can reach; without that key
# install publishes nothing. The Mac App Store and standalone editions of Tailscale cannot
# serve a folder from disk ("Path serving is not supported on macOS due to sandbox
# restrictions"), but both forward a path to a local server, which is how this Mac already
# serves its other services (fac-3mz.10). Setting the same path again changes nothing, so a
# second install is safe. The Tailscale CLI ships inside the Mac app and is often not on
# PATH, so the app's own binary is used when PATH has none, as bin/land finds gh.
publish_demos() {
	[ "${DEMOS_SERVE-}" = tailscale ] || return 0
	demos_job
	tailscale_bin=$(command -v tailscale 2>/dev/null) || tailscale_bin=/Applications/Tailscale.app/Contents/MacOS/Tailscale
	[ -x "$tailscale_bin" ] || {
		echo "skipped publishing demo videos: no tailscale command on PATH or in /Applications/Tailscale.app" >&2
		return 0
	}
	"$tailscale_bin" serve --bg --set-path /demos "http://127.0.0.1:$demos_port" >/dev/null ||
		echo "note: tailscale could not publish the demo folder; run: tailscale serve --bg --set-path /demos http://127.0.0.1:$demos_port" >&2
}

# The local web server for the demo folder, as its own launchd job started at login.
# Tailscale on this Mac forwards /demos to it (publish_demos), so a gate's video plays from
# any screen without the video leaving the tailnet. bin/demos-serve binds the loopback
# address and answers Range requests, which Safari on iPhone needs (fac-3mz.10).
demos_job() {
	new=$(cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>factory.demos</string>
	<key>ProgramArguments</key>
	<array><string>$factory/bin/demos-serve</string><string>$factory/demos</string><string>$demos_port</string></array>
	<key>EnvironmentVariables</key>
	<dict><key>PATH</key><string>/opt/homebrew/bin:$HOME/.local/bin:$standard_path</string></dict>
	<key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
)
	login_job factory.demos "$new"
}

# FactoryClaw's files and OpenClaw settings, under the outer layer this Mac's Profile
# names (fac-qpv.6.3). A Mac whose Profile chooses no outer layer gets none of this.
install_factoryclaw() {
	# FactoryClaw. TOOLS.md is left alone: project setup writes it.
	cp "$src/factoryclaw/AGENTS.md" "$src/factoryclaw/BOOT.md" "$src/factoryclaw/HEARTBEAT.md" "$claw/"
	rsync -a --delete "$src/factoryclaw/skills/" "$claw/skills/"
	# The Human's plain-voice skill, which every message to the Human follows. Copied after
	# the rsync above, which would delete it. The Project Managers read it from its repo.
	rsync -a --delete "$plain_voice/" "$claw/skills/plain-voice/"
	# Demo videos from Runs live in the Factory's own folder (fac-3mz.7). OpenClaw reads
	# media only inside FactoryClaw's workspace, so the workspace's demos is a link to it
	# and FactoryClaw still attaches a gate's video on Telegram. A real folder an earlier
	# install made moves everything it holds to the Factory's folder first, so the link can
	# go in without losing a video, and the Project Manager's after-landing move finds the
	# folder empty.
	if [ -d "$claw/demos" ] && [ ! -L "$claw/demos" ]; then
		find "$claw/demos" -mindepth 1 -maxdepth 1 -exec mv {} "$factory/demos/" \;
		rmdir "$claw/demos"
	fi
	ln -sfn "$factory/demos" "$claw/demos"
	# The workshop-catch plugin (fac-60v.23) archives each skill OpenClaw's Skill Workshop
	# learns for FactoryClaw and files it as a Bead in this repo. The gateway runs with a
	# bare PATH, so the plugin is given this one to find bd and openclaw.
	rsync -a --delete "$src/openclaw-plugins/" "$factory/openclaw-plugins/"
	openclaw plugins inspect workshop-catch >/dev/null 2>&1 || openclaw plugins install --link "$factory/openclaw-plugins/workshop-catch" --force >/dev/null
	openclaw config set plugins.entries.workshop-catch.config "$(python3 -c 'import json, os, sys; print(json.dumps({"factoryRepo": sys.argv[1], "path": os.environ["PATH"]}))' "$src")" --strict-json >/dev/null
	openclaw plugins enable workshop-catch >/dev/null
	# The reload waits for the old generation's admitted work to drain, so a gateway that is
	# not loaded or is still busy fails it, and OpenClaw keeps the previous generation active:
	# the safe default. That is no reason to skip every project's setup below, so install says
	# what happened and carries on, leaving the next install to try the reload again (fac-hdc).
	openclaw plugins reload workshop-catch >/dev/null ||
		echo "note: workshop-catch's reload did not finish; the previous plugin generation stays active, and the next install tries again" >&2
	# FactoryClaw's model, from the Profile. A repeated set changes nothing.
	openclaw config set agents.entries.factoryclaw.model "$FACTORYCLAW_MODEL" >/dev/null
	openclaw config set agents.entries.factoryclaw.thinkingDefault "$FACTORYCLAW_THINKING" >/dev/null
	register_factoryclaw_model
	set_allowlist
}

# OpenClaw resolves an agent's model only when its catalog holds a matching
# models.providers[provider].models[] entry. Its OpenCode Go catalog is downloaded from
# models.opencode.ai, so a model that list has not carried yet, or could not be fetched,
# made every FactoryClaw turn fail with "Unknown model" while the agent entry named it
# (fac-s0q). FactoryClaw's model comes from the Profile, so install writes it into the
# catalog with the api and baseUrl OpenCode Go serves it on, transcribed from the entry
# https://models.opencode.ai/api.json publishes for that model. A model without such an
# entry is left to OpenClaw's own catalog. Entries the Mac holds for other models stay as
# they are; an entry it holds for this one takes install's route, so a second install
# changes nothing.
register_factoryclaw_model() {
	python3 - "$FACTORYCLAW_MODEL" <<'EOF'
import json, subprocess, sys

# The route OpenCode Go publishes for the model the example Profile names:
# https://models.opencode.ai/api.json has it as an @ai-sdk/openai model on
# https://opencode.ai/inference/go/openai/v1. Reasoning stays on, as the published entry
# has it, so FactoryClaw's thinkingDefault still applies. The model's name here holds the
# account and the id OpenClaw reads, so neither is repeated below.
routes = {
    "opencode-go/muse-spark-1.3-contributor": {
        "name": "Muse Spark 1.3 Contributor",
        "api": "openai-responses",
        "baseUrl": "https://opencode.ai/inference/go/openai/v1",
        "reasoning": True,
    },
}
model = sys.argv[1]
account, _, model_id = model.partition("/")
route = routes.get(model)
if route is None:
    raise SystemExit(0)
entry = {"id": model_id, **route}

path = "models.providers." + account + ".models"

def openclaw(*args, check=False):
    return subprocess.run(["openclaw", *args], text=True, capture_output=True, check=check)

current = []
got = openclaw("config", "get", path, "--json")
if got.returncode == 0:
    value = json.loads(got.stdout)
    if isinstance(value, list):
        current = value
merged = [held for held in current if held.get("id") != model_id] + [entry]
if merged != current:
    openclaw("config", "set", path, json.dumps(merged), "--strict-json", check=True)
EOF
}

# One launchd job at login, $1 the job's label and $2 the plist body. The file is written
# only when its text changes and the job loaded only when this Mac has not loaded it, so a
# second install changes nothing and leaves a running job alone rather than starting it
# again.
login_job() {
	plist=$HOME/Library/LaunchAgents/$1.plist
	new=$2
	if [ ! -f "$plist" ] || [ "$(cat "$plist")" != "$new" ]; then
		printf '%s\n' "$new" > "$plist"
		launchctl bootout "gui/$(id -u)/$1" 2>/dev/null || true
		# bootout returns before the job is gone; bootstrapping too early fails with 5.
		for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
			launchctl print "gui/$(id -u)/$1" >/dev/null 2>&1 || break
			sleep 0.1
		done
	fi
	launchctl print "gui/$(id -u)/$1" >/dev/null 2>&1 || launchctl bootstrap "gui/$(id -u)" "$plist"
}

# The folders every login job's PATH ends with, after the ones that job needs itself:
# Homebrew's on an Intel Mac, then the standard ones launchd's bare PATH leaves out. One
# copy, so no job's PATH can drift from another's.
standard_path=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

# The herdr server where Project Managers run, as its own launchd job started at login.
# It runs the default server, the one the Human's own terminals attach to, so he and
# FactoryClaw see the same panes: in a named session FactoryClaw could not see the Project
# Manager he had started himself and opened a second one under the same name (fac-6l8).
# Started by FactoryClaw instead, the server ran inside OpenClaw's process group: its panes
# inherited OPENCLAW_SHELL, so OpenClaw refused every Project Manager's message ("would
# lose inter-session attribution"), and a gateway restart could end every pane.
# launchd hands the job a bare PATH, and herdr-sidebar draws Markdown by running glow by
# name (fac-0se), so the plist carries the folders glow is installed in, Homebrew's and the
# person's own, ahead of the standard ones. login_job writes the file again and reloads the
# job only when the text differs, so the install that first writes this PATH restarts herdr
# with it, and a later install that writes the same text leaves the running server alone.
herdr_job() {
	new=$(cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>factory.herdr</string>
	<key>ProgramArguments</key>
	<array><string>$(command -v herdr)</string><string>server</string></array>
	<key>EnvironmentVariables</key>
	<dict><key>PATH</key><string>/opt/homebrew/bin:$HOME/.local/bin:$standard_path</string></dict>
	<key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
)
	login_job factory.herdr "$new"
}

# The Beads board, beads-ui, as its own launchd job started at login (fac-qpv.7.3). A Bead
# link in a reply opens the board, so the board has to be running after a reboot and has to
# know the link's project: the job runs bin/board, which starts the board on the Profile's
# port and registers every project in ~/.config/factory/projects with it. install runs the
# same script first, so the board is up today and the job finds a server already listening;
# loading a job runs it, and a second server there would race for the port.
board_job() {
	command -v bdui >/dev/null 2>&1 || {
		echo "skipped the board's login job: bdui (beads-ui) is not installed" >&2
		return 0
	}
	"$factory/bin/board" || echo "note: the board did not start; its job starts it at the next login" >&2
	new=$(cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>factory.bdui</string>
	<key>ProgramArguments</key>
	<array><string>$factory/bin/board</string></array>
	<key>EnvironmentVariables</key>
	<dict><key>PATH</key><string>$(dirname "$(command -v bdui)"):$standard_path</string></dict>
	<key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
)
	login_job factory.bdui "$new"
}

# Archon and its pi provider from the release, checked against its checksums.txt, and
# the pi command from npm, each only when the installed version differs.
install_versions() {
	os=$(uname -s | tr 'A-Z' 'a-z')
	arch=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
	if ! "$ARCHON_HOME/bin/archon" --version 2>/dev/null | grep -q "v$archon_version\$"; then
		url=https://github.com/coleam00/Archon/releases/download/v$archon_version
		mkdir -p "$ARCHON_HOME/bin"
		curl -fsSL -o "$ARCHON_HOME/bin/archon.new" "$url/archon-$os-$arch"
		want=$(curl -fsSL "$url/checksums.txt" | awk -v f="archon-$os-$arch" '$2 == f {print $1}')
		[ "$(shasum -a 256 "$ARCHON_HOME/bin/archon.new" | cut -d' ' -f1)" = "$want" ] || { rm -f "$ARCHON_HOME/bin/archon.new"; echo "error: Archon $archon_version download does not match its checksum" >&2; exit 1; }
		chmod +x "$ARCHON_HOME/bin/archon.new" && mv "$ARCHON_HOME/bin/archon.new" "$ARCHON_HOME/bin/archon"
	fi
	grep -qs "\"tag\": \"v$archon_version\"" "$ARCHON_HOME/plugins/installed/coleam00/Archon/plugins/provider-pi/receipt.json" ||
		"$ARCHON_HOME/bin/archon" provider add pi >/dev/null
	[ "$(pi --version 2>/dev/null)" = "$pi_version" ] || npm install -g --silent "@earendil-works/pi-coding-agent@$pi_version" >/dev/null
}

# Merges the keys of JSON file $2 into JSON file $1, creating $1 if missing.
merge_json() {
	python3 - "$1" "$2" <<'EOF'
import json, os, sys
live, new = sys.argv[1], sys.argv[2]
data = json.load(open(live)) if os.path.exists(live) else {}
merged = {**data, **(json.load(open(new)) if os.path.exists(new) else json.loads(new))}
if merged != data:
    json.dump(merged, open(live, "w"), indent=2)
    open(live, "a").write("\n")
EOF
}

# FactoryClaw may run exactly the commands its AGENTS.md names. argPattern entries can
# only be written by replacing the whole approvals file, so this rewrites FactoryClaw's
# list and sends the file back only when the list changed. herdr and bd are bare names:
# a path pattern is matched against the resolved binary, and Homebrew's links resolve
# into versioned Cellar folders, so /opt/homebrew/bin/herdr never matched. The archon
# entry names the wrapper's real path for the same reason: FactoryClaw calls the link
# ~/.local/bin/archon, and OpenClaw matches the entry against what that link resolves to
# (fac-lw9).
set_allowlist() {
	openclaw approvals get --json | python3 -c '
import json, os, subprocess, sys
want = [
    {"pattern": "herdr"},
    {"pattern": "launchctl", "argPattern": "^start factory\\.herdr$"},
    {"pattern": "bd", "argPattern": "^-C \\S+ (show|list|ready|comments)( |$)"},
    {"pattern": os.path.realpath(sys.argv[1]), "argPattern": "^workflow (status|runs|attention)( |$)"},
]
snap = json.load(sys.stdin)["file"]
agent = snap.setdefault("agents", {}).setdefault("factoryclaw", {})
have = [{k: e[k] for k in ("pattern", "argPattern") if k in e} for e in agent.get("allowlist", [])]
if have != want:
    agent["allowlist"] = want
    subprocess.run(["openclaw", "approvals", "set", "--stdin"], input=json.dumps(snap), text=True, check=True, stdout=subprocess.DEVNULL)
' "$archon_wrapper"
}

setup_project() {
	repo=$(cd "$1" && pwd)
	name=$(basename "$repo")
	[ -d "$repo/.git" ] && [ -d "$repo/.beads" ] || { echo "error: $repo needs git and Beads (bd init --role maintainer) first" >&2; exit 1; }
	# bd infers the contributor role in a repo that has an `upstream` remote (a fork), then
	# reads the empty contributor planning store instead of the repo's own .beads, so bd ready
	# shows no work (fac-3zx). Set on every setup, so the next install repairs a fork made
	# before this fix. The role is the repo's own git config, never a file in a commit, so a
	# branch cut from upstream's branch still carries none of it.
	git -C "$repo" config beads.role maintainer
	# The pane's herdr name, from the one rule in bin/pm-pane, so it matches the name
	# start gives the pane.
	pane=$("$src/bin/pm-pane" "$repo")
	# The Profile says whether an outer layer carries the Human's messages. With none, a
	# project needs no Telegram chat, and FactoryClaw keeps no list of projects.
	read_profile
	if [ "$OUTER_LAYER" = factoryclaw ]; then
		session=$(openclaw sessions --agent factoryclaw --json | python3 -c '
import json, sys
keys = [s["key"] for s in json.load(sys.stdin)["sessions"] if s["key"].startswith("agent:factoryclaw:telegram:direct:")]
print(keys[0] if keys else "")')
		[ -n "$session" ] || { echo "error: FactoryClaw has no Telegram chat yet; message it on Telegram once" >&2; exit 1; }
	else
		session=
	fi
	# Demo videos are the Factory's, whatever the outer layer, so one FACTORY_DEMOS serves
	# every project and a Mac with no FactoryClaw keeps its videos (fac-3mz.7).
	demos=$factory/demos
	mkdir -p "$demos"

	# The Factory's Workflows are shared from the Workflow library (install_factory). A
	# copy that earlier setups put in the repo would win over the shared one, so it goes.
	rm -rf "$repo/.archon/workflows/factory"
	# A repo set up for the first time has no .archon folder for the .env below.
	mkdir -p "$repo/.archon"

	# The commit identity a Run uses (fac-woi). The Profile names both keys or neither, so
	# this is the one gate that decides; the .env and the repo's git config below both take
	# the answer, and a Profile that names half of one leaves the project's git as it is.
	git_name=${GIT_NAME-}
	git_email=${GIT_EMAIL-}
	if [ -z "$git_name" ] || [ -z "$git_email" ]; then
		git_name=
		git_email=
	fi

	python3 - "$repo/.archon/.env" "$pi_dir" "$pane" "$session" "$demos" "${2-}" "$git_name" "$git_email" <<'EOF'
import os, sys
path, pi_dir, pane, session, demos, check, git_name, git_email = sys.argv[1:]
lines = open(path).read().splitlines() if os.path.exists(path) else []
env = dict(l.split("=", 1) for l in lines if "=" in l and not l.startswith("#"))
want = {"PI_CODING_AGENT_DIR": pi_dir, "FACTORY_PM_AGENT": pane, "FACTORY_DEMOS": demos}
if session:
    want["FACTORYCLAW_SESSION"] = session
if check:
    want["FACTORY_CHECK"] = check
elif "FACTORY_CHECK" not in env:
    sys.exit("error: give the project's check command the first time, for example: scripts/install.sh <repo> 'python3 -m unittest'")
# The Profile's commit identity, which a Run's nodes read from this env (fac-woi). The
# shell passes both keys or neither, so one name here covers all four variables.
if git_name:
    want.update({"GIT_AUTHOR_NAME": git_name, "GIT_COMMITTER_NAME": git_name,
                 "GIT_AUTHOR_EMAIL": git_email, "GIT_COMMITTER_EMAIL": git_email})
for k, v in want.items():
    v = "'" + v.replace("'", "'\\''") + "'" if any(c in v for c in " \"'$;&|") else v
    hit = [i for i, l in enumerate(lines) if l.startswith(k + "=")]
    if hit:
        lines[hit[0]] = f"{k}={v}"
    else:
        lines.append(f"{k}={v}")
new = "\n".join(lines) + "\n"
if not os.path.exists(path) or open(path).read() != new:
    open(path, "w").write(new)
EOF
	# The project's repo commits as the Profile's identity whatever this Mac's global git
	# email is, so a public repo never takes the work one (fac-woi). The `.env` above gives
	# a Run's nodes the same identity as variables.
	if [ -n "$git_name" ]; then
		git -C "$repo" config user.name "$git_name"
		git -C "$repo" config user.email "$git_email"
	fi
	# Kept out of git by the repo's own exclude file, not .gitignore, so setup leaves the
	# working tree clean: a changed .gitignore and an untracked pack stopped the Project
	# Manager's git pull --rebase.
	exclude=$(cd "$repo" && git rev-parse --absolute-git-dir)/info/exclude
	mkdir -p "$(dirname "$exclude")"
	for p in .archon/.env; do
		grep -qxF "$p" "$exclude" 2>/dev/null || echo "$p" >> "$exclude"
	done

	# The Factory's pi folder trusts the project's repo too, in case a Run opens it directly;
	# without trust, pi stops at a "Trust project folder?" prompt.
	merge_json "$pi_dir/trust.json" "{\"$repo\": true}"

	mkdir -p "$config"
	grep -qxF "$repo" "$config/projects" 2>/dev/null || echo "$repo" >> "$config/projects"
	# FactoryClaw's list of projects, loaded into every one of its sessions. Without an
	# outer layer no session reads it, so install leaves it alone.
	if [ "$OUTER_LAYER" = factoryclaw ]; then
		python3 - "$claw/TOOLS.md" "$name" "$repo" "$pane" <<'EOF'
import os, sys
path, name, repo, pane = sys.argv[1:]
head = ["# TOOLS.md", "", "## Factory projects", "",
        "Written by the Factory's scripts/install.sh: one line per project, with its repo and its Project Manager's herdr pane.", ""]
lines = open(path).read().splitlines() if os.path.exists(path) else head
line = f"- {name}: repo {repo}, pane {pane}"
lines = [l for l in lines if not l.startswith(f"- {name}: ")] + [line]
new = "\n".join(lines) + "\n"
if not os.path.exists(path) or open(path).read() != new:
    open(path, "w").write(new)
EOF
	fi
}

if [ $# -eq 0 ]; then
	install_factory
	# ~/.config/factory/projects is the one list of projects. FactoryClaw's TOOLS.md is
	# rebuilt from it here, so a project whose line is removed leaves TOOLS.md too.
	if [ "$OUTER_LAYER" = factoryclaw ]; then
		rm -f "$claw/TOOLS.md"
	fi
	# A listed folder that is gone from this Mac is skipped with a note rather than
	# stopping install, which would leave TOOLS.md naming only the projects before it.
	while IFS= read -r repo; do
		if [ -z "$repo" ]; then continue; fi
		if [ ! -d "$repo" ]; then echo "skipped: $repo is in $config/projects but not on this Mac" >&2; continue; fi
		setup_project "$repo"
	done < "$config/projects"
else
	setup_project "$@"
fi
