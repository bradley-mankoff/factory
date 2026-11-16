---
name: panes
description: Start and stop the Factory's Project Managers, and list which are running. Use when the Human asks a project to get to work, start, carry on or stop, asks which projects are open, or asks to open or close one, and when another skill needs a project's pane and it is closed.
---

# Starting and stopping Project Managers

I start and stop every Project Manager; nothing else does. A Project Manager runs in a herdr pane in the default server, the one the Human's own terminals and `pm` use, so his panes and mine are the same panes. Each project gets one herdr workspace, labelled with the project's folder name, holding that one pane. Its repo's path and its pane name are in `TOOLS.md`.

A running Project Manager chooses its own work: it takes up what is waiting, then builds the project's ready Beads, several at once when they do not touch the same code, and reads each Run's result as it ends. It does not need me or the Human to pick what comes next. What it needs from me is to be started, told to get to work, and stopped.

I open a pane only when the Human asks, or when an Idea or an answer must reach a project whose pane is closed. I close one only when the Human asks. Nothing reopens a pane the Human closed.

When the Human names several projects ("news and health chat", "everything"), do the same for each of them.

## The herdr server

The server runs as the launchd job `factory.herdr`, started at login, so it is up after a reboot before the Human opens a terminal. If a `herdr` command fails with `server_not_running`, run `launchctl start factory.herdr`, then go on. Never start the server myself: a server I start carries OpenClaw's exec marker into every pane, and OpenClaw then refuses the Project Managers' messages. The Human's own windows and `pm` attach to this same server, which is why the Project Manager he started is one I can see and type into.

## Start

When the Human asks a project to get to work, start, carry on or pick up its work:

1. Look for the project's pane in `herdr agent list`, under `<pane>`: it names every live Project Manager, including one the Human started himself with `pm`, and he may have one running that I did not open. Look every time, before anything else: two Project Managers under one name both receive the project's Notices, and the one the Human is not watching acts out of sight (fac-6l8).
2. If the pane is there, tell that Project Manager to get to work, without `--wait`:

   ```bash
   herdr agent prompt <pane> "FactoryClaw: The Human asks you to get to work."
   ```

   A Project Manager that is already working carries on.
3. If the pane is not there, open it as "Open" below says, giving `project-manager/start` the message `FactoryClaw: The Human asks you to get to work.` on its command line the way Open's step 2 shows. The Project Manager acts on that message at once.
4. Reply with one line: `→ <Product>: getting to work`. The Project Manager messages the Human only when it needs the Human, so a quiet project is a working or an idle one; the Human asks how it is doing with `report-state`.

## Stop

When the Human asks a project to stop, find its workspace id by its label in `herdr workspace list`, then `herdr workspace close <workspace id>`. That ends its Project Manager session. Its work stays in the project's Beads and git. Runs it already started finish on their own; the next Start finds how they ended. Reply with one line: `→ <Product>: stopped`.

## List

`herdr agent list` gives each live Project Manager's `name`, the ones the Human started included. A project whose pane name is in that list is running; every other project is stopped. Reply with the projects by product name, running ones first.

## Open

Opening starts a Project Manager at pi's prompt. Reach Open only from Start's step 3, or when an Idea or an answer must reach a project whose pane Start has just found closed. It reviews its Beads and Runs only when the status check is asked for: `~/.local/share/factory/project-manager/start --status-check` when it starts, `/status-check` in a running session, or `/new-and-status-check`, which starts a new session and runs it there. Start gives its message with the start, so the Project Manager acts at once. An Idea or an answer reaches the pane after it has started.

1. `herdr workspace create --cwd <repo> --label <project> --no-focus`. Read the new pane's id from `.result.root_pane.pane_id` in its JSON.
2. `herdr pane run <pane id> "~/.local/share/factory/project-manager/start"`. This starts the Project Manager at pi's prompt. To start it with a message, as Start does, add the message in single quotes after the command: `~/.local/share/factory/project-manager/start '<the message>'`. To start it with the status check instead, add `--status-check`: `~/.local/share/factory/project-manager/start --status-check`.
3. `herdr pane wait-output <pane id> --match "pm •" --timeout 60000`. It returns once pi's footer shows the Project Manager's model, `pm`, with its Chain's thinking level beside it. The level is whichever entry the Chain started on, so never match on one.
4. `herdr agent rename <pane id> <pane>`, so Runs and I can reach it by name.

If step 3 times out, read the pane with `herdr pane read <pane id> --source visible` and tell the Human, in a line, what it shows.

When the Human asks only to open a project, follow Start instead, so the Project Manager takes up the work rather than sitting idle at pi's prompt; when the Human asks to close one, follow Stop.
