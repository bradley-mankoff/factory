/**
 * blocked-mark: shows a Project Manager's herdr pane as blocked while its project has an
 * open Ask, so herdr, Heeler and archon-bar tell the Human he owes an answer without anyone
 * sending a message (fac-3mz.5, the Epic's Spec fac-3mz).
 *
 * Blocked always means the Human owes an answer, so only an open Ask marks the pane: the
 * check asks `factory asks` for the open ones, and an answered Ask is left out by the
 * command itself. With no open Ask the extension reports nothing, and pi's own idle report
 * stands; the mark then clears when the next turn starts, which happens when the answer
 * arrives as a Notice.
 */
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The source herdr files this state under, which is not herdr's own `herdr:pi`. */
const SOURCE = "factory:asks";

/**
 * How long the report waits, so pi's own turn-end report reaches herdr first. That report
 * is herdr's pi integration, another handler on this same event, which pi starts after this
 * one because the command line's extensions load before the user folder's; herdr keeps the
 * later report for a pane, so the blocked mark is the one that stands.
 */
const AFTER_PI_MS = 250;

/**
 * Whether the project has an open Ask. A `factory` that fails, is missing or answers with
 * something other than the Asks list counts as none, so the turn ends as it did before.
 */
function hasOpenAsk(repo: string): boolean {
	const answer = spawnSync("factory", ["asks", "--project", repo, "--open", "--json"], {
		encoding: "utf8",
	});
	if (answer.error || answer.status !== 0) return false;
	try {
		const asks: unknown = JSON.parse(answer.stdout);
		return Array.isArray(asks) && asks.length > 0;
	} catch {
		return false;
	}
}

export default function blockedMark(pi: ExtensionAPI): void {
	pi.on("agent_settled", (_event, ctx) => {
		const pane = process.env.HERDR_PANE_ID;
		if (!pane) return;
		// The handler returns at once: pi awaits each handler in turn, so work done inside it
		// would keep pi's own report from being sent at all until after this one.
		setTimeout(() => {
			if (!hasOpenAsk(ctx.cwd)) return;
			spawnSync("herdr", ["pane", "report-agent", pane, "--source", SOURCE, "--agent", "pi", "--state", "blocked"]);
		}, AFTER_PI_MS);
	});
}
