---
name: relay-message
description: Carry a Project Manager's message to the Human (a grilling round, a Spec to review, a Decision or a Human gate), and carry the Human's answer back into that Project Manager's pane. Use when a message begins "From the <project> Project Manager", or when the Human answers something a Project Manager asked.
---

# Relay a message and its answer

## From a Project Manager to the Human

A Project Manager's message arrives in this chat as `From the <project> Project Manager (herdr pane <pane>): <message>`, and my reply to it is sent to the Human on Telegram. Rewrite it for a phone as `AGENTS.md` says, keeping every question and fact. Shorten, but never rename what is being decided: keep the Project Manager's words for it (a "UI" or a "page" stays that, not a "window"), because a different word can lean the Human toward one of the choices. By kind:

- **A grilling round.** Keep each question's number, the question and the recommended answer, because the Human answers by number ("Q2: no, …") or with one "yes" for every recommendation. End with: `Reply yes to take every recommendation, or answer by number.`
- **A Spec to review.** The message names an Epic. Read it with `bd -C <repo> show <epic id>`, with the repo's path from `TOOLS.md`, and summarise it: what people will be able to do, what it leaves out, and any open question. End with: `Reply yes to approve it, or say what to change.`
- **A Decision.** Give the question in plain words, the choices numbered, and the Project Manager's recommendation if it gave one. End with: `Reply with a number, or in your own words.`
- **A Human gate.** When the message names a demo video, attach it so the Human can watch it in the chat: put its full path on a line of its own as `MEDIA:<path>`, plain text with nothing else on the line. Say in one sentence what the new piece is for, in the Human's words: what a person does with it and why. Then say what the video shows, step by step, as a person would see it. Then ask: does this look and feel right, and does it fit the Idea? End with: `Reply yes to approve it, or say what feels wrong.` Approving the video approves the merge, so leave out the pull request's web address: the Human judges from the video alone. When the message says there is no video, say so in one line and give the pull request's web address instead.

**Claude usage before a Run.** A Project Manager and its reviews run on Chains, so the Claude plan's usage is a warning, not a gate (fac-qpv.1.4). Before relaying a Spec to review, or a Decision that picks a plan or a piece of work to build, run `~/.local/share/factory/bin/claude-usage`. Its line is checked only now, never while work runs. When it begins `Claude usage OK`, or says the usage could not be read, leave it out and say nothing about usage: unreadable usage means silence, not a status update. Otherwise put it in this same message, as one plain sentence just before what to reply: "Claude usage is low: 20% of the 5-hour window is left until Monday 1 AM." When it says the usage is used up, add that the work will start on the next model in its Chain.

## From the Human back to a Project Manager

1. **Find what the Human is answering**: the Project Manager message in this chat that is still waiting for an answer. If messages from more than one project are waiting, work out which part of the reply answers which message, and send each Project Manager only its own part. The Human replies tersely and trusts me to read intent, so use everything there is: product names or nicknames ("calc", "to do"), question numbers, the order in which my waiting messages were sent (in "yes and yes", the first answer goes to the first message), and what each part says (an answer about a port belongs to the message that asked about a port). "yes to both" or "all yes" gives each message a yes. A reply with a single answer and no other clue goes to the most recent waiting message. Ask the Human only when a part could still reasonably belong to more than one project after all that, and then ask about that part alone.
2. **Make sure the pane is open**: `herdr --session factory agent get <pane>`; if it fails, open it with the `panes` skill. A reopened pane is a fresh session that does not remember its question, which is why the answer names its topic.
3. **Type the answer into the pane**, in the Human's words, unchanged, even when it is only "yes" or a number:

   ```bash
   herdr --session factory agent prompt <pane> "FactoryClaw: The Human's answer to your message about <topic>: <the Human's words>"
   ```

   Without `--wait`.
4. **Reply** with one line: `→ <Product>`. For an answer to a Human gate, say what the answer does, so the Human knows it took: `→ <Product>: approved, merging now` or `→ <Product>: sent back to rework`.
