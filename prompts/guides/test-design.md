# Test design for a Run

Read this when a test must reach something that is not plain computation: a database, a network service, the file system, a clock, or another module's internals. The standards review reads it when the diff adds or changes tests, to judge that test as code.

## Shape the code so a test can reach it

Callers and tests cross the same seam, so the three rules that make a module testable also make it a good module:

- Take the dependency as a parameter. A module that builds its own database connection, clock or client can be tested only by reaching inside it; one that takes the dependency lets the test pass a stand-in.
- Return the result. A module that returns what it produced lets the test read it; one that only writes somewhere forces the test to watch a side effect it cannot see.
- Keep the surface small. One call that does the job beats three calls the test must make in order, and every parameter is one more thing each test supplies.

## One function per external operation

Give each external operation its own function: one to charge, one to refund, one to look up, rather than one generic request function that does all three. A generic one forces the test's stand-in to branch on its arguments, and a stand-in with conditional logic is a second implementation of the thing it replaces, with its own bugs.

## Choose the stand-in by the dependency's category

The dependency's category decides how a test stands in for it, never whether the module grows a seam the Spec did not name:

- **In-process**: plain computation or another module in the same process. Use it as it is, or return the result it gave.
- **Local-substitutable**: a database, a file system or another service the project can run locally. Use whatever local stand-in the project already has, such as a test database or an in-memory file system, and invent none.
- **Remote but owned**: a service the project's own code runs on both ends, such as its own API and client. Test against the port with a stand-in adapter at the edge, unless the project already has a local one.
- **True external**: someone else's service. Fake it at the edge, through the port the module calls.

## Judge a test as code

The spec review judged whether the tests reach the seam and would fail without the change; the standards review judges the test as code:

- **One thing checked per test**, however many expects that takes. A test that checks six things fails six ways and says nothing about which broke.
- **A name that says what it checks**, in the project's words, so a failure names the behaviour that broke.
- **An expected value from an independent source**: a known-good literal, a worked example or the Bead, never the same calculation the code does, which can only ever agree with it.
- **No branching in setup**: a test whose setup loops or branches on the case hides which case ran.
- **No fake of something the repo owns**: replace only what the system's edge holds, never a module this repo wrote.
