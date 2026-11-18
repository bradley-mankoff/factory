/**
 * blocked-mark: shows a Project Manager's herdr pane as blocked while its project has an
 * open Ask, so herdr, Heeler and archon-bar tell the Human he owes an answer without anyone
 * sending a message (fac-3mz.5, fac-3mz.9, the Epic's Spec fac-3mz).
 *
 * herdr takes a pi pane's state only from its own pi integration, which listens for pi's
 * `herdr:blocked` event. So this extension does not report the pane itself: it emits that
 * event with `active: true` and a label naming the open Ask, and the integration, which
 * keeps a count of the active blocks, reports the pane blocked under its own source and
 * keeps it blocked over working and idle until the count returns to zero (fac-3mz.9). The
 * mark therefore stays while the Project Manager works on an unrelated turn, which is
 * right: the Human still owes the answer.
 *
 * Blocked always means the Human owes an answer, so only an open Ask marks the pane: the
 * check asks `factory asks` for the open ones, and an answered Ask is left out by the
 * command itself. With no open Ask left the extension emits `active: false`, and it checks
 * at a turn's start as well as its end, so the Notice that carries the Human's answer
 * clears the mark at once.
 */
import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The parts of an Ask the pane's label needs, as `factory asks --json` lists them. */
type Ask = { bead: string; kind: string; question: string };

/**
 * The project's open Asks, or undefined when `factory` could not answer. A `factory` that
 * fails, is missing or answers with something other than the Asks list leaves the mark
 * alone, so a turn ends as it did before and a standing mark is never cleared on a guess.
 *
 * The command runs without a shell and its answer comes back to a callback, never by
 * waiting on it, so pi's own turn is not held up for the length of the call.
 */
function openAsks(repo: string): Promise<Ask[] | undefined> {
	return new Promise((resolve) => {
		execFile(
			"factory",
			["asks", "--project", repo, "--open", "--json"],
			{ encoding: "utf8" },
			(error, stdout) => {
				if (error) return resolve(undefined);
				try {
					const asks: unknown = JSON.parse(stdout);
					resolve(Array.isArray(asks) ? (asks as Ask[]) : undefined);
				} catch {
					resolve(undefined);
				}
			},
		);
	});
}

/** What the Human owes, in herdr's words for the pane: the Ask's Bead, its kind and its
 * question. With several open, the first listed is the one named, as a gate comes first. */
const askLabel = (ask: Ask): string => `${ask.bead} ${ask.kind}: ${ask.question}`;

export default function blockedMark(pi: ExtensionAPI): void {
	// A session outside herdr has no pane to mark, and herdr's integration is not loaded.
	if (!process.env.HERDR_PANE_ID) return;

	/** Whether the extension has told herdr's integration the pane is blocked, so the
	 * integration's count is raised once and lowered once. */
	let marked = false;
	/** The number of the newest check, so an answer overtaken by a later one is dropped. */
	let newestCheck = 0;

	async function check(repo: string): Promise<void> {
		const thisCheck = ++newestCheck;
		const asks = await openAsks(repo);
		// A later check has begun: its read is the later truth about the project, so this
		// one's answer, which may already be stale, must not move the mark.
		if (thisCheck !== newestCheck) return;
		if (asks === undefined) return;
		if (asks.length > 0) {
			if (marked) return;
			marked = true;
			pi.events.emit("herdr:blocked", { active: true, label: askLabel(asks[0]) });
		} else if (marked) {
			marked = false;
			pi.events.emit("herdr:blocked", { active: false });
		}
	}

	// Both handlers start the check and return at once: pi waits for every handler before a
	// turn starts or ends, so awaiting the command here would hold up the turn and pi's own
	// reports to herdr.
	pi.on("agent_start", (_event, ctx) => {
		void check(ctx.cwd);
	});
	pi.on("agent_settled", (_event, ctx) => {
		void check(ctx.cwd);
	});
}
