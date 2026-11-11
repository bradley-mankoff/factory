---
name: grilling
description: Interview the Human about an Idea in rounds of numbered questions, each with a recommended answer, until you and the Human share one understanding of it, sharpening the project's words along the way. Use before writing a Spec with to-spec, when a Project Manager receives an Idea, or when asked to grill an Idea, a plan or a design, or to stress-test one.
license: MIT. Adapted from Matt Pocock's grilling and grill-with-docs skills, copyright 2026 Matt Pocock; full text in LICENSE.txt beside this file.
---

Run this skill when an Idea arrives; a Project Manager runs it for every Idea. Interview the Human until you both share one understanding of the Idea; the `to-spec` skill then writes that understanding down as a Spec.

The Human is the person who owns the project and decides what matters. An Idea is a few plain sentences from the Human about what the project should do. A Spec is the written version of an Idea, stored as the description of an Epic in the project's Beads (`bd`). A Project Manager is the Factory's agent that leads one project; FactoryClaw carries its messages to the Human when the Human is away.

## The project's words

Use the `domain-modeling` skill for the whole interview, because the Spec is written in the project's own words and they must be settled first. In short: when the Human uses a word that conflicts with the project's `GLOSSARY.md`, say so at once; when a word is vague, propose a precise one; test what words mean with concrete scenarios at the edges; check what the Human says against the code; write each settled word into `GLOSSARY.md` as soon as it is settled; offer an ADR only for a decision that is hard to reverse, surprising without context and the result of a real trade-off.

## The design tree

Map the Idea as a design tree: every decision branches into the decisions that hang off it. The frontier is every decision whose prerequisites are settled, so it holds the questions you can ask now without guessing at answers you have not heard yet.

Work the tree in rounds. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the Human's answers. A question whose answer depends on another question still open in the same round belongs to a later round. Each round of answers settles decisions and opens new ones, so recompute the frontier and ask the next round.

Number the questions across the whole interview, never starting again at Q1: if Round 1 asked Q1 to Q3, Round 2 starts at Q4. Head each round with its number. A question that follows up an earlier one repeats, in plain text, that earlier question and the Human's answer to it before asking the new one. The Human may read the round hours later on a phone, where a bare "following up Q1" means nothing, and FactoryClaw's rewrite for the phone drops links and folded text, so only the repeated words are sure to arrive.

Format a round like this:

```
**Round 2**

❓ **Q4** - **<question title>**: <the question, with the choices if there are any>

➡️ <your recommended answer>

---

❓ **Q5** - **<question title>**: In Q2 I asked <the earlier question>, and you answered <the Human's answer>. <the follow-up question>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer. The Human may answer a whole round with one "yes", or question by question ("Q5: no, …"). A question the Human skips stays open for the next round and keeps its number.

The Human often reads rounds on a phone, so keep each question to a few short lines in plain words, with choices as a short list and no tables.

## Reaching the Human

Ask each round where the Human last spoke to you, and take the reply there as the Human's answer. A Project Manager whose Idea or last answer came through FactoryClaw sends the whole round to FactoryClaw as one message, the way the Project Manager definition says to reach the Human; FactoryClaw types the Human's reply back into the pane.

## Facts are yours, decisions are the Human's

Finding facts is your job, never the Human's; do not ask the Human anything you could look up. When a frontier question needs a fact, look it up yourself: read the code, the Beads or the docs, or run a command. For a fact that needs long reading (how the Idea fits a large codebase, what a library does), hand the reading off so your own context stays on the interview. When you need the answer before you can go on, send a sub-agent (in pi, the `subagent` tool with the `scout` agent), which waits and hands back a short answer and the path of its findings file. When the answer can wait, start a research Workflow in the background with `archon workflow run factory-research --detach "<the question>"`, starting the Run as your instructions' step 5 says, `--base` included on a worktree Mac; its Notice arrives in this conversation with a short answer and the path of its findings file; do not wait on it: only the questions that depend on its answer wait; ask the rest of the frontier now. Either way, read the findings file only as far as you need.

The decisions are the Human's. Put each one to the Human and wait for the answer.

## When it ends

The interview is done when the frontier is empty: every branch of the tree visited, nothing silently assumed. Do not act on it until the Human confirms you share one understanding.

If the tree shows that the Idea is too big for one Spec, say so and use the `wayfinder` skill instead of writing one Spec.

Then commit any changes to `GLOSSARY.md` and the ADRs, and write the Spec with the `to-spec` skill.
