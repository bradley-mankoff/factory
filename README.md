# The Factory

The Factory turns an Idea, a few plain sentences from the Human about what a project should do, into reviewed, merged code in that project's repo. It asks the Human only what the Human alone can answer: what the Idea means, and whether the result looks and feels right. The judgment lives in models, not in code: there is no poller and no dispatcher program.

The words used here (Human, Idea, Spec, Epic, Bead, Workflow, Run, Project Manager, FactoryClaw) are defined in `GLOSSARY.md`. The full design is the spec, `2026-10-16-factory-stack.md`.

## How it works

Three layers:

1. **FactoryClaw**, an OpenClaw agent the Human talks to on Telegram, carries messages between the Human and the Project Managers. Its routing and skills are in `factoryclaw/`.
2. **A Project Manager** per project, a pi session in that project's herdr pane, grills the Human about the Idea, writes the Spec as an Epic in Beads, splits it into Beads, and starts a Run for each one. Its definition is in `project-manager/`, and the skills it uses are in `skills/`.
3. **Runs** of Archon Workflows do the work, each in its own git worktree: build, check, an adversarial review, land the work the way the Mac's Profile says, and tell the Project Manager. The core Workflows are in `workflows/factory/` here, and `scripts/install.sh` copies them into the shared Workflow library in the Archon home, beside the person's own groups, which install never writes to.

The Human reaches the Factory only through FactoryClaw or by typing in a Project Manager's pane, and hears from it only when something needs the Human: a grilling round, a Spec to review, a Decision, or a check of taste and fit. What differs between the Macs, such as the outer layer and how Runs land, is in that Mac's Profile: `config/profile` is the one example, the personal Mac's, and a Mac whose Profile chooses otherwise writes its own.

The Factory itself holds no pi extension. It depends on five pi packages, each in a repo of its own: pi-beads, pi-links, pi-chains, pi-notices and pi-flows (fac-qpv.8.1). install puts pi-beads, pi-links, pi-chains and pi-notices in the Human's own pi (`~/.pi/agent`), where Project Managers and his other sessions load them, and pi-chains and pi-flows in the Factory's pi folder that every Run node loads. It links both folders' `chains.json` to the Chains file the Profile names, and gives `project-manager/start` the two settings the packages read from the environment: the Project Manager's Notice file and the board's port.

## Install

```bash
scripts/install.sh
```

It follows the Mac's Profile, `~/.config/factory/profile`: install ships `config/profile`, the one example, which is the personal Mac's, when that file is missing and never overwrites it, and a Mac whose Profile chooses otherwise puts its own file in place before its first install. This puts the Factory's installed files under one root, `~/.local/share/factory/` (except Archon's home, which the Profile names): it copies the Project Manager's definition, its skills and `GLOSSARY.md` there, installs the pi packages the Factory depends on, writes the archon wrapper for the Profile's Archon home into the `commands/` folder under that root and links it to `~/.local/bin/archon`, sets up the Factory's own pi folder there (`pi-agent/README.md` explains it), starts herdr's `factory` session as the launchd job `factory.herdr`, and, with the example Profile's outer layer, installs FactoryClaw's files into `~/.openclaw/workspace-factoryclaw/` with an exec allowlist of the four commands it runs. A Mac whose Profile chooses no outer layer gets no FactoryClaw or OpenClaw file, and install puts Archon's home and the Workflow library where that Profile names them. It also builds the Factory map, `~/.local/share/factory/map.html`: a collapsible page, opened in any browser, of every folder and file on this Mac that makes up or serves the Factory, built from `map/paths.txt`. The settings a person edits are in `~/.config/factory/`: `profile` (this Mac's Profile: how Runs land, the protected targets, the outer layer, the workspace shape, the Chains file, the Archon home and the Workflow library, and the Project Manager's Chain and FactoryClaw's model), `chains.json` (the Chains: each role's ordered models and thinking levels, copied from `config/chains.json` to the path the Profile names the first time and never overwritten) and `projects`, the list of Factory projects, each set up again on every run. Archon's tiers and @aliases are set to those Chain roles by `bin/archon-roles` on every install. Run it again after changing anything in this repo; a second run changes nothing.

It installs the versions of Archon (with its pi provider), pi and pi-claude-bridge written at its top, which are upgraded together. It needs npm, curl, herdr, `bd` and `gh`. On the personal Mac it also needs OpenClaw with the FactoryClaw agent, and FactoryClaw must have had one Telegram chat with the Human; a Mac whose Profile chooses no outer layer needs neither.

## Set up a project

```bash
scripts/install.sh <path to the project's repo> "<its check command>"
```

The repo needs git, a GitHub remote and Beads (`bd init`). This writes its uncommitted `.archon/.env` (the Factory's pi folder, the Project Manager's pane name, FactoryClaw's Telegram chat, the check command and the identity its Runs commit as), trusts the repo in the Factory's pi folder, and adds it to `~/.config/factory/projects` and to FactoryClaw's list of projects. The check command is needed the first time only.

Then send FactoryClaw an Idea for the project, or tell it to get the project to work; "stop <project>" stops its Project Manager. FactoryClaw opens the project's pane if it is closed; watch the panes with `herdr session attach factory`.

## Size

The whole Factory stays under 5,000 lines of Factory-specific code, skills, docs and `AGENTS.md` files, not their comments, docstrings or blank lines (the Human, 2026-11-09). Whether something counts is judgment: does the Factory depend on it, or merely use it (the Human, 2026-11-09)? The menu bar apps, the herdr plugins, micro, the markdown preview viewer and the terminal click and paste conveniences do not count; what counts is this repo's own code, skills, docs and `AGENTS.md` files, never those files as they live inside each project folder. Core pi, core Archon and core Beads are used, not maintained, and never count. Nothing enforces it. This section holds no number, because a stored count went stale with every Run and parallel Runs collided rewriting it (2026-11-08); the command from `AGENTS.md` gives today's count as an upper bound:

```bash
scripts/size
```
