/**
 * The platform's change notification with a broken event stream: a process that watches a
 * folder is told nothing when a file in it changes, and the watcher reports no error. That
 * is what macOS's event stream does when a busy process overflows its queue, the way the
 * Notices watcher went silent and lost three Notices in one pane (fac-8xl).
 *
 * It stands in only for the operating system's edge: every other file-system call is the
 * real one. It loads through NODE_OPTIONS=--require, so the pi process under test is the
 * broken one. DEAD_CHANGE_LOG gets a line when this file loads and a line for each watch it
 * breaks, so a test can prove the edge was in place.
 */
const fs = require("node:fs");

const realWatch = fs.watch;

fs.appendFileSync(process.env.DEAD_CHANGE_LOG, "loaded\n");

fs.watch = function (target, ...rest) {
	const name = String(target);
	if (name.endsWith("/notices")) {
		fs.appendFileSync(process.env.DEAD_CHANGE_LOG, `broke ${name}\n`);
		return { close() {}, on() {}, unref() {} };
	}
	return realWatch.call(this, target, ...rest);
};
