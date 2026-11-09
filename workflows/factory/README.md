# Factory Workflows

The core Workflows, which ship with the Factory core: this folder in the Factory's repo,
`workflows/factory/` (`~/Developer/personal_code/factory/workflows/factory/` on the personal
Mac), copied into the Workflow library (`$LIBRARY/factory/`) by `scripts/install.sh`, which
replaces the group whole. Change a core Workflow here, in the core repo, and install; never
in the installed copy, which the next install overwrites. A Workflow of the person's own, or
a fork for one Mac or one project, goes in a group of their own in the library, which
install never writes to.

A Project Manager reads this page, then opens only the Workflow it picks. Each Workflow is a
folder holding one YAML file, whose `name:` is `factory-` plus the folder's name, and its
`fixtures/`. A fork sits beside its parent: its folder's name starts with the parent's, it is
listed under the parent below, and its line says how it differs.

## Choosing

- Pick the Workflow whose line fits the Bead and run it as it is.
- Not every Bead is code, and a review is worth its cost only for work that will be built on. When one node can do the Bead and a review would add nothing, pick `task`.
- A problem particular to one project gets the nearest Workflow here, not a new one.
- A Workflow every project should have belongs here in the core: add its folder with its line below, in the Factory's repo, and install. Anything narrower, one project, one Mac or one client, goes in a group of the person's own in the library; fork a core Workflow there rather than changing this group.

## Workflows

- **build** (`factory-build`): builds one Bead in one pass. Work and checks; a spec review that only reads, and ends the Run with its findings on the Bead when it withholds; then a standards review that fixes what it finds inside the diff and commits it, the checks again, and the landing the Mac's Profile chooses: a pull request and its squash merge, or the commits squashed onto the base branch, checked again and pushed (`bin/land`). Pick it when the checks and the reviews can judge the result alone.
  - **build-gated** (`factory-build-gated`): the same single pass, but it holds the landing before the base branch moves, records a demo video of the change and waits at a Human gate for taste and fit. Pick it when the Bead changes something the Human will see or use.
- **task** (`factory-task`): one node does the Bead, with no review. It either answers (research, a brainstorm, a plan, an explanation), and the answer is its output in `archon workflow get`, or makes a change the Bead spells out exactly, which the checks gate before the landing. Pick it for anything one careful step can finish.
- **research** (`factory-research`): two nodes look into one question in parallel, and a third combines their findings into one file that opens with a short answer. Pick it when a question needs long reading that would fill your own context.
- **register** (`factory-register`): registers a repo with Archon from its main checkout, with one shell node and no model. Not for a Bead: `bin/archon-register` runs it when a Project Manager starts in one of the repo's worktrees, because Archon finds a worktree's project only through the main checkout's registration (`WORKSPACE=worktree` in the Mac's Profile).

## Checks

Each AI node can be held to checks that run when its agent tries to finish; a failing check sends the agent back with its message, at most twice (Flows, fac-qpv.3). A Workflow lists a node's checks in `flows/<name>` beside its YAML, one per line, and the node's prompt begins with `$prompts.output.marker_<name>`, which the `prompts` node prints when given the Workflow's folder. That node reads the Workflow's YAML and fails, naming the file, when a flows file names no node or a prompt asks for a marker no flows file produces, so a mismatch stops the Run before an unchecked agent starts (fac-wtw). The checks, each one job with no conditions: `changed-files`, `no-changes`, `file-exists <path>` (worktree, or relative to the Run's artifacts), `check-passes`, `closing-account`. Assign only the checks that fit the node: a build's work node `changed-files`, `check-passes`, `closing-account`; a research node its findings file and `no-changes`. A build runs `work-finished` after its checks, so failed checks end the Run before the reviews. A Workflow is the one place a node's checks live: when a Bead's definition of done differs from its Workflow's checks, fork the Workflow with that node's `flows/` file and start the Run on the fork; a Bead never restates them.
