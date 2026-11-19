---
name: to-spec
description: Turn the grilling conversation about an Idea into a Spec and store it as the description of the Epic the grilling opened in Beads, with no further interview. Use when grilling an Idea has finished and the shared understanding is ready to write down, or when asked to write a spec, a PRD or the Epic for an Idea or a conversation.
license: MIT. Adapted from Matt Pocock's to-spec skill, copyright 2026 Matt Pocock; full text in LICENSE.txt beside this file.
---

Run this skill once grilling has made an Idea clear. Turn what the conversation already settled, and what you know of the code, into a Spec, and store the Spec as the description of the Epic the grilling opened. Do not interview the Human again: write down what you already know.

The Human is the person who owns the project. An Idea is a few plain sentences from the Human about what the project should do; a Spec is its written version. An Epic is a parent Bead in the project's Beads (`bd`), holding one Spec and the Beads made from it. If `bd` finds no Beads database in the repo, ask the Human before running `bd init --role maintainer`: `bd` infers `contributor` in a repo that has an `upstream` remote (a fork), and `bd ready` would read the empty contributor planning store instead of the project's own Beads (fac-3zx). For everything in the project's own domain, use the words of the project's `GLOSSARY.md` (older projects call it `CONTEXT.md`), if it has one.

## Process

1. Explore the repo to learn its current state, if you have not already. Use the project's glossary words throughout the Spec, and respect any ADRs in the area the Idea touches.

2. Sketch the seams at which the work will be tested. Prefer existing seams to new ones, and the highest seam possible. If a new seam is needed, propose it at the highest point you can. The fewer seams across the codebase, the better; the ideal number is one. Choose the seams yourself; do not ask the Human about them. Use the `tdd` and `codebase-design` skills for where seams go and what to test at them.

3. Write the Spec into the Epic's description with the template below, passing the text on standard input. Grilling opened the Epic, so this writes into it rather than making another:

   ```bash
   bd update <epic id> --stdin <<'SPEC'
   <the whole Spec>
   SPEC
   ```

   One Spec makes exactly one Epic, and the Epic's description holds the whole Spec. Never write the Spec as a file in the project repo, so specs do not pile up as documents.

4. Put the Spec review to the Human as an Ask on its Epic: `factory ask <epic id> spec-review "<the question>"`, framed so one word answers it. Record the answer with `factory answer <epic id> "<the Human's answer>"` before acting on it, apply every change the Human asks for to the Epic's description (`bd update <epic id> --stdin`), and put the review in again when the changes are in. Once the Human approves, remove the `answered` label with `bd label remove <epic id> answered`.

5. End by stating the Epic's id and naming the `to-beads` skill as the next step: it splits this Epic into Beads.

<spec-template>

## Problem Statement

The problem the project's users face, from their point of view.

## Solution

The solution to that problem, from their point of view.

## User Stories

A long, numbered list of user stories that covers every aspect of the Idea. Each one has this form:

1. As a <actor>, I want <feature>, so that <benefit>

For example: "1. As a mobile bank customer, I want to see the balance on my accounts, so that I can make better informed decisions about my spending."

## Implementation Decisions

The decisions made, which can include:

- the modules that will be built or changed, and the interfaces of those that change;
- technical clarifications from the Human;
- architectural decisions, schema changes and API contracts;
- specific interactions.

Leave out file paths and code snippets; they go stale quickly. The exception is a snippet from a prototype that states a decision more precisely than prose can (a state machine, reducer, schema or type shape). Put it inside the decision it belongs to, trimmed to the parts that carry the decision, and say it came from a prototype.

## Testing Decisions

- What makes a good test here: it tests external behaviour, not implementation details.
- The seams chosen in step 2, and the modules tested at them.
- Prior art: similar tests already in the codebase.

## Out of Scope

What this Spec does not cover.

## Further Notes

Anything else about the Idea.

</spec-template>
