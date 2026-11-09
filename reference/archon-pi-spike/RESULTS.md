# Archon 0.11.1 with the pi provider: what a Project Manager can control per node

Copied into this repo on 2026-10-16. The workflow files it names are in `workflows/` and the guard extension is in `extensions/guard.ts`; a few of them still name the temporary folder the spike ran in. The raw outputs it cites (`*.out`, run logs, session files) stayed in that temporary folder and are not kept. Bead `ge-hl3` is in the Beads of the earlier Factory repo, `~/Developer/graph_engineering`.

Spike for bead ge-hl3, run 2026-10-16 in a scratch repo outside the Factory code
(`archon-pi-spike/repo`, with a local bare remote at `archon-pi-spike/remote.git`).
Stack: pi 1.0.1, the `archon` on PATH (a wrapper, `~/.local/bin/archon`, that sets
`ARCHON_HOME=~/.local/share/archon-pi/archon-home` and default assistant pi). Models:
`opencode-go/qwen3.8-flash` and `opencode-go/deepseek-v4-flash`, plus
`claude-bridge/claude-haiku-4-5` for one check.

Evidence comes from three places: the CLI output (`archon-pi-spike/w1.out` to `w7.out`),
the run transcripts under `~/.local/share/archon-pi/archon-home/workspaces/archon-pi-spike/remote/logs/` (deleted on 2026-10-19 with the spike's Archon workspaces; the findings below stand on their own),
and the pi session files each AI node writes to
`~/.pi/agent/sessions/--private-tmp-claude-501--…-archon-pi-spike-repo--/`.

## Results

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | Basic `prompt` node on pi | Honored | w1: `[model-a] Completed (1.5s)` with output `ALPHA-OK`. A whole six-node run took 6 s wall time. |
| 2 | Per-node `model` | Honored | pi session files: node model-a `opencode-go/qwen3.8-flash`, node model-b `opencode-go/deepseek-v4-flash`; replies carry the same `model` field. |
| 3 | Per-node `effort` | Honored, maps to pi's thinking level | Session files: `effort: low` gave thinking `low`, `effort: high` gave `high`. A node with no `effort` gets pi's global default (`max` on deepseek, `high` on qwen). |
| 4 | Per-node `systemPrompt` | Honored | Codeword only in `systemPrompt` came back: `ZEBRA-PLUM-41`. Whether it replaces or adds to pi's own prompt was not determined. |
| 5 | `allowed_tools` / `denied_tools` | Honored for pi's built-in tools, both name styles. **Not applied to extension tools.** | w2: denying `[write, edit, bash]` and denying `[Write, Edit, Bash]` both left `read, grep, find, ls` and no file was written; `allowed_tools: [read]` left only `read`. But `kb_search`, `kb_insert`, `kb_sync` (from `~/.pi/agent/extensions/kb-tools.ts`) stayed in every node, even with `allowed_tools: []`. |
| 6 | Per-node `skills` | Honored, from `.agents/skills/` and `.claude/skills/` in the repo | Both nodes went straight to the right skill file on their first tool call; `CEDAR-LAMP-12` came back. The other node's reply was cut to "M" by the cheap model after reading `MANGO-RIVER-77`. |
| 7 | `hooks` and `mcp` | Ignored on pi, with a warning. **Confirmed in round two from Archon's source** (pi capabilities `mcp:!1,hooks:!1`). Working replacements: a pi extension for hooks, and pi run from a bash node for MCP; see Round two. | `archon validate` and the run both print "Hooks are not supported by provider 'pi'" and the same for MCP. The hook-denied bash command ran and wrote `out/h1.txt`. |
| 8 | `maxBudgetUsd`, `retry`, `idle_timeout` | Budget ignored with a warning (round two: source has pi `costControl:!1`); retry and idle timeout honored. Round two: `timeout` on an AI node is silently ignored. | w2: "uses maxBudgetUsd but pi doesn't support it". w3: `idle_timeout: 50` fired (`dag_node_idle_timeout_reached`), `retry: {max_attempts: 2}` gave 3 attempts in all, then the node failed and the rest of the run continued. `retry.delay_ms` must be 1000 to 60000. |
| 9 | `loop` with `until_bash`; `loop_group` | Honored | w3: loop stopped after 3 iterations when `until_bash` saw 3 lines in `n.txt`; loop_group (bash plus AI judge) stopped at `SHIP` after 2 iterations (`g.txt` has 2 lines). Prose `until:` is deprecated in favour of `until_bash` or `until_field`. |
| 10 | `output_format` plus `when:` routing | Honored | w3: classify returned `{"kind":"bug","confidence":0.95}`; `on-bug` ran (`ROUTED-BUG`), `[on-feature] Skipped (condition …)`. For pi this is best-effort parsing with up to 3 re-asks, validated against the schema. |
| 11 | Parallel nodes | Honored | w1: all six independent nodes logged `Started` before any finished. |
| 12 | `approval` answered from the shell | Honored | w4: the run paused and its process exited (`Workflow paused — waiting for approval`); `archon workflow reject <id> --reason …` ran the rework (transcript: `REVISED: Update the subtract function to accept arguments a, b, and c…`) and paused again; `archon workflow approve <id> --comment PM-SAYS-GO` resumed it and the next node printed `GATE-ANSWER=PM-SAYS-GO`. `on_reject` is deprecated in favour of `approval.decisions` answered with `archon workflow respond <id> <decision>`. After a reject, the gate message still shows the original plan. |
| 13 | Worktree isolation and push | Honored | w5 with `--branch spike-wt`: the run worked in `archon-home/workspaces/archon-pi-spike/remote/worktrees/spike-wt`, the AI edit and the bash commit landed there, `git push origin HEAD` put commit `9adfe34` on `spike-wt` in the bare remote, and the live checkout was untouched. |
| 14 | `archon workflow test` dry run | Honored, 0.45 s, no provider call | `w6pack/fixtures/bug.stubs.yaml` maps node id to stubbed output (`classify: {kind: bug}`, `on-bug: ROUTED-BUG`). The test follows `when:` routing and reports missing and unused stubs: a fixture that stubbed the wrong branch failed with `missingStubs: ['on-bug']`. A `fixtures/` folder applies to every workflow in its folder, so each tested workflow needs its own folder. |
| 15 | pi extensions inside nodes | Load. Extension models work; extension tools and skills leak in. **Round two:** a clean `PI_CODING_AGENT_DIR` removes the leak; extensions that call `pi.*` inside handlers break with a stale-ctx error. | w7: a node on `claude-bridge/claude-haiku-4-5` replied `BRIDGE-OK` (session file: provider `claude-bridge`, model `claude-haiku-4-5`). A node with no tool limits had `read, bash, edit, write, kb_search, kb_insert, kb_sync`. The `plain-voice` skill appeared in node context. The archon-home config has `enableExtensions: true`. |
| 16 | Shell node variables and outside commands | Honored | w1 `vars`: `ARGUMENTS=[BEAD-123 extra args]`, `WORKFLOW_ID=[df5a0109-…]`, `ARTIFACTS_DIR=[…/artifacts/runs/df5a0109-…]`, `BASE_BRANCH=[main]`, and `herdr` was on PATH, so a final node can message a Project Manager's pane. |

## Workflow files used

All under `archon-pi-spike/repo/.archon/workflows/`:
`w1-basics.yaml`, `w2-tools.yaml`, `w3-flow.yaml`, `w4-approval.yaml`, `w5-worktree.yaml`,
`w6pack/w6-dryrun.yaml` with `w6pack/fixtures/bug.stubs.yaml`, `w7-extensions.yaml`.
Scratch skills: `repo/.agents/skills/spike-codeword/`, `repo/.claude/skills/spike-claudedir/`.

## Surprises

1. **A hidden extra model call on every run.** Archon titles each run with its default model, `opencode-go/muse-spark-1.3-contributor` at thinking `xhigh` (session file: user text "Generate a concise conversation t…"). The default lives in `~/.local/share/archon-pi/archon-home/config.yaml`, not in `~/.archon/config.yaml`.
2. **A node with no `effort` runs at pi's global default thinking level**, which is `max` here. Every workflow should set `effort` on every AI node.
3. **Your whole pi setup leaks into nodes:** extension tools (Heimdall `kb_insert`, which `AGENTS.md` forbids) and package skills (`plain-voice`), and tool limits do not cover extension tools.
4. **Every node writes an ordinary pi session** into `~/.pi/agent/sessions/`, under a folder named after the run's working directory. Session capture into memory will see Workflow nodes as sessions.
5. **The tool's own docs are behind the CLI:** prose `until:` and `approval.on_reject` both give deprecation warnings.
6. **Archon's Claude provider is not set up** (`archon doctor`: "Claude Code not found"). Claude models still work through `claude-bridge` in a pi node.
7. **The CLI prints shell-node output only for the last layer.** Earlier shell outputs are in the transcript and `$ARTIFACTS_DIR`.

## Verdict

**Yes, a Project Manager gets enough control through the pi provider.** Per node it can set:
- the model, including Claude through `claude-bridge`, and the thinking level;
- the system prompt and the skills;
- pi's built-in tools, both allowed and denied;
- retries and idle timeouts;
- structured output with branching, loops with a shell exit check, parallel fan-out, approval pauses it answers itself, and a worktree per run that it can push from.

`archon workflow test` checks a workflow's shape in under a second without a model call, so it can sit inside a jevflow check.

**What is missing, and the workaround for each:**
- **Per-node hooks: none on pi.** Put safety checks in a pi extension instead (dcg, or a small guard extension), which loads in every node. For a node that must have hooks, use Archon's Claude provider (needs `claudeBinaryPath` set in the archon-home config).
- **Per-node MCP: none on pi.** Use a shell node, or a pi extension that provides the tool.
- **Budget caps: none on pi.** Keep caps outside Archon, or rely on `idle_timeout` plus `max_iterations`.
- **Extension tools ignore tool limits, and your personal extensions load in every node.**
  - Option 1: give Factory nodes a clean pi setup. Set `enableExtensions: false` in the Factory's Archon config and add back only what is wanted.
  - Option 2: give runs their own `PI_CODING_AGENT_DIR`.
  - This needs a follow-up test, because turning extensions off would also drop `claude-bridge`.
- **Hidden title call:** point the Factory's Archon default model at a cheap model.

## Round two (2026-10-16): rechecks and alternatives

Run in the same scratch repo. Most round-two runs used a clean pi agent directory,
`archon-pi-spike/agent-clean` (`PI_CODING_AGENT_DIR`). It held only the `opencode-go` entries
of `auth.json` and `models.json`, an empty `settings.json`, and a `trust.json` that trusts the
scratch repo. The copied `auth.json` was deleted afterwards. Workflows: `r2-alternatives.yaml`,
`r2-clean.yaml`, `r2-workarounds.yaml`, `r2-realpi.yaml`. Test helpers: the MCP server
`archon-pi-spike/tools/mcp_codeword.py`, the project MCP config `repo/.pi/mcp.json`, and the guard
extension `repo/.pi/extensions/guard.ts`, which logs to `archon-pi-spike/guard.log`. Source evidence
comes from `strings` of the Archon binary (`archon-pi-spike/archon-strings.txt`).

| Item | Verdict | Evidence |
|---|---|---|
| A. `hooks`, `mcp`, `maxBudgetUsd` on pi | **Confirmed ignored** (round one was right) | The pi provider's capability object in Archon's bundle reads `_he={…mcp:!1,hooks:!1,skills:!0,agents:!1,toolRestrictions:!0,…costControl:!1,…effortControl:!0}`. The validator emits "Hooks are not supported by provider" or "MCP servers are not supported by provider" when the capability is false. |
| A2. How Archon starts pi | Built-in skills off, context files on, agent dir from env | `createPiResourceLoader` is `new RI({cwd, agentDir: bs(), noExtensions: t.enableExtensions!==!0, noSkills:!0, noPromptTemplates:!0, noThemes:!0, systemPrompt?, additionalSkillPaths?})`. `bs()` returns `$PI_CODING_AGENT_DIR` or `~/.pi/agent`. `noContextFiles` is never set. |
| A3. Per-node pi options | **New: a node-level `pi:` field exists** | Each node passes `pi:e.pi`. `Pkt` merges `enableExtensions`, `interactive` and `extensionFlags` from the assistant config, then `assistants.pi.nodes.<nodeId>`, then the node's `pi:` block. |
| B1. MCP through Archon's pi provider | **Does not work** | With the project trusted and `.pi/mcp.json` present, the node's tools were only `read, bash, edit, write` (`r2c.out`, `CODE=NONE`). Archon's bundled pi has no `registerMcpServer` and no `codemode` strings, so it is older than pi's built-in MCP. |
| B1b. MCP through installed pi in a bash node | **Works** | Bash node `b3-real-pi-mcp` ran `pi -p … < /dev/null` (pi 1.0.1) and returned the server's codeword `OTTER-KELP-93` in 4.3 s. Without `< /dev/null`, `pi -p` hung until the node's 120 s timeout. MCP config per node: choose it with the bash node's working folder or its `PI_CODING_AGENT_DIR` (one agent dir per role). There is no per-node MCP field. |
| B2. Hook as a pi extension | **Works, scoped per node** | A trusted project extension (`repo/.pi/extensions/guard.ts`) blocked `echo GUARDTEST` in node `g6` ("spike guard blocked") and let it through in node `g7`, whose `systemPrompt` carried the marker `SPIKE-GUARD-OFF`. The handler read the marker with `ctx.getSystemPrompt()`. Other commands passed. |
| B2b. Stale-ctx trap | **Extensions must not call `pi.*` inside handlers** | Archon caches one reloaded extension loader and shares it between nodes. Calling `pi.getFlag()` inside a `tool_call` handler threw "This extension ctx is stale after session replacement or reload" (`guard.log`). pi's fail-safe then blocks the tool. In round two, run with the full personal setup, every bash call after the first failed this way (`r2a.out`), so at least one personal extension does it. Use the handler's `ctx` instead, which stayed fresh. This also rules out per-node `extensionFlags` read through `pi.getFlag()`. |
| B3. Runaway limits | Per AI node: `idle_timeout` (round one), `retry`, loop `max_iterations`. `timeout` works on bash and script nodes only. | `t2-ai-timeout` had `timeout: 8000`, ran `sleep 40` and completed after 43.7 s, with no validator warning. The pi CLI has no turn, token or cost cap (`pi --help`), and the pi provider has `costControl:!1`. |
| B4a. Turning extensions off | Works, per node or per workflow | A node with `pi: {enableExtensions: false}` had only built-in tools, and bash worked repeatedly (`x1`, `g5`). It also drops trusted project extensions (the guard did not fire in `g5`). |
| B4b. Clean `PI_CODING_AGENT_DIR` | **Works: this is the clean setup** | Tools were `read, bash, edit, write` only, with no `kb_*` tools and no `plain-voice`. Skills: none. Sessions were written to `agent-clean/sessions/`; nothing new went to `~/.pi/agent/sessions` (still 39 files there, all from round one and the first round-two run). Trusted project extensions still load. |
| B4c. Context files | **Always load in Archon's pi nodes** | `AGENTS.md` codewords from the agent dir (`HERON-SLATE-58`) and from the repo's parent folder (`BIRCH-COMET-27`) both reached the node (`c1-inventory`). For Factory repos under the home folder, `~/AGENTS.md` and `~/Developer/AGENTS.md` would load into every node. The only switch is installed pi's `--no-context-files` in a bash node (`b4`: `CODEWORDS=NONE`, `TOOLS=read`). |
| B5. Title call | Model from the `TITLE_GENERATION_MODEL` env var, else the assistant's default model. Thinking from the agent dir's pi settings. | Source: `a4()` uses `process.env.TITLE_GENERATION_MODEL` or the default, with `allowed_tools: []`. With the clean agent dir (empty settings), the title session ran `muse-spark-1.3-contributor` at `medium`, against `xhigh` under `~/.pi/agent`. Per repo: set `assistants.pi.model` in the repo's `.archon/config.yaml`, or export `TITLE_GENERATION_MODEL` for the run. `defaultThinkingLevel` in the Factory agent dir's `settings.json` also sets the thinking of any node without `effort`. |

### Clean setup recipe for Factory runs

1. One pi agent directory per Factory role, for example `~/.factory/pi-agent/`:
   - `auth.json` and `models.json` holding only the providers the role uses;
   - `settings.json` with `defaultThinkingLevel: "low"` and no packages;
   - an `AGENTS.md` only if every node should see it;
   - a `trust.json` naming the work folders.
   Run `archon` with `PI_CODING_AGENT_DIR` set to it. Node sessions then land in that directory's `sessions/`, so Factory sessions are kept apart from the personal ones.
2. Safety and guard checks go in a trusted project extension (`.pi/extensions/`) or a package listed in that agent dir. The extension uses the handler's `ctx`, never `pi.*` inside handlers. A node opts out with a marker in its `systemPrompt`.
3. For MCP, `--no-context-files`, or any pi 1.x feature that Archon's bundled pi lacks, use a bash node: `PI_CODING_AGENT_DIR=… pi -p --no-session --model … --thinking … [--tools …] [--no-context-files] "…" < /dev/null`. Give it a `timeout`.
4. Set `effort` on every AI node, or rely on `defaultThinkingLevel`. Set the title model with `TITLE_GENERATION_MODEL`.

### Still not working

- MCP inside Archon's own pi nodes (the bundled pi has no MCP support).
- Turning off `AGENTS.md` loading in Archon's own pi nodes.
- Cost or token caps, and a total time limit on AI nodes.
- Per-node `extensionFlags` read through `pi.getFlag()` (stale ctx).

## Round three (2026-10-17): Archon 0.12.1 with pi 1.3.0

Run for Bead fac-60v.12 in a fresh scratch repo built the same way as rounds one and two (a repo with a local bare remote, the two scratch skills, the guard extension, a small stdio MCP server that returns `OTTER-KELP-93`, and a clean agent directory holding only the `opencode-go` credential and models). Stack: Archon 0.12.1 (release asset `archon-darwin-arm64`, checksum checked) with the pi provider from `archon provider add pi`; Archon's `bun.lock` at v0.12.1 resolves `@earendil-works/pi-coding-agent` and `pi-ai` to 1.3.0. Installed `pi` 1.3.0. Models `opencode-go/qwen3.8-flash` and `opencode-go/deepseek-v4.1-flash` (pi 1.3 lists `deepseek-v4-flash` under that new name). The workflows are the round-one and round-two files with paths and the model name changed, plus `e1-effort.yaml`, `e2-effort.yaml` and `w8-attention.yaml`, all in `workflows/`. Two changes were needed to run them: `w2`'s `mcp:` became `{path: …, optional: true}`, and the repo got `.archon/config.yaml` with `worktree: {baseBranch: main}`.

| Item | Same or changed on 0.12.1 | Evidence |
|---|---|---|
| 1, 2, 11. Prompt node, per-node model, parallel nodes | Same | w1: `ALPHA-OK`, `BETA-OK`; all five AI nodes started before any finished; nodes ran on `qwen3.8-flash` and `deepseek-v4.1-flash` as written. |
| 3. Per-node `effort` | **Changed in detail**: honored, but pi 1.3 clamps it per model | Node-to-session mapping from `archon workflow get --verbose` (0.12 records each node's pi session id). `qwen3.8-flash`: `low` ran `low`; `max` and unset ran `high`. `deepseek-v4.1-flash`: `max` and unset ran `max` (about 3,800 reasoning tokens), `low` ran `high` (1,804). Plain `pi -p --thinking low` on `deepseek-v4.1-flash` also records `high`, so pi does this, not Archon. |
| 4. Per-node `systemPrompt` | Same, and now settled: it replaces pi's opening section | The session's system message has `sections.preamble` = the node's `systemPrompt` and keeps `project_context`. One run's model refused to reveal the codeword as a "prompt injection"; the rerun returned `ZEBRA-PLUM-41`. |
| 5. `allowed_tools` / `denied_tools` | Same | w2: both deny styles left `read, grep, find, ls` plus the personal `kb_*` tools; `allowed_tools: [read]` left `read` plus `kb_*`; `allowed_tools: []` left only `kb_*`. Only `out/t0.txt` (the control) was written. |
| 6. Per-node `skills` | Same | `CEDAR-LAMP-12` from `.agents/skills`, `MANGO-RIVER-77` from `.claude/skills`. |
| 7. `hooks`, `mcp` | Hooks same (ignored, warning; `out/h1.txt` written). **MCP changed**: a plain `mcp:` field now fails validation ("the run would fail before any node starts"); `mcp: {path, optional: true}` runs without it. | `archon validate workflows`; w2 output "runs without its optional MCP servers". |
| 8. `maxBudgetUsd`, `retry`, `idle_timeout`, AI-node `timeout` | Same | Budget warning; `idle_timeout: 50` fired on all 3 attempts and the rest of w3 ran; r2r `t2-ai-timeout` with `timeout: 8000` ran 46.2 s with no warning. |
| 9, 10. Loops, loop groups, structured output with `when:` | Same | Loop stopped after 3 iterations, group after 2 (`SHIP`); classify gave `{"kind":"bug","confidence":0.99}`, `on-bug` ran, `on-feature` skipped. Prose `until:` still deprecated. |
| 12. Approval answered from the shell | Same, but the form is deprecated | w4: pause, `reject --reason` ran the rework and paused again (message still shows the first plan), `approve --comment PM-SAYS-GO` gave `GATE-ANSWER=PM-SAYS-GO`. Validation: `approval.on_reject`, `capture_response` and workflow-level `interactive:` are deprecated. New form, w8: `wait: {attention: …, form: approval}`; `archon workflow attention --json` lists it with its form and message; `archon workflow approve <run> --comment PM-SAYS-GO` gave `DECISION=approve TEXT=PM-SAYS-GO`. |
| 13. Worktree and push | Same, once the base branch is set | w5 with `--branch spike-wt` first failed: "No base branch could be detected. Set `worktree.baseBranch`". With it set: commit `2e6351b` on `spike-wt` in the bare remote, main checkout untouched. |
| 14. `archon workflow test` | **Changed**: fixture still passes in 0.41 s, but the command exits 1 | "1 passed, 0 failed", then "16 workflow(s) failed to load" from the shared Archon home's global `workflows/` folder: old `archon-*` workflows whose commands 0.12 no longer ships, or that use the uninstalled `claude` provider. |
| 15. Extensions in nodes | Same | w7: `claude-bridge/claude-haiku-4-5` answered `BRIDGE-OK` (the session starts on the default model, then switches); a node with no limits had `kb_search, kb_insert, kb_sync, read, bash, edit, write`; `plain-voice` listed as a skill. |
| 16. Shell-node variables | Same, once the base branch is set | w1 `vars` first failed: "No base branch could be resolved" (with `--no-worktree`); with it set, `join` printed every upstream output. |
| B1. MCP through Archon's pi nodes | Same: **does not work**, even on pi 1.3.0 | r2a `m2` (personal setup) and r2c `m3` (clean agent dir, trusted repo, `.pi/mcp.json`) both `CODE=NONE`. |
| B1b. MCP through installed pi in a shell node | Same | r2r `b3`: `OTTER-KELP-93`. r2w `b1`, `b2` (no `< /dev/null`) hung until their 120 s timeouts. |
| B2. Guard extension per node | Same | g1, g3, g6 blocked ("spike guard blocked") with the next call working; g7 (`SPIKE-GUARD-OFF` in `systemPrompt`) ran. |
| B4a. `pi: {enableExtensions: false}` | Same | x1 and g5: only built-in tools; the guard did not fire (`out/x1.txt`, `out/g5.txt` written). |
| B4b. Clean `PI_CODING_AGENT_DIR` | Same | c1: `TOOLS=read, bash, edit, write`, `SKILLS=NONE`; 9 sessions written under the clean dir's `sessions/`. |
| B4c. Context files | Same | c1: `CODEWORDS=HERON-SLATE-58, BIRCH-COMET-27` (agent dir and parent folder `AGENTS.md`); r2r `b4` with installed pi `--no-context-files --no-extensions --tools read`: `TOOLS=read CODEWORDS=NONE`. |
| B5. Hidden title call | **Changed**: not seen | None of the 51 node sessions (42 personal, 9 clean) was a title call. |

### New on 0.12.1

- Providers are separate installs: `archon provider add pi` after every Archon upgrade; `archon doctor` checks it.
- Pauses are attention waits, listed by `archon workflow attention --json` and answered with `approve`, `reject`, `respond` or `answer`.
- Shell nodes get quoting warnings: assign `$node.output` to a variable first, then quote the variable.
- `archon doctor` asks for an `archon-cli` skill in the project's `.agents/skills` (`archon skill add .`).
