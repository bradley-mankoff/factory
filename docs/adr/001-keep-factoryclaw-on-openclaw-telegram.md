# ADR 001: Keep FactoryClaw on OpenClaw plus Telegram, trial pi plus Ovis beside it

Status: accepted on 2026-10-24, for Bead fac-km9.
Context: this ADR records the decision in the Factory repo, which holds the Factory source of truth in 2026-10-16-factory-stack.md and the Factory words in GLOSSARY.md.

## Decision

The Factory keeps FactoryClaw as an OpenClaw agent with Telegram as its phone path. A pi based FactoryClaw with Ovis on mobile runs only as a side trial on the toy repos. Beads stays the record of work. herdr-projects does not replace any Factory layer.

## Context

The Human asked whether the herdr-projects Coordinator with Ovis strictly dominates the FactoryClaw setup and perhaps obviates PersonalClaw and WorkClaw, so no distinct harness beyond pi is needed. The evidence came from reading the installed Factory definition in factoryclaw/AGENTS.md, project-manager/instructions.md, factoryclaw/skills/relay-message/SKILL.md, factoryclaw/skills/panes/SKILL.md, and HEARTBEAT.md, plus fresh clones of https://github.com/eliasstravik/herdr-projects and https://github.com/devswha/ovis.

The Human then narrowed the proposal to two changes only. First, use Ovis instead of Telegram, since Tailscale plus existing access makes the Telegram app unimportant. Second, drop herdr-projects as bloat and play the FactoryClaw role with a pi agent, which gives continuity of coding agent and makes FactoryClaw easy to adapt. The Human did not propose changing Project Managers, Beads, Archon Workflows, or the Workflow library.

## Reasons

1. One curated chat beats many panes on a phone. FactoryClaw routes terse phone answers to the right Project Manager by product name, question number, order of waiting messages, and yes to both handling, then types the Human words unchanged into the right herdr pane, per factoryclaw/skills/relay-message/SKILL.md. Ovis exposes every workspace, tab, and split pane at once, per its README.md, which invites answering in the wrong pane on a small screen.

2. Video gates are proven on Telegram and unproven on Ovis. FactoryClaw attaches the demo video with a MEDIA colon path line and the Human judges taste and fit from the video alone, per factoryclaw/skills/relay-message/SKILL.md. Ovis opens a tapped path in its file viewer, which needs proof over Tailscale serve to a PWA with push when a gate pauses.

3. Narrow tools keep FactoryClaw fast and safe. FactoryClaw runs four commands only with no pipes, denies write and edit, and uses exec ask mode, per factoryclaw/AGENTS.md and the installed OpenClaw config. A pi FactoryClaw starts with a wider context and needs a new start script plus a guard extension in the style of reference/archon-pi-spike/extensions/guard.ts, which is new code inside the 5,000 line size target.

4. OpenClaw stays for personal work. PersonalClaw holds machine wide memory with cross conversation recall, plus voice transcription and Telegram. Moving only FactoryClaw would leave two phone apps and two notification channels.

5. herdr-projects overlaps but does not dominate. Its finish line of commit plus catch up with main plus check plus draft pull request plus one second agent review plus human approval, per docs/how-work-gets-done.md, is weaker than the Factory split of spec review plus standards review on another model with bin/review-verdict, plus fixture tested Workflows pinned by library commit. Its Coordinator has no Epic, no Spec as Epic description, and no to-beads thin slices with blockers.

## Trial that could reverse this

Run one pi FactoryClaw pane in the factory herdr session for factory-toy-calc and factory-toy-todo only. Allow only herdr, bd show plus list plus ready plus comments, archon workflow status plus runs, and launchctl start factory.herdr. Prove a factory-build-gated Run approved from Ovis on the phone with the app closed, a two project waiting answer routed to the right pane, and two weeks with no wrong pane reply and no missed push. Also write the MEDIA attach to Ovis path tap mapping and confirm Ovis push over the Human Tailscale setup. If the trial passes, cut the phone path to pi plus Ovis. If PersonalClaw must stay on Telegram, decide explicitly to live with two phone apps.

## Consequences

scripts/install.sh keeps installing FactoryClaw into ~/.openclaw/workspace-factoryclaw/ with the four command allowlist. The phone habit stays as one Telegram chat for Factory plus personal. The trial pane carries no authority to start or stop Project Managers until this ADR is superseded. The Factory line count keeps counting the trial files once they are added to git.
