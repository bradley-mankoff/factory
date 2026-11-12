---
name: tdd
description: Build test first, through the seam a Bead or Spec names: one failing test, then only the code that passes it, then the next behaviour. Use when building code by hand, when a Bead asks for tests, or when asked for red-green-refactor or test-first work.
license: MIT. Adapted from Matt Pocock's tdd skill, copyright 2026 Matt Pocock; full text in LICENSE.txt beside this file.
---

Build test first: one test, written and seen to fail at the seam, then only the code that makes it pass, then the next behaviour. This skill holds the loop and the rules that must not be missed; the work agent reads the same rules in its prompt, and a session building code by hand reads them here.

A Bead is one unit of work in the project's Beads (`bd`); its Epic is the parent Bead holding the Spec it was cut from. A seam is the place a module's interface is called and tested. A Run is one execution of a Workflow, and the work agent is the agent in its work node. Read the project's `GLOSSARY.md`, if it has one, so test names and interfaces use the project's words, and respect any ADRs in the area you touch.

## The loop

1. Write one test at the seam and run it: it must fail, and fail for the reason the Bead describes.
2. Write only the code that makes it pass. Add nothing the Bead does not ask for.
3. Run the test and the project's check. When they pass, the next behaviour starts.

Refactoring the Bead asks for is part of this loop; refactoring it does not ask for belongs to the review.

## Rules that must not be missed

- Take the seam from the Bead or its Epic's Spec, never from the code's internals. When neither names one, take the highest existing seam, and say in the commit message what it catches and misses.
- Test one thing per test, however many expects that takes, under a name that says what it checks.
- Take the expected value from an independent source: a known-good literal, a worked example or the Bead, never the calculation the code does.
- Mock only at the system's edges: an outside service, time, randomness, sometimes the database or the file system. Never mock a module this repo owns.
- A test that is hard to write means the module is the wrong shape: pass the dependency in or return the result rather than reaching inside it.
- When the Bead moves a seam, replace the tests at it rather than layering new tests over old.

Read `~/.local/share/factory/prompts/work.md` for the full convention: what a good test is, the seams, the commit message it asks for, and the closing account of the Bead's acceptance criteria that ends the work.

Read `~/.local/share/factory/prompts/guides/test-design.md` when a test must reach something that is not plain computation: a database, a network service, the file system, a clock or another module's internals.
