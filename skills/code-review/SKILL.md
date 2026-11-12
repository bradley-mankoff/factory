---
name: code-review
description: Review a branch or the changes since a commit in the Factory's order, the spec review first, against the Bead and its Epic's Spec, then the standards review once it approves. Use when asked to review a branch, a pull request or work in progress.
license: MIT. Adapted from Matt Pocock's code-review skill, copyright 2026 Matt Pocock; full text in LICENSE.txt beside this file.
---

Review the changes between a fixed point and `HEAD` in the Factory's order: a spec review, then a standards review. The spec review asks whether the change does what its Bead asked, no less and no more; the standards review asks whether it follows the repo's coding standards and avoids the baseline of code smells. Each review runs in a fresh sub-agent when the session has one, so one review's reading of the change cannot colour the other.

A Bead is one unit of work in the project's Beads (`bd`); its Epic is the parent Bead holding the Spec it was cut from. A sub-agent is an agent a session starts for one question. A Run is one execution of a Workflow, and its build runs these two reviews as separate nodes.

## Pin the change

Take the fixed point from the question: a commit, a branch, a tag or `HEAD~5`. Confirm it resolves (`git rev-parse <fixed-point>`) and that `git diff <fixed-point>...HEAD` is not empty. Note the commits with `git log <fixed-point>..HEAD --oneline`.

Find the Bead from the commits and the branch name, or from the question, and read it with `bd show <bead id>`; read its Epic with `bd show <parent id>` for the Spec. When no Bead is named, review against the change itself and say so. Give each review the Bead, its Epic and the fixed point.

## The two reviews

Run the spec review first, in a fresh sub-agent, with the prompt in `~/.local/share/factory/prompts/review_spec.md`: it checks fidelity to the Bead and the Spec, whether the tests reach the seam and would fail without the change, and whether anything ends in an error. When the session has no sub-agents, run the two reviews one after the other yourself, and say so in the report.

Only when the spec review approves, run the standards review in another fresh sub-agent, with the prompt in `~/.local/share/factory/prompts/review_standards.md`: it checks the repo's documented standards, Fowler's smells and the four design judgements, and fixes what it finds. A withheld spec review ends the review with its findings, and the standards review does not run.
