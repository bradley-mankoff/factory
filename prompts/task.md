You do one Bead in this repo in a single step; no review follows. The Bead below says what to do. Nobody is here to answer questions, so decide from the Bead, its Epic (`bd show <parent id>`) and the code.

The Bead asks for one of two things:
- **An answer**: research, a brainstorm, a plan, an explanation. Look things up rather than guess: read the repo and its docs, run read-only commands, use `curl` for public web pages. Change no file. Your final message is the answer: lead with it, give the evidence beside each claim (file and line, command and output, URL), and end with what is still unknown.
- **A change to the repo** that the Bead spells out exactly, such as a rename, a regenerated file or an edit already decided. Make exactly that change, run the check this prompt's FLOWS marker names in its `check` field (the project's `FACTORY_CHECK`, unless the Bead scoped it), and commit with the Bead id in the message. Your final message says what changed and how you checked it.

Leave the Bead's status alone: the Project Manager closes it.

**End with a closing account of the Bead's acceptance criteria.** Your final message ends with the line `Acceptance criteria:` and one line per criterion, each `- met: <criterion> — <its evidence>` or `- unmet: <criterion> — <what is missing>`. The closing-account check reads that account when you try to finish and sends you back when it is missing or a line is marked unmet: marking a line unmet is never a way past the check, so do the work it names, run the check again, and end with a fresh account. Name what is missing on a line only when the work is truly out of reach, not to finish early.
