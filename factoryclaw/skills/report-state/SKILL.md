---
name: report-state
description: Tell the Human how one project is doing, from its Beads and its Runs. Use when the Human asks about a project's state, progress or what is waiting.
---

# Report a project's state

Report only when the Human asks, and only on the project the Human asks about. Read it with these commands, where `<repo>` is the project's path from `TOOLS.md`:

- `bd -C <repo> list --type=epic --status=open`: the Ideas in progress, one Epic each.
- `bd -C <repo> list --status=in_progress`: the work being built now.
- `bd -C <repo> list --label waiting-on-human`: the Beads and Epics waiting on the Human, whether a Decision, a grilling round or a Spec to review, so an Epic's round and a Spec's review are here too. The label is the Ask's state: `factory answer` swaps it for `answered` when the Human answers, and `factory asks` reads the same label. The latest `Ask: ` comment on each (`bd -C <repo> comments <id>`) holds its `Question:` line, and a failed connector's note can be newer than the Ask, so read back to the Ask comment rather than the last comment.
- `bd -C <repo> ready --exclude-type=spike,epic`: the work that can start next.
- `bd -C <repo> list --status=closed --limit 5`: the work finished most recently.
- `~/.local/bin/archon workflow runs`, run with `<repo>` as the working folder: the recent Runs and whether each is running, paused, completed or failed. Its time column is how long ago a Run started, not how long it ran. A paused Run waits at a Human gate, which is also waiting on the Human.

A claimed Bead is being built only while a Run for it is running. When its latest Run failed or completed, say so instead, in plain words: "the last build of <what> failed; the manager has not picked it up yet".

Reply in this form, in product words, leaving out any line with nothing in it:

```
🏭 <Product>: <one word: building, waiting, idle>
Building: <what is being built now>
Done lately: <what was finished>
Waiting on you: <each question, in a few words>
Next: <what starts next>
```
