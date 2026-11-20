/**
 * ding-hold: a Project Manager's pane plays the "needs attention" sound only when the Human
 * is needed (fac-o2r, fac-o2r.1). The sound comes from pi-herdr-ding, which plays it at a
 * herdr pane's settled turn and stays silent for a turn when another extension emits its
 * hold. This extension decides that hold from the Factory's own state, never from the
 * conversation: the pane stays silent while a Run of this project is running and nothing
 * waits on the Human, because the Run's Notice will wake the Project Manager when it ends,
 * and it speaks up when an Ask or a paused Run waits on him, or when no Run is moving, so a
 * Factory that has stopped is his cue to bring the next Idea.
 *
 * The state is three quick script reads, never a model call: `factory asks` for this
 * project's open Asks, which carries a Human gate as well; `archon workflow attention` for
 * this project's paused Runs, which adds the waits `factory asks` does not list; and
 * `archon workflow runs --status running` for whether a Run of it is still moving. A read
 * that cannot answer, because the command is missing, fails, answers with something else or
 * takes too long, plays the sound: a ding too many costs a moment, and a ding missed may
 * leave the Human away from a pane that needs him, so only a complete answer that says
 * "moving, nothing waited" holds it.
 *
 * The hold is emitted at pi's `agent_before_settle`, the last moment before the turn
 * settles: the state read there is the turn's final state, which is the one that matters
 * (a turn that started a Run leaves it running), and the event arrives before
 * pi-herdr-ding reads the hold at settle, whatever order the two extensions loaded in.
 */
import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The event pi-herdr-ding documents for keeping one turn's sound silent. Its payload is a
 * note for anyone reading the call; the package ignores it. */
const HOLD_EVENT = "pi-herdr-ding:hold";

/** How long one read may take. All three run together, so a turn waits at most this long
 * for the check, and a read still running after it counts as a failed check. */
const CHECK_TIMEOUT_MS = 5000;

/**
 * One command's JSON answer, or undefined when it could not give one. The command runs
 * without a shell, in the project's folder, and the answer comes back to a callback rather
 * than being thrown, so a missing command, a failed exit, output that is not JSON and a
 * command that outlives the timeout all take the same path: no answer, and the sound plays.
 */
function readJson(command: string, args: string[], repo: string): Promise<unknown | undefined> {
	return new Promise((resolve) => {
		execFile(
			command,
			args,
			{ cwd: repo, encoding: "utf8", timeout: CHECK_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
			(error, stdout) => {
				if (error) return resolve(undefined);
				try {
					resolve(JSON.parse(stdout));
				} catch {
					resolve(undefined);
				}
			},
		);
	});
}

/**
 * The list a read answered with, or undefined when it answered with something else. A bare
 * array holds the list itself (`factory asks`), and an object holds it under a key (Archon's
 * `items` and `runs`). An empty list is an answer, so it comes back as one.
 */
function listed(answer: unknown, key?: string): unknown[] | undefined {
	if (key === undefined) return Array.isArray(answer) ? answer : undefined;
	if (answer === null || typeof answer !== "object") return undefined;
	const list = (answer as Record<string, unknown>)[key];
	return Array.isArray(list) ? list : undefined;
}

/** The project's open Asks, or undefined when `factory` could not answer. A Human gate is
 * one of them, so this read alone already names a paused Run of that kind. */
async function openAsks(repo: string): Promise<unknown[] | undefined> {
	return listed(await readJson("factory", ["asks", "--project", repo, "--open", "--json"], repo));
}

/** The Runs of this project paused at an attention wait, or undefined when `archon` could
 * not answer. It adds the waits `factory asks` leaves out, a wait for a plain answer among
 * them; every one of them waits on the Human. Archon names the project it answers for by the
 * folder its command runs in, so this one runs in the session's own. */
async function pausedRuns(repo: string): Promise<unknown[] | undefined> {
	return listed(await readJson("archon", ["workflow", "attention", "--json"], repo), "items");
}

/** The Runs of this project still moving, or undefined when `archon` could not answer. It
 * takes its project from the folder it runs in, as the paused Runs' read does. */
async function runningRuns(repo: string): Promise<unknown[] | undefined> {
	return listed(await readJson("archon", ["workflow", "runs", "--status", "running", "--json"], repo), "runs");
}

export default function dingHold(pi: ExtensionAPI): void {
	// pi waits for this handler before the turn settles. The three reads start together, so
	// the turn waits for the slowest of them, and the hold goes in place only when all three
	// answered and say the Human is not needed.
	pi.on("agent_before_settle", async (_event, ctx) => {
		const [asks, paused, moving] = await Promise.all([
			openAsks(ctx.cwd),
			pausedRuns(ctx.cwd),
			runningRuns(ctx.cwd),
		]);
		// A read that could not answer says nothing about whether the Human is needed, so the
		// turn plays rather than being held on a guess. Only undefined is no answer: `listed`
		// gives it for a read that returned no list, while an empty list is an answer.
		if (asks === undefined || paused === undefined || moving === undefined) return;
		if (asks.length > 0 || paused.length > 0) return;
		if (moving.length === 0) return;
		pi.events.emit(HOLD_EVENT, {
			reason: "a Run of this project is running and nothing waits on the Human",
		});
	});
}
