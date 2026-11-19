/**
 * Notices: each new line of the Project Manager's Notice file arrives in the conversation as
 * a message of its own, never through the text box, so a half-typed draft survives
 * (GLOSSARY.md, `Notice`; fac-qpv.2.1).
 *
 * `FACTORY_NOTICES_FILE` names the file to read, which `project-manager/start` exports as
 * `~/.local/share/factory/notices/<pane>.md`, the file `bin/tell-pm` appends to. It is read
 * once, when the extension loads, and then removed from the environment, so a process the
 * session starts is not handed the same inbox.
 *
 * The file is read on a timer, not watched. The platform's change notification drops events
 * when a busy process overflows its event queue, and a dropped event reaches the watcher as
 * nothing at all: in one Project Manager's pane three Notices in a row were written to the
 * file and never arrived, with no error to say why (fac-8xl). A timer compares the file's
 * length with the length already delivered, so a line cannot be lost that way; the cost is
 * one read of a small file each second. Each line is delivered before the length moves past
 * it, so a line whose message fails is tried again rather than skipped, and a line already
 * sent in that read is not sent a second time.
 *
 * Only lines written after the session started are delivered: the file's length at
 * `session_start` is the starting point, because the Project Manager's status check finds
 * the Runs that ended while no session was open, and replaying the file as well would have
 * it record those Runs twice (fac-qpv.2.2).
 */
import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** How long between reads of the file, in milliseconds: a Notice reaches an idle Project
 * Manager within the second. */
const readEvery = 1000;

/**
 * The key the file is kept under, on the process rather than this load, so the load after a
 * runtime rebuild finds it with the variable already gone, the way `/new`, `/resume`, `/fork`
 * and `/reload` reload the extensions (fac-64n).
 */
const noticeFileKey = Symbol.for("factory.notices.file");

/** The file `FACTORY_NOTICES_FILE` names, or the one an earlier load in this process kept. */
const takeNoticeFile = (): string | undefined => {
	const processWide = globalThis as typeof globalThis & { [noticeFileKey]?: string };
	const inherited = process.env.FACTORY_NOTICES_FILE || undefined;
	delete process.env.FACTORY_NOTICES_FILE;
	if (inherited) processWide[noticeFileKey] = inherited;
	return processWide[noticeFileKey];
};

export default function notices(pi: ExtensionAPI): void {
	const noticeFile = takeNoticeFile();
	let timer: NodeJS.Timeout | undefined;

	pi.on("session_start", async () => {
		if (timer) clearInterval(timer);
		timer = undefined;
		if (!noticeFile) return;

		// Everything already in the file belongs to an earlier session.
		let delivered = fs.existsSync(noticeFile) ? fs.statSync(noticeFile).size : 0;

		/** Delivers every complete line after `delivered`, moving it past a line only once
		 * that line's message is sent, so a failed send is tried again and the lines already
		 * sent in the same read are not sent twice. */
		const deliverNewLines = (): void => {
			let contents: Buffer;
			try {
				contents = fs.readFileSync(noticeFile);
			} catch {
				// The file is the Run's to write; until it exists there is nothing to deliver.
				return;
			}
			// A replaced or emptied file is a new one: read it from the start.
			let cursor = contents.length < delivered ? 0 : delivered;
			for (;;) {
				const newline = contents.indexOf(0x0a, cursor);
				if (newline < 0) break;
				const line = contents.subarray(cursor, newline).toString("utf8").replace(/\r$/, "");
				if (line.trim() !== "") {
					pi.sendMessage(
						{ customType: "notice", content: `Notice: ${line}`, display: true },
						{ triggerTurn: true, deliverAs: "followUp" },
					);
				}
				cursor = newline + 1;
				delivered = cursor;
			}
			delivered = cursor;
		};

		timer = setInterval(() => {
			try {
				deliverNewLines();
			} catch {
				// A send can fail while the session is shutting down; the next read tries the
				// same line again, because the length only moves past a line once it is sent.
			}
		}, readEvery);
	});

	pi.on("session_shutdown", async () => {
		if (timer) clearInterval(timer);
		timer = undefined;
	});
}
