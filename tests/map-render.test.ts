/**
 * The map names every listed path that is missing (fac-fca). The seam is map/render run
 * against a temporary paths.txt: the test reads its stdout, which is the only place the
 * missing paths appear, never the code that finds them.
 *
 * A path line carries an optional tag, in brackets, and the tag sits wherever it reads
 * best: after the note, or between the path and the note. The tag is not part of the
 * path, so render must test the path alone either way.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Runs the repo's map/render beside a paths.txt the test writes, and returns stdout. */
const render = (paths: string): string => {
	const dir = mkdtempSync(join(tmpdir(), "factory-map-"));
	copyFileSync(join(root, "map", "render"), join(dir, "render"));
	chmodSync(join(dir, "render"), 0o755);
	copyFileSync(join(root, "map", "page.html"), join(dir, "page.html"));
	writeFileSync(join(dir, "paths.txt"), paths);
	return execFileSync("python3", [join(dir, "render"), join(dir, "page.html")], { encoding: "utf8" });
};

test("map/render checks a tagged path alone, wherever its tag sits", () => {
	const dir = mkdtempSync(join(tmpdir(), "factory-map-tree-"));
	// Every path below exists, so none may be reported missing.
	const endsWithTag = join(dir, "tag-after-note");
	const tagBeforeNote = join(dir, "tag-before-note");
	const twoTags = join(dir, "two-tags");
	for (const path of [endsWithTag, tagBeforeNote, twoTags]) mkdirSync(path);
	const missing = join(dir, "genuinely-missing");
	const out = render(
		[
			"## Fixture",
			`${dir}  — The fixture root`,
			`  ${endsWithTag.slice(dir.length + 1)}/  — The tag comes after the note  [runtime]`,
			`  ${tagBeforeNote.slice(dir.length + 1)}/  [runtime]  — The tag comes before the note`,
			`  ${twoTags.slice(dir.length + 1)}/  [source, installed]  — Two tags before the note`,
			`  ${missing.slice(dir.length + 1)}/  [runtime]  — No folder here, so it is reported`,
			"",
		].join("\n"),
	);
	const reported = out
		.split("\n")
		.filter((line) => line.startsWith("missing: "))
		.map((line) => line.slice("missing: ".length));
	// The tag is not part of the path: the reported path is the folder alone.
	assert.deepEqual(reported, [`${missing}/`]);
});
