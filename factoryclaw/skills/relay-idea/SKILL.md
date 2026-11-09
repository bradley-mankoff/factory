---
name: relay-idea
description: Carry an Idea from the Human to the right project's Project Manager. Use when the Human asks for something to be built, added, fixed or changed in one of the Factory's projects.
---

# Relay an Idea

1. **Find the project.** Read `TOOLS.md` now, with the read tool, even if this chat has read it before: setting up a project changes it, and an earlier read sent an Idea to a project that was no longer listed. Pick the one the Human named or plainly meant. When the Idea plainly means several projects ("each of the toy apps", "all of them"), each of them gets the Idea: do steps 2 and 3 for every one. If it is unclear which project fits, or none does, ask the Human which, listing each by its product name, and stop: that question is the reply.
2. **Make sure its pane is open.** `herdr --session factory agent get <pane>` fails when it is closed; then open it with the `panes` skill.
3. **Type the Idea into the pane**, in the Human's words, unchanged:

   ```bash
   herdr --session factory agent prompt <pane> "FactoryClaw: An Idea from the Human: <the Human's words>"
   ```

   Without `--wait`. The Project Manager grills the Human about it through me, so its first round arrives as a message from it.
4. **Reply** with one line saying where the Idea went: `→ <Product>`, or `→ <Product>, <Product>` when it went to several. Each Project Manager grills the Human on its own, so their rounds arrive as separate messages, each headed by its product.
