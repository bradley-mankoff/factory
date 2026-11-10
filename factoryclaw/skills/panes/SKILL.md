---
name: panes
description: Start and stop the Factory's Project Managers, and list which are running. Use when the Human asks a project to get to work, start, carry on or stop, asks which projects are open, or asks to open or close one, and when another skill needs a project's pane and it is closed.
---

# Starting and stopping Project Managers

I start and stop every Project Manager; nothing else does. A Project Manager runs in a herdr pane in the session `factory`. Each project gets one herdr workspace, labelled with the project's folder name, holding that one pane. Its repo's path and its pane name are in `TOOLS.md`.

A running Project Manager chooses its own work: it takes up what is waiting, then builds the project's ready Beads, several at once when they do not touch the same code, and reads each Run's result as it ends. It does not need me or the Human to pick what comes next. What it needs from me is to be started, told to get to work, and stopped.

I open a pane only when the Human asks, or when an Idea or an answer must reach a project whose pane is closed. I close one only when the Human asks. Nothing reopens a pane the Human closed.

When the Human names several projects ("news and health chat", "everything"), do the same for each of them.

## The herdr session

The session's server runs as the launchd job `factory.herdr`, started at login. If `herdr --session factory workspace list` fails with `server_not_running`, run `launchctl start factory.herdr`, then go on. Never start the server with `herdr --session factory server` myself: a server I start carries OpenClaw's exec marker into every pane, and OpenClaw then refuses the Project Managers' messages. The Human watches and types into the panes with `herdr session attach factory`.

## Start

When the Human asks a project to get to work, start, carry on or pick up its work:

1. If its pane is closed (`herdr --session factory agent get <pane>` fails), open it as "Open" below says, giving `project-manager/start` the message `FactoryClaw: The Human asks you to get to work.` on its command line the way Open's step 2 shows. The Project Manager acts on that message at once rather than proposing.
2. If its pane is open, tell the Project Manager to get to work, without `--wait`:

   ```bash
   herdr --session factory agent prompt <pane> "FactoryClaw: The Human asks you to get to work."
   ```

   A Project Manager that is already working carries on.
3. Reply with one line: `→ <Product>: getting to work`. The Project Manager messages the Human only when it needs the Human, so a quiet project is a working or an idle one; the Human asks how it is doing with `report-state`.

## Stop

When the Human asks a project to stop, find its workspace id by its label in `herdr --session factory workspace list`, then `herdr --session factory workspace close <workspace id>`. That ends its Project Manager session. Its work stays in the project's Beads and git. Runs it already started finish on their own; the next Start finds how they ended. Reply with one line: `→ <Product>: stopped`.

## List

`herdr --session factory agent list` gives each live Project Manager's `name`. A project whose pane name is in that list is running; every other project is stopped. Reply with the projects by product name, running ones first.

## Open

Opening starts a Project Manager. With no first message it reviews its Beads and Runs, then proposes the next steps and waits for the Human to accept; Start gives its message with the start, so the Project Manager acts at once. An Idea or an answer reaches the pane after it has started.

1. `herdr --session factory workspace create --cwd <repo> --label <project> --no-focus`. Read the new pane's id from `.result.root_pane.pane_id` in its JSON.
2. `herdr --session factory pane run <pane id> "~/.local/share/factory/project-manager/start"`. This starts the Project Manager. To start it with a message, as Start does, add the message in single quotes after the command: `~/.local/share/factory/project-manager/start '<the message>'`. A first message replaces the opening proposal, so the Project Manager acts on it.
3. `herdr --session factory pane wait-output <pane id> --match "pm •" --timeout 60000`. It returns once pi's footer shows the Project Manager's model, `pm`, with its Chain's thinking level beside it. The level is whichever entry the Chain started on, so never match on one.
4. `herdr --session factory agent rename <pane id> <pane>`, so Runs and I can reach it by name.

If step 3 times out, read the pane with `herdr --session factory pane read <pane id> --source visible` and tell the Human, in a line, what it shows.

When the Human asks only to open a project, follow Start instead, so the Project Manager takes up the work rather than waiting for the Human to accept a proposal; when the Human asks to close one, follow Stop.
