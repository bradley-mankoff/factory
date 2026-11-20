/**
 * A stand-in for pi-herdr-ding, the package that plays the "needs attention" sound at a
 * herdr pane's settled turn and stays silent for a turn when another extension emits its
 * hold. The real package also reads herdr's own variables and the screen before it plays;
 * this stand-in reads only the hold, and writes down at each settled turn whether the turn
 * was held or would have played, so a test sees the hold decision without playing a sound
 * (fac-o2r, fac-o2r.1).
 *
 * HERDR_DING_LOG: one `held` or `played` a line, one per settled turn, in the order the
 * turns ended.
 */
import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** The event pi-herdr-ding documents for holding one turn's sound. */
const HOLD_EVENT = "pi-herdr-ding:hold";

export default function herdrDingLog(pi: ExtensionAPI): void {
	/** Whether another extension held the turn in progress, cleared as it settles, as the
	 * package keeps it: a hold covers one settled turn and the next one plays again. */
	let held = false;

	pi.events.on(HOLD_EVENT, () => {
		held = true;
	});
	pi.on("agent_settled", () => {
		appendFileSync(process.env.HERDR_DING_LOG ?? "/dev/null", held ? "held\n" : "played\n");
		held = false;
	});
}
