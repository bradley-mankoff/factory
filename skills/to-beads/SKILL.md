---
name: to-beads
description: Split the Spec in one Epic into Beads that are thin vertical slices, each a child of the Epic with its blocking edges as native Beads dependencies, so bd ready shows which can start. Use when an Epic written by to-spec needs its Beads, or when asked to break an Epic, a Spec or a plan into Beads, tickets or issues.
license: MIT. Adapted from Matt Pocock's to-tickets skill, copyright 2026 Matt Pocock; full text in LICENSE.txt beside this file.
---

Run this skill on an Epic that `to-spec` wrote. Split the Spec in the Epic's description into Beads, each a tracer bullet: a thin vertical slice that can be shown working on its own and that names the Beads blocking it.

The Human is the person who owns the project. An Epic is a parent Bead holding one Spec, the written plan for one Idea; a Bead is one unit of work in the project's Beads (`bd`). For everything in the project's own domain, use the words of the project's `GLOSSARY.md` (older projects call it `CONTEXT.md`), if it has one.

## Process

1. Read the Epic with `bd show <epic id>`: its whole description is the Spec. Read its comments too.

2. Explore the repo to learn its current state, if you have not already. Use the project's glossary words in every Bead, and respect any ADRs in the area the Spec touches. Look for prefactoring that makes the work easier: make the change easy, then make the easy change.

3. Draft the Beads as vertical slices.

   - Each slice cuts a narrow but complete path through every layer the Spec touches (schema, API, interface, tests), not one layer across many features.
   - A finished slice can be shown working, or checked, on its own.
   - Prefactoring comes first.
   - Each Bead lists the Beads that must be done before it can start. A Bead with no blockers can start at once.

   Every Bead is built on its own, in a fresh session with its own review and landing (in the Factory, one Workflow Run per Bead), so a Bead must be worth that cost. Check every slice against both limits:

   - **Minimum.** The Bead adds or changes behaviour that someone can see from outside the code, at the seam the Spec's Testing Decisions name, and it brings at least one test at that seam that fails before the Bead and passes after it. Its acceptance criteria name that test. A slice below this (a helper, a single flag with no behaviour of its own, tests alone, a layer alone) is merged into the neighbouring Bead whose behaviour it serves. Prefactoring with no visible behaviour is the first part of the Bead that needs it, unless it is too big to fit in that Bead; then it is its own Bead, and its check is that the whole suite still passes.
   - **Maximum.** A model starting fresh, with only the Bead's description and the repo, can finish the Bead in one context window: write the code, write the tests, and see them pass. If a Bead holds two behaviours that could each be shown working alone and each meets the minimum, split it. If its acceptance criteria run past about six, or it needs reading most of a large codebase, split it.

   When a slice fails one limit, fix the slice now, by merging or splitting. Do not leave it for a later Bead to clean up.

   **Wide refactors are the exception to vertical slicing.** A wide refactor is one mechanical change, such as renaming a column or retyping a shared symbol, that fans out across the whole codebase, so one edit breaks every call site at once and no vertical slice can pass its tests. Sequence it as expand and contract. First expand: add the new form beside the old, so nothing breaks. Then move the call sites over in batches sized by how far the change spreads (per package, per directory), each batch its own Bead blocked by the expand, with the tests passing after every batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a Bead blocked by every batch. When even the batches cannot pass alone, keep the sequence but let them share an integration branch, and have them all block a final Bead that integrates and checks; only that Bead promises passing tests. The minimum above does not apply to these Beads; each one is still worth building on its own because it moves part of the codebase.

4. Create the Beads without asking the Human to approve the breakdown; the size limits above stand in for that review. Create them in dependency order, blockers first, so each blocking edge points at a Bead that already exists. Each Bead is a child of the Epic, its acceptance criteria go in `--acceptance`, and its description, passed on standard input, follows the template below:

   ```bash
   IFS= read -r -d '' acceptance <<'AC' || true
   - [ ] <criterion 1>
   - [ ] <criterion 2>
   AC
   bd create --silent --parent=<epic id> --title="<Bead title>" --acceptance="$acceptance" --stdin <<'BEAD'
   <the description>
   BEAD
   ```

   Run one Bead per command exactly in this shape, read the id it prints, then add each blocking edge with `bd dep add <new Bead id> <blocker id>`. The quoted heredocs keep backticks, `$` and apostrophes as written; typed straight inside double quotes, a backtick runs as a command and blanks the text. Do not wrap `bd create` in `$(...)` to capture the id: macOS's bash 3.2 fails on a heredoc inside `$(...)` when the text holds an apostrophe. `read -d ''` ends with status 1, hence `|| true`.

   Make every blocking edge a native dependency with `bd dep add`, so `bd ready` leaves out a Bead until its blockers are closed and `bd show` lists them. Do not repeat the blockers in the description.

   Do not close or change the Epic.

5. End by listing the new Beads (`bd children <epic id>`) with their blockers, and naming the ones `bd ready --parent=<epic id>` shows as able to start.

<bead-template>

## What to build

The behaviour this Bead makes work, from the point of view of the project's users, not a list of changes layer by layer.

</bead-template>

Leave out file paths and code snippets; they go stale quickly. The exception is a snippet from a prototype that states a decision more precisely than prose can (a state machine, reducer, schema or type shape). Put it inline, trimmed to the parts that carry the decision, and say it came from a prototype.
