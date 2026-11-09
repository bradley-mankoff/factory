# Words

The one glossary of the Factory. Other files in this repo use these words as defined here and point here rather than define them again. Taken from the "Words" section of `2026-10-16-factory-stack.md`.

- **Factory**: the whole system this repo builds, which turns an Idea into reviewed, merged code in the right project repo.
- **Human**: the person who owns every project and decides what matters.
- **FactoryClaw**: the OpenClaw agent that carries messages between the Human and the Project Managers.
- **Project Manager**: the agent that leads one project. It runs as a pi session in that project's herdr pane.
- **Idea**: a few plain sentences from the Human about what a project should do.
- **Spec**: the written, domain-modelled version of an Idea, in the project's own words. A Spec is stored as the description of an Epic, not as a file in the project repo, so specs do not pile up as documents.
- **Epic**: a parent Bead holding one Spec and the Beads made from it.
- **Map**: an Epic labelled `wayfinder:map` that charts the way from an Idea too big for one Spec to the Specs that will carry it. Its children are **map Beads** of type `spike`, each settling one question; they never get a build Workflow.
- **Bead**: one unit of work in Beads (`bd`). A Bead is a thin vertical slice that can be shown working on its own. It is sized to fit one fresh context window, and it names the Beads that block it. The `to-beads` skill sets a minimum size as well as a maximum, so every Bead is worth a Workflow of its own.
- **Agent**: a model session with its own instructions, tools and lifetime. FactoryClaw, PersonalClaw, each Project Manager and the session that each AI node of a Run runs are all agents (the Human, 2026-10-19). The agent in an AI node is named by its kind: the work agent, the spec review agent, the standards review agent, the demo agent, the research agent.
- **Scout**: an agent a Project Manager starts to look up one question, which hands back a short answer and a file. Scouts are not part of Workflows.
- **Workflow**: an Archon workflow file. It says how one piece of work gets done: which nodes run, in what order, on which model, with which tools.
- **Workflow library**: the folder of Workflows that every project's Runs read, in the Archon home's global workflows folder. Its `factory/` group is the core Workflows, which each install replaces from the Factory core; the person's own Workflows sit in groups of their own beside it, which install never writes to.
- **Run**: one execution of a Workflow.
- **Node**: one entry in a Workflow's `nodes:` list. An AI node runs an agent in pi; a shell node runs a command.
- **Human gate**: a node in a Workflow that waits for the Human's answer.
- **Decision**: a question only the Human can answer.
- **Factory core**: the part of the Factory every Mac installs: the skills, the Project Manager's definition, the prompts, the helpers, the pi packages it depends on and the core Workflows. This repo is its source; the work Mac installs tagged releases of it (fac-qpv.6).
- **Profile**: one Mac's settings file, `~/.config/factory/profile`, which says how the Factory core behaves there: how Runs land and on which branches, how Notices reach Project Managers, whether FactoryClaw is the outer layer, the Chains, and whether a Project Manager leads a project or a worktree (fac-qpv.6.3). install ships `config/profile`, the one example, which is the personal Mac's, when the file is missing and never overwrites it; a Mac whose Profile chooses otherwise writes its own (fac-qpv.6.7).
- **Account**: one provider login through which models are reached, such as `claude-bridge`, `codex-a`, `codex-b` or `opencode-go`. Models on one login share its usage limit, so an account that runs out is marked used up until its reset time, and every agent on the Mac skips it (fac-qpv.1.2).
- **Reset time**: when an account's usage comes back: the time the provider's message names, or one hour after the account was marked used up when the message names none (fac-qpv.1.2).
- **Chain**: the ordered list of models, each with its thinking level, that one role runs on. Each entry of a Chain is one model and the thinking level it runs at, reached through one or more seats; an agent moves to the entry's next seat when the account behind its seat runs out of usage, and moves to the next entry only when every seat of the current entry is used up (fac-qpv.1).
- **Seat**: one login a model is reached through. A Chain entry that names one seat reaches its model through that login alone; an entry that names several seats, such as two ChatGPT logins `codex-a` and `codex-b` for one GPT model, tries them in turn, so sessions take turns starting on each and both drain evenly.
- **Notice**: a Run's one-line report to its Project Manager of how it ended, delivered into the Project Manager's conversation as a message of its own, never through the text box (fac-qpv.2).
- **Flow**: the checks that say when the agent in one AI node may finish. A Workflow carries its nodes' Flows in its `flows/` folder, the one place they live; a node that needs different checks gets a forked Workflow (fac-qpv.3).
- **Landing**: how a Run's commits reach its base branch, which the Mac's Profile chooses: a pull request into the base branch and its squash merge, or the commits squashed onto the base branch, checked again and that branch pushed. `bin/land` does it in one place and refuses a protected target first (fac-qpv.6.4).

## Words this Factory does not use

These belonged to the earlier Factory in `~/Developer/graph_engineering`. Using them here would mix the two systems up.

- Boss: say Human. The home-folder `AGENTS.md` files still say Boss; they describe the same person.
- Ticket: say Bead. Matt Pocock's `to-tickets` skill, which `to-beads` is adapted from, uses it.
- Dispatcher, Helper, Portfolio Manager: there are no such programs or roles. A Project Manager starts Runs itself.
- Worker, implementer: say work agent, the agent in a Workflow's work node.
- Reviewer, as a role: say spec review agent or standards review agent, the agent in a review node.
- Step, as a unit of work: say Bead for the work and Node for a part of a Workflow.
- lights-on, lights-off: say starting and stopping the Factory.
