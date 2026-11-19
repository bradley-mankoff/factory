/**
 * A Flows marker is a line the pi-flows package takes for its own instruction when a pi
 * session reads it, in its prompt or in anything else in its context, and it keeps the
 * node's start tree beside the marker's artifacts folder. A placeholder marker in a file a
 * session read, with `...` for its folders, wrote a folder named `...` into the checkout the
 * session worked in (fac-3xv). Only a Run's prompt may carry a marker, so no file this repo
 * ships does.
 *
 * The seam is the repo's files, read the way a session reads them. The marker's rule is the
 * package's, restated here rather than taken from what a Mac has installed: the word FLOWS,
 * a space, then a JSON object with a string node, bead, flows and artifacts.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Folders that hold no file this repo ships: git's own, the Beads database, vendors. */
const skipped = new Set([".git", ".beads", "node_modules"]);

/** Every file under a folder, silently skipping the folders above. */
const files = (folder: string): string[] =>
	readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
		if (skipped.has(entry.name)) return [];
		const path = join(folder, entry.name);
		return entry.isDirectory() ? files(path) : [path];
	});

/** Whether pi-flows would read a line as its own marker. */
const isMarkerLine = (line: string): boolean => {
	const text = line.trim();
	if (!text.startsWith("FLOWS ")) return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(text.slice("FLOWS ".length));
	} catch {
		return false;
	}
	if (typeof parsed !== "object" || parsed === null) return false;
	const { node, bead, flows, artifacts } = parsed as Record<string, unknown>;
	return [node, bead, flows, artifacts].every((field) => typeof field === "string");
};

test("no file this repo ships carries a line pi-flows would take for a node's marker", () => {
	const offenders: string[] = [];
	for (const path of files(root)) {
		for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
			if (isMarkerLine(line)) offenders.push(`${relative(root, path)}:${String(index + 1)}`);
		}
	}
	assert.deepEqual(offenders, [], "only a Run's prompt carries a Flows marker");
});
