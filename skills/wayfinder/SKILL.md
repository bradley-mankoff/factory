---
name: wayfinder
description: Chart the way from an Idea too big for one Spec to the Specs that will carry it, as a Map in Beads (an Epic whose child Beads each settle one question), and settle those questions one at a time until the way is clear. Use when grilling shows an Idea is too big for one Spec or one session and the way to its Specs is not yet clear, when facing a huge, foggy effort such as a greenfield project, or when asked to work through a Map.
license: MIT. Adapted from Matt Pocock's wayfinder skill, copyright 2026 Matt Pocock; full text in LICENSE.txt beside this file.
---

An Idea has arrived that is too big for one Spec, and the way from here to its Specs is not yet visible. Wayfinding finds that way instead of charging at the Specs. Chart the way as a **Map** in Beads, then settles the Map's questions one at a time until nothing is left to decide before the Specs can be written.

The Human is the person who owns the project. An Idea is a few plain sentences from the Human; a Spec is its written version, stored as the description of an Epic, a parent Bead in the project's Beads (`bd`). In the Factory, a Project Manager leads each project and reaches an absent Human through FactoryClaw. For the project's own words, use its `GLOSSARY.md`.

**When to use it.** Plain grilling, then `to-spec`, is the default. Use wayfinder only when grilling shows that the Idea needs more than one Spec, or more than one session to settle, and that the way to those Specs is still unclear. If charting finds no unclear ground (step 2 below), there is no Map: go back to grilling and one Spec.

## Plan, do not build

Each map Bead settles a decision; it does not deliver part of the Idea. The Map is done when nothing is left to decide before the Specs are written. The pull to start building is the sign you have reached the edge of the Map. Map Beads are never built.

## Refer by name

In everything the Human reads (rounds, messages, the Map's Decisions so far), name a Bead by its title, with its id after it in brackets, never by the id alone.

## The Map

The Map is one Epic labelled `wayfinder:map`. It is an index, not a store: it lists the decisions made and points at the map Beads that hold their detail, so a decision lives in exactly one place. Its open map Beads are not listed; they are found with `bd ready`. Its description:

```markdown
## Destination

The Specs this Map finds its way to: one line for each Spec you can foresee, saying what it covers.

## Notes

The project's domain, the skills every session should load, and the Human's standing preferences for this Idea.

## Decisions so far

- <title of a closed map Bead> (<id>): <one-line gist of the answer>

## Not yet specified

Questions you can tell are coming but cannot yet state precisely.

## Out of scope

- <gist> (<id of the closed map Bead, if any>): why it lies beyond the Destination.
```

Create it with `bd create --type=epic --labels=wayfinder:map --title="<the Idea in a few words>" --stdin`, the description in a quoted heredoc. Change it with `bd update <map id> --stdin`, passing the whole new description.

## Map Beads

Each map Bead is a child of the Map, of type `spike` so a build loop (`bd ready --exclude-type=spike,epic`) leaves it out, with one label saying how it is settled. Its description is the question alone, sized to one session:

```markdown
## Question

The decision or fact this Bead settles.
```

Create it with `bd create --silent --type=spike --parent=<map id> --labels=wayfinder:<kind> --title="<the question in a few words>" --stdin`, the question in a quoted heredoc. Add blocking edges with `bd dep add <blocked id> <blocker id>` in a second pass, once every map Bead has an id. A map Bead can start when every Bead blocking it is closed; the frontier is `bd ready --parent=<map id> --type=spike`.

The four kinds:

- **`wayfinder:grilling`**: a conversation with the Human, using the `grilling` skill. The default. Only the Human answers; never answer your own questions.
- **`wayfinder:research`**: a fact from outside your head, such as a library's behaviour or how the Idea fits a large codebase. Read it yourself when the reading is short. When it is long, hand it off: to a sub-agent (in pi, the `subagent` tool with the `scout` agent) when you need the answer before you go on, since it waits; or, to keep going meanwhile, to a research Workflow in the background with `archon workflow run factory-research --detach "<the question>"`, starting the Run as your instructions' step 5 says, `--base` included on a worktree Mac; its Notice arrives in this conversation. Both hand back a short answer and the path of a findings file.
- **`wayfinder:prototype`**: a cheap, rough artifact for the Human to react to (an outline, a stub, rough interface or logic code), made with the `prototype` skill, when how it should look or behave is the key question. Settled with the Human.
- **`wayfinder:task`**: work that must happen before a decision can be made, such as signing up for a service to judge its API. Do it yourself where you can; otherwise give the Human a precise checklist (a Project Manager whose Human is away sends it through FactoryClaw). The answer records what was done and any facts later Beads need.

## Unclear ground and scope

Do not chart what you cannot yet see. A question you can state precisely now becomes a map Bead, even if it is blocked. A question you cannot yet state sharply goes in **Not yet specified**, loosely; one patch may later become several map Beads, or none. When a settled answer makes a patch specific, turn it into map Beads and remove it from that section.

Work beyond the Destination is out of scope, not unclear ground. When a map Bead turns out to lie beyond the Destination, close it (`bd close <id> --reason "Out of scope: …"`) and add one line under **Out of scope**; it does not go under Decisions so far.

## Chart the Map

1. **Name the Destination.** Grill the Human (the `grilling` skill) until the Specs this Map leads to are named. The Destination fixes the scope, so it comes first.
2. **Map the frontier.** Grill again, breadth first: cover the whole Idea rather than going deep on one thread, to find the open decisions and the first steps that can be taken now. If this finds nothing unclear, there is no need for a Map: say so to the Human and continue with grilling and `to-spec`.
3. **Create the Map**, with Destination and Notes filled in, Decisions so far empty, and the unclear ground sketched under Not yet specified.
4. **Create the map Beads** you can state now, then add the blocking edges.
5. **Start the research.** For each `wayfinder:research` Bead that needs long reading, hand it off now.
6. Stop. Charting settles nothing by itself.

## Work through the Map

1. Read the Map (`bd show <map id>`), not every map Bead.
2. Take the map Bead the Human names, or else the first one in `bd ready --parent=<map id> --type=spike`. Claim it with `bd update <id> --claim` before any work.
3. Settle it as its label says. Read any related or closed map Bead in full when you need it, and load the skills the Map's Notes name.
4. Record the answer as a comment (`bd comments add <id> "…"`), close the map Bead, and add its line to the Map's Decisions so far.
5. Create any map Beads the answer has made specific, with their edges. If the answer changes other parts of the Map, update or close those map Beads.

Settle one map Bead at a time; only research runs in parallel. Everything you learn goes into Beads before you take the next one, so a fresh session can carry on from the Map alone.

## When the way is clear

When no open map Beads remain and Not yet specified is empty, write each Spec in the Destination with `to-spec`, which makes one Epic per Spec. Then close the Map with a reason naming those Epics.
