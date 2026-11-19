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
 * a space, then a JSON object with a string node, flows and artifacts, the artifacts folder
 * absolute, and an optional string check. The package dropped the bead field (pi-flows PR #5,
 * fac-s4s) and ignores a marker whose artifacts folder is relative (pi-flows PR #3), so this
 * scan must follow it: a rule left behind would miss a marker the package now reads.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
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
	const { node, flows, artifacts } = parsed as Record<string, unknown>;
	return [node, flows, artifacts].every((field) => typeof field === "string") && isAbsolute(artifacts as string);
};

/** Every line pi-flows would read as a marker, as `<file>:<line>` relative to the folder. */
const markerLines = (folder: string): string[] =>
	files(folder).flatMap((path) =>
		readFileSync(path, "utf8")
			.split("\n")
			.flatMap((line, index) => (isMarkerLine(line) ? [`${relative(folder, path)}:${String(index + 1)}`] : [])),
	);

test("no file this repo ships carries a line pi-flows would take for a node's marker", () => {
	assert.deepEqual(markerLines(root), [], "only a Run's prompt carries a Flows marker");
});

test("the scan takes a real marker and leaves a placeholder the package ignores alone", () => {
	// A known-good marker, the shape a Run's prompt carries, and the bug's own placeholder,
	// which the package no longer reads because its artifacts folder is not absolute. The scan
	// flags the first and not the second, so the empty list above is a pass and not a rule
	// that matches nothing (fac-3xv).
	const folder = mkdtempSync(join(tmpdir(), "factory-flows-marker-"));
	try {
		mkdirSync(join(folder, "docs"));
		const real = { node: "work", flows: "/runs/1/flows", artifacts: "/runs/1/artifacts" };
		writeFileSync(join(folder, "docs", "run.md"), `A Run's prompt says:\n\n    FLOWS ${JSON.stringify(real)}\n`);
		writeFileSync(join(folder, "docs", "placeholder.md"), `FLOWS ${JSON.stringify({ node: "work", flows: "...", artifacts: "..." })}\n`);
		writeFileSync(join(folder, "docs", "prose.md"), "A marker names the node, the folders and the check.\n");
		assert.deepEqual(markerLines(folder), ["docs/run.md:3"], "the run's marker is found, the placeholder is not a marker");
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
});
