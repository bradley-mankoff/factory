---
name: relay-message
description: Carry a Project Manager's message to the Human (a grilling round, a Spec to review, a Decision or a Human gate), and carry the Human's answer back into that Project Manager's pane. Use when a message begins "From the <project> Project Manager", or when the Human answers something a Project Manager asked.
---

# Relay a message and its answer

## From a Project Manager to the Human

A Project Manager's message arrives in this chat as `From the <project> Project Manager (herdr pane <pane>): <message>`, and my reply to it is sent to the Human on Telegram. Rewrite it for a phone as `AGENTS.md` says, keeping every question and fact. Shorten, but never rename what is being decided: keep the Project Manager's words for it (a "UI" or a "page" stays that, not a "window"), because a different word can lean the Human toward one of the choices. By kind:

- **A grilling round.** Keep each question's number, its context, the question and the recommended answer, because the Human answers by number ("Q2: no, …") or with one "yes" for every recommendation. Keep each question's context directly above it and any **For your information** after the last question, as the Project Manager sent them: never gather the context into one block ahead of the questions, or the Human answers it there and meets the same questions again below. End with: `Reply yes to take every recommendation, or answer by number.`
- **A Spec to review.** The message names an Epic. Read it with `bd -C <repo> show <epic id>`, with the repo's path from `TOOLS.md`, and summarise it: what people will be able to do, what it leaves out, and any open question. End with: `Reply yes to approve it, or say what to change.`
- **A Decision.** Give the question in plain words, the choices numbered, and the Project Manager's recommendation if it gave one. End with: `Reply with a number, or in your own words.`
- **A Human gate.** When the message names a demo video, attach it so the Human can watch it in the chat: put its full path on a line of its own as `MEDIA:<path>`, plain text with nothing else on the line. Say in one sentence what the new piece is for, in the Human's words: what a person does with it and why. Then say what the video shows, step by step, as a person would see it. Then ask: does this look and feel right, and does it fit the Idea? End with: `Reply yes to approve it, or say what feels wrong.` Approving the video approves the merge, so leave out the pull request's web address: the Human judges from the video alone. When the message says there is no video, say so in one line and give the pull request's web address instead.

## From the Human back to a Project Manager

1. **Find what the Human is answering**: the Project Manager message in this chat that is still waiting for an answer. If messages from more than one project are waiting, work out which part of the reply answers which message, and send each Project Manager only its own part. The Human replies tersely and trusts me to read intent, so use everything there is: product names or nicknames ("calc", "to do"), question numbers, the order in which my waiting messages were sent (in "yes and yes", the first answer goes to the first message), and what each part says (an answer about a port belongs to the message that asked about a port). "yes to both" or "all yes" gives each message a yes. A reply with a single answer and no other clue goes to the most recent waiting message. Ask the Human only when a part could still reasonably belong to more than one project after all that, and then ask about that part alone.
2. **Check the item is still open**, before anything is typed: the Human may have answered it in that pane already, and my answer would then land on a question that is gone. What to read depends on what the message asked:
   - **A Human gate.** The gate's Run id is in the message. List the project's attention queue with the project's repo, from `TOOLS.md`, as the working folder, the way `report-state` runs `archon workflow runs`:

     ```bash
     ~/.local/bin/archon workflow attention --json
     ```

     The gate still waits for the Human when an item's `runId` is that one. When no item has it, its Run was approved or rejected already — but only when the command itself worked: when it fails, or its answer warns that coverage may have gaps, the check was not made, so I leave the pane alone and reply in one line: `→ <Product>: I could not check whether that is still open, so nothing was sent; send it again in a while.`
   - **A Decision.** The Bead's id is in the message. Read its comments with `bd -C <repo> comments <bead id>`: the question is the comment that begins `Question for the Human`, and the Decision is still open while it is the last one; when a later comment begins `The Human's answer`, it was answered.

   A grilling round and a Spec review keep no such record, so they are relayed without this look.

   When the item is already answered, type nothing into the pane. Say in one line where it was answered, so the Human knows his answer was not dropped: `→ <Product>: already answered in its window, so I left it alone.` When the record holds his answer, give it back in his words: `→ <Product>: already answered in its window ("yes, ship it"), so I left it alone.`
3. **Make sure the pane is open**: find its Project Manager in `herdr pane list`, the pane whose `label` is its pane name and whose `agent` is `pi`. When there is none, the project is stopped, so open it with the `panes` skill and find the pane again. A reopened pane is a fresh session that does not remember its question, which is why the answer names its topic.
4. **Type the answer into the pane**, in the Human's words, unchanged, even when it is only "yes" or a number, using that pane's `pane_id`:

   ```bash
   herdr agent prompt <pane id> "FactoryClaw: The Human's answer to your message about <topic>: <the Human's words>"
   ```

   Without `--wait`.
5. **Reply** with one line: `→ <Product>`. For an answer to a Human gate, say what the answer does, so the Human knows it took: `→ <Product>: approved, merging now` or `→ <Product>: sent back to rework`.
