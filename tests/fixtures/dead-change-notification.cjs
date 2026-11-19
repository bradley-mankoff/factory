/**
 * The platform's change notification with a broken event stream: a process that watches the
 * Notice folder, or a file in it, is told nothing when that file changes, and the watcher
 * reports no error. That is what macOS's event stream does when a busy process overflows its
 * queue, the way the Notices watcher went silent and lost three Notices in one pane (fac-8xl).
 *
 * It stands in only for the operating system's edge: every other file-system call is the
 * real one. It loads through NODE_OPTIONS=--require, so the pi process under test is the
 * broken one. DEAD_CHANGE_LOG gets a line when this file loads and a line for each watch it
 * breaks, so a test can prove the edge was in place.
 */
const fs = require("node:fs");
const path = require("node:path");

const realWatch = fs.watch;

fs.appendFileSync(process.env.DEAD_CHANGE_LOG, "loaded\n");

/** Whether the target is a Notice folder, or a file in one: the folder pi-notices watched,
 * and the file a reader that went back to watching would name. */
const noticeFolder = "notices";
const isNoticePath = (target) =>
	path.basename(target) === noticeFolder || path.basename(path.dirname(target)) === noticeFolder;

fs.watch = function (target, ...rest) {
	const name = String(target);
	if (isNoticePath(name)) {
		fs.appendFileSync(process.env.DEAD_CHANGE_LOG, `broke ${name}\n`);
		return { close() {}, on() {}, unref() {} };
	}
	return realWatch.call(this, target, ...rest);
};
