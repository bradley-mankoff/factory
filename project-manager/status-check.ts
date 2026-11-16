/**
 * status-check: runs a Project Manager's status check when the Human asks for it.
 *
 * The check is opt-in (fac-k10). The launcher reads `status-check.md` beside this file for
 * `pm --status-check`; here `/status-check` sends the same text in the current session, and
 * `/new-and-status-check` starts a new session, as `/new` does, and sends it there as the
 * first message. One file holds the words, so the three ways cannot drift.
 *
 * It lives in the Factory core rather than a pi package of its own because only a Project
 * Manager uses it: the packages the install puts in pi are the generic ones (fac-qpv.8.1).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const checkFile = fileURLToPath(new URL("./status-check.md", import.meta.url));

const checkText = (): string => readFileSync(checkFile, "utf8").trim();

export default function statusCheck(pi: ExtensionAPI): void {
	pi.registerCommand("status-check", {
		description: "Review the claimed Beads, the ended Runs and the ready Beads, then propose the next steps",
		handler: async () => {
			// A check asked for mid-turn waits for that turn, rather than failing to send.
			await pi.sendUserMessage(checkText(), { deliverAs: "followUp" });
		},
	});

	pi.registerCommand("new-and-status-check", {
		description: "Start a new session and run the status check as its first message",
		handler: async (_args, ctx) => {
			await ctx.newSession({
				withSession: async (session) => {
					await session.sendUserMessage(checkText());
				},
			});
		},
	});
}
