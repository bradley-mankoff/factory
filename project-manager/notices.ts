/**
 * Notices: each line of a Project Manager's Notice file arrives in the conversation as a
 * message of its own, never through the text box, so a half-typed draft survives
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
 * file and never arrived, with no error to say why (fac-8xl). A timer costs one read of a
 * small file each second and cannot miss a line that was written.
 *
 * The file is the event list, and each Notice's status is kept beside it, in
 * `<pane>.status`, one record a line: an id and `delivered` once the Notice is in a turn, or
 * `acted on` once the turn that carried it has ended. An id with no record is pending. The
 * id is the hash of the Notice's line, so the same Notice written twice, as a retried Run
 * node writes it, is one event and reaches the Project Manager once. A session delivers
 * every Notice that is not `acted on` on its way up, so one that was written while the pane
 * was closed is not lost, and it never sends the same id twice itself (fac-618). A Notice
 * delivered by a session that then crashed stays short of `acted on`, so the session after
 * it delivers that Notice again: at worst the Project Manager reads one twice, which its
 * instructions already allow for, and never none (fac-618, fac-c94).
 *
 * Only one session takes a pane's Notices at a time, the one holding `<pane>.lock`, which
 * holds its process id: two sessions have run under one pane name and both acted on every
 * Notice (2026-11-11). A session that finds a live holder leaves the Notices to it and
 * looks again on each read, so it takes the pane over when that session goes, and a lock
 * whose process is gone is taken at once. The session lets go of the lock when it shuts
 * down, so the next one starts with the pane to itself.
 */
import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, parse } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** How long between reads of the file, in milliseconds: a Notice reaches an idle Project
 * Manager within the second. */
const readEveryMs = 1000;

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

/** What became of a Notice: `delivered` once it is in a turn, `acted on` once the turn that
 * carried it has ended. An id with no record is pending, so a pending Notice needs no line. */
type Status = "delivered" | "acted on";

/** A Notice's id, the event's name in the list: the hash of its line, so the same Notice
 * written twice is one event. */
const idOf = (line: string): string => createHash("sha256").update(line).digest("hex").slice(0, 16);

/** A file kept beside the Notice file: `pm-calc.md` has `pm-calc.status` and `pm-calc.lock`. */
const beside = (noticeFile: string, suffix: string): string => {
	const { dir, name } = parse(noticeFile);
	return join(dir, `${name}${suffix}`);
};

/** The statuses recorded beside the Notice file, by id: the last record for an id wins. */
const readStatuses = (statusFile: string): Map<string, Status> => {
	const statuses = new Map<string, Status>();
	let contents: string;
	try {
		contents = readFileSync(statusFile, "utf8");
	} catch {
		return statuses;
	}
	for (const line of contents.split("\n")) {
		if (!line.trim()) continue;
		try {
			const { id, status } = JSON.parse(line) as { id?: string; status?: Status };
			if (id && (status === "delivered" || status === "acted on")) statuses.set(id, status);
		} catch {
			// A record half written is no record; the Notice reads as it did before it.
		}
	}
	return statuses;
};

/** Appends one record to the status file, so a status is never rewritten over one a reader
 * may be halfway through. */
const record = (statusFile: string, id: string, status: Status): void => {
	appendFileSync(statusFile, `${JSON.stringify({ id, status })}\n`);
};

/** Whether a process is still running: `kill(pid, 0)` reports ESRCH only for one that is gone. */
const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
};

/**
 * Takes the pane's lock for this process, and says whether this process holds it: the one
 * session that takes a pane's Notices. `wx` creates the file only when it is not there, so
 * two sessions waking at the same moment cannot both take it. A lock whose process is gone,
 * as a killed session leaves it, is taken over, so a pane is never left with nobody taking
 * its Notices.
 */
const takeLock = (lockFile: string): boolean => {
	mkdirSync(dirname(lockFile), { recursive: true });
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			writeFileSync(lockFile, `${process.pid}\n`, { flag: "wx" });
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		let holder: number;
		try {
			holder = Number(readFileSync(lockFile, "utf8").trim());
		} catch {
			continue; // the holder let go between the two calls
		}
		if (holder === process.pid) return true;
		if (alive(holder)) return false;
		try {
			unlinkSync(lockFile); // its process is gone: the next turn of this loop takes it
		} catch {
			// Another session cleared it first, and the next turn of this loop finds out who took it.
		}
	}
	return false;
};

/** Lets go of the pane's lock, when this process is the one holding it. */
const releaseLock = (lockFile: string): void => {
	try {
		if (Number(readFileSync(lockFile, "utf8").trim()) === process.pid) unlinkSync(lockFile);
	} catch {
		// Nothing is held, so there is nothing to let go.
	}
};

export default function notices(pi: ExtensionAPI): void {
	const noticeFile = takeNoticeFile();
	let timer: NodeJS.Timeout | undefined;
	let statusFile = "";
	let lockFile = "";
	/** The ids this session has put in the conversation, so a Notice it sent is not sent
	 * again by a later read. */
	let sent = new Set<string>();
	/** The ids this session delivered in the run that is going on, which are `acted on` when
	 * that run settles. */
	let inRun: string[] = [];

	pi.on("session_start", async () => {
		if (timer) clearInterval(timer);
		timer = undefined;
		if (!noticeFile) return;
		statusFile = beside(noticeFile, ".status");
		lockFile = beside(noticeFile, ".lock");
		sent = new Set();
		inRun = [];

		/** Delivers every whole line whose Notice is not yet `acted on`. */
		const deliver = (): void => {
			const statuses = readStatuses(statusFile);
			let contents: string;
			try {
				contents = readFileSync(noticeFile, "utf8");
			} catch {
				// The file is the Run's to write; until it exists there is nothing to deliver.
				return;
			}
			const lines = contents.split("\n");
			// Whatever follows the last newline is a line still being written, not a Notice.
			lines.pop();
			for (const line of lines) {
				const text = line.replace(/\r$/, "");
				if (text.trim() === "") continue;
				const id = idOf(text);
				if (sent.has(id) || statuses.get(id) === "acted on") continue;
				try {
					pi.sendMessage(
						{ customType: "notice", content: `Notice: ${text}`, display: true },
						{ triggerTurn: true, deliverAs: "followUp" },
					);
				} catch {
					// A send can fail while the session is shutting down; the next read tries
					// the same line again, because nothing says it was delivered.
					continue;
				}
				sent.add(id);
				inRun.push(id);
				record(statusFile, id, "delivered");
			}
		};

		timer = setInterval(() => {
			try {
				if (takeLock(lockFile)) deliver();
			} catch {
				// The next read picks up where this one stopped.
			}
		}, readEveryMs);
	});

	pi.on("session_shutdown", async () => {
		if (timer) clearInterval(timer);
		timer = undefined;
		releaseLock(lockFile);
	});

	// The run that carried a Notice has settled, so the Project Manager has done what it does
	// with one: record it and take up the next Bead. A run the Human aborts is left out, and
	// so is one the process dies inside, so the session after it delivers those again: at
	// worst the Project Manager reads a Notice twice, which its instructions allow for, and
	// never none (fac-618, fac-c94).
	pi.on("agent_settled", async (event) => {
		const delivered = inRun;
		inRun = [];
		if (event.aborted) return;
		for (const id of delivered) {
			try {
				record(statusFile, id, "acted on");
			} catch {
				// No record, so the next session delivers the Notice again.
			}
		}
	});
}
