---
name: codebase-design
description: The design words for a module's interface and where its seam goes, such as depth, the deletion test, and one adapter is no seam. Use when sketching the seams for a Spec, designing a module, or deciding what an interface must say.
license: MIT. Adapted from Matt Pocock's codebase-design skill, copyright 2026 Matt Pocock; full text in LICENSE.txt beside this file.
---

Use these words for the design of code, and the project's `GLOSSARY.md` for the names of its domain; where the two meet, the project's word wins. Never use "component", "service" or "API" for a module, and keep "boundary" for the outside world.

- **Module**: one unit with an interface and an implementation, whether a function, a type, a file or a group of files.
- **Interface**: everything a caller must know to use the module: its signature, and its invariants, ordering constraints, error modes, required configuration and performance. The signature alone is not the interface.
- **Seam**: the place a module's interface is called and tested. Callers and tests cross the same seam.
- **Depth**: a lot of behaviour behind a small interface. Ask whether the interface can have fewer methods, take simpler parameters, or hide more of what it does; a yes to any of them is a deeper module with the same behaviour.
- **Deletion test**: imagine deleting the module. If the complexity vanishes with it, it was a pass-through; if the complexity reappears across its callers, it was earning its keep.
- **One adapter is no seam**: a seam or wrapper with one implementation and no second one beyond the test's is an indirection to remove, not a place to build on.

A Project Manager sketches the seams when writing a Spec with the `to-spec` skill, preferring existing seams and the highest one. A session designing a module uses the same words for its interface and its seam, and takes the dependency as a parameter and returns the result, so a test crosses the seam like any caller.

Read `~/.local/share/factory/prompts/guides/module-design.md` when the change adds a module, changes an interface or moves a seam: it holds the full design words, how a dependency's category chooses the stand-in, and the four judgements the standards review names.
