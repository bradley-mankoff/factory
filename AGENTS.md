# The Factory

This repo is the source of the Factory: the skills, the Project Manager's definition, FactoryClaw's routing and skills, the node prompts, the clean pi setup for Runs and the core Workflows. The core Workflows live in `workflows/factory/`, and `scripts/install.sh` copies them into the Workflow library, the Archon home's global workflows folder, beside the person's own groups, which install never writes to. `scripts/install.sh` copies or links them to where they are read; nothing runs from this folder directly.

- `2026-10-16-factory-stack.md` is the spec and the source of truth. When work finds the spec wrong, change the spec in the same commit.
- `GLOSSARY.md` holds the words; use them in every file. It also lists the earlier Factory's words, which this repo replaces.
- `map/paths.txt` lists every Factory path on this Mac with a line on what it is; `map/render` builds the page from it. A change that adds, moves or removes such a path updates `map/paths.txt` in the same commit.
- `reference/` is copied evidence, chiefly the Archon and pi spike in `reference/archon-pi-spike/RESULTS.md`. Read it before writing Workflows or pi setup; it is not part of the Factory.
- Matt Pocock's skills, which several Factory skills and node prompts adapt, are cloned at `~/Developer/reference/mattpocock-skills`. What the Factory has adapted (its planning skills and `prompts/`) is its own and no longer follows his releases (the Human, 2026-10-19); read his clone for ideas, not to sync. The Project Manager still loads his unadapted `domain-modeling`, `tdd`, `codebase-design` and `prototype` as installed in `~/.agents/skills`.

## Rules

- **Greenfield.** Write everything here new. The earlier Factory in `~/Developer/graph_engineering` stays as it is: take no code from it, migrate nothing, keep no compatibility, delete nothing there.
- **Judgment in models.** Write code only for what a model cannot do reliably. Prefer guidance in instructions to code that checks. A gate whose job is to restrict which changes are allowed is never proposed.
- **Fix the source.** Prevent a problem in the instructions that create the work, not with a later fix that cleans up after it.
- **Fast checks.** A quick check finishes in seconds. Run anything long in the background and let the check read its saved result.
- **Toy repos are gone.** `~/Developer/personal_code/factory-toy-calc` and `factory-toy-todo` served the first end-to-end Runs, left the project list on 2026-10-28, and were deleted locally on 2026-10-31. Try things in a scratch repo.
- **Plain artifact voice** for every file, Bead and commit message (`~/AGENTS.md` has the short form).

## Beads and git

Track all work in Beads (`bd`); markdown holds specs and decisions, never status.

- `bd prime` at session start: the `pi-beads` pi package adds its output to the first prompt; without it, run it yourself. `bd ready` shows what can start.
- `bd update <id> --claim` before starting, `bd comments add <id> "..."` for evidence, `bd close <id> --reason "..."` when done and checked. Edit fields with `bd update` flags; `bd edit` opens an editor and hangs.
- `bd remember "..."` for a lesson about this repo.
- Commit when a Bead's work is done and checked, with the Bead id in the message. The remote is the public repo `github.com/bradley-mankoff/factory` (set up 2026-10-17, public since 2026-11-09), whose history carries only GitHub's private address. The full history and the Beads database are in the private repo `github.com/bradley-mankoff/factory-history`, reached as the git remote `history` and as the Dolt remote `origin` (`bd dolt push`). Commit often. The MVP was pushed on 2026-10-21 at the Human's word; push again when the Human says.

## Size

The whole Factory stays under 5,000 lines. The count covers Factory-specific code, skills, docs and `AGENTS.md` files, not their comments, docstrings or blank lines (the Human, 2026-11-09). It leaves out `reference/` (copied evidence), `tests/` (evidence that the code works, left out so the count never argues against writing a test; the Human, 2026-11-08), `.beads/` (the database), and the Beads integration files `bd init` wrote (`.agents/skills/beads/`). Whether something counts is judgment: does the Factory depend on it, or merely use it (the Human, 2026-11-09)? Conveniences it merely uses do not count: the menu bar apps, the herdr click-open and sidebar plugins, micro, the markdown preview viewer, and the control-click and paste setup in ghostty, pi, hammerspoon and tua. What counts is this repo's own code, skills, docs and `AGENTS.md` files, never those files as they live inside each project folder. Core pi, core Archon and core Beads are used, not maintained, and never count. Untracked files that git does not ignore are counted, so new work counts before it is committed. Nothing enforces the target. No file stores the count: run scripts/size, so a commit never has to rewrite a number and parallel Runs never collide on one.

```bash
scripts/size
```
