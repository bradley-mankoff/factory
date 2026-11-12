# Module design for a Run

Read this when the change adds a module, changes an interface or moves a seam. The spec review reads it for its vocabulary only, never as a standard to enforce.

## The words

Use these words for the design of the change and the project's `GLOSSARY.md` for the names of its domain; where the two meet, the project's word wins. Never use "component", "service" or "API" for a module, and keep "boundary" for the outside world: a seam is where one module's interface lives, not the edge of the system.

- **Module**: one unit with an interface and an implementation, whether a function, a type, a file or a group of files.
- **Interface**: everything a caller must know to use the module: its signature, and its invariants, ordering constraints, error modes, required configuration and performance. The signature alone is not the interface.
- **Seam**: the place a module's interface is called and tested. Callers and tests cross the same seam.
- **Dependency**: anything the module reaches for outside itself: another module, a database, a network service, the file system or the clock.
- **Port**: the interface through which a module takes one dependency, so the implementation behind it can be swapped.
- **Adapter**: one implementation of a port, either the real one or a stand-in a test passes.
- **Deep**: a lot of behaviour behind a small interface. **Shallow**: an interface nearly as complex as its implementation.

## Depth

Depth is leverage, not a ratio of lines: a deep module earns its keep by hiding decisions from its callers, and padding its implementation to look deep only makes it longer.

Ask three questions of each interface the change touches. Can it have fewer methods? Can it take simpler parameters? Can it hide more of what it does? A yes to any of them is a smaller interface with the same behaviour, which is a deeper module.

The deletion test is the other half: imagine deleting the module. If the complexity vanishes with it, it was a pass-through. If the complexity reappears across its callers, it was earning its keep.

## Design it so a test can reach it

Callers and tests cross the same seam, so shape the module for both:

- Take the dependency as a parameter. A module that builds its own database connection, clock or client can be tested only by reaching inside it; one that takes the dependency lets the test pass a stand-in.
- Return the result. A module that returns what it produced lets the test read it; one that only writes somewhere forces the test to watch a side effect it cannot see.
- Keep the surface small. One call that does the job beats three calls the test must make in order, and every parameter is one more thing each test supplies.

## Where a dependency sits

A dependency's category decides how a test stands in for it, never whether the module grows a seam the Spec did not name:

- **In-process**: plain computation or another module in the same process. Use it as it is, or return the result it gave.
- **Local-substitutable**: a database, a file system or another service the project can run locally. Use whatever local stand-in the project already has, such as a test database or an in-memory file system, and invent none.
- **Remote but owned**: a service the project's own code runs on both ends, such as its own API and client. Test against the port with a stand-in adapter at the edge, unless the project already has a local one.
- **True external**: someone else's service. Fake it at the edge, through the port the module calls.

## When a seam moves

When a Bead deepens, merges, moves or replaces a module, replace the tests at its seam in the same commit as the new seam test. Delete the old tests only where the new test covers what they covered; where the deletion would reach files the Bead does not touch, leave it for its own Bead.

## What the interface must say

Implement the interface the Spec decided. State its invariants, ordering constraints and error modes where the project states such things: a doc comment, a type, a test. When the Spec left a fact open, report it in the commit message rather than inventing it silently.

## Composition inside a module

A deep module may be built from small parts private to its implementation: internal composition is not a speculative seam, and the standards review must not treat it as one.

## The four judgements

The standards review names these when it judges a module the diff adds, changes or reshapes:

- **Shallow module**: its interface is nearly as complex as its implementation. Deepen it or merge it into its caller.
- **Interface grown to match its implementation**: the signature lists what the code happens to need instead of what a caller knows. Shrink it to the caller's view.
- **Pass-through**: a module or function that only passes calls on. Delete it or give it behaviour of its own.
- **Indirection with one adapter**: a seam or wrapper with one implementation and no second one beyond the test's. Remove it.
