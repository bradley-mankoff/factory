/**
 * A stand-in for herdr's own pi integration, `~/.pi/agent/extensions/herdr-agent-state.ts`,
 * which is the one thing that turns pi's `herdr:blocked` event into a pane report: it keeps
 * a count of active blocks and reports the pane blocked under its own source `herdr:pi`. It
 * records each event the blocked-mark extension emits, so a test reads what herdr's
 * integration would be told without starting herdr.
 *
 * HERDR_BLOCKED_LOG: one JSON object a line per event, in the order they were emitted.
 */
import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function herdrBlockedLog(pi: ExtensionAPI): void {
	pi.events.on("herdr:blocked", (data) => {
		appendFileSync(process.env.HERDR_BLOCKED_LOG ?? "/dev/null", `${JSON.stringify(data)}\n`);
	});
}
