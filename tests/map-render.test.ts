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

/**
 * Runs the repo's map/render beside a paths.txt the test writes, and returns its stdout.
 * render reads paths.txt and page.html from its own folder, so the copy needs both, and
 * it writes the page it builds to the file named on its command line.
 */
const render = (paths: string): string => {
	const dir = mkdtempSync(join(tmpdir(), "factory-map-"));
	copyFileSync(join(root, "map", "render"), join(dir, "render"));
	chmodSync(join(dir, "render"), 0o755);
	copyFileSync(join(root, "map", "page.html"), join(dir, "page.html"));
	writeFileSync(join(dir, "paths.txt"), paths);
	return execFileSync("python3", [join(dir, "render"), join(dir, "map.html")], { encoding: "utf8" });
};

test("map/render checks a tagged path alone, wherever its tag sits", () => {
	const dir = mkdtempSync(join(tmpdir(), "factory-map-tree-"));
	// Every folder here exists, so none of these lines may be reported missing. One line
	// puts the tag after the note, one puts it before, and one puts two tags in one
	// bracket before the note, which is where the map's own paths.txt put them.
	const present = {
		"tag-after-note": "  tag-after-note/  — The tag comes after the note  [runtime]",
		"tag-before-note": "  tag-before-note/  [runtime]  — The tag comes before the note",
		"two-tags-one-bracket": "  two-tags-one-bracket/  [source, installed]  — Two tags in one bracket",
	};
	for (const name of Object.keys(present)) mkdirSync(join(dir, name));
	const missingName = "genuinely-missing";
	const missing = `  ${missingName}/  [runtime]  — No folder here, so it is reported`;
	const out = render(
		["## Fixture", `${dir}  — The fixture root`, ...Object.values(present), missing, ""].join("\n"),
	);
	const reported = out
		.split("\n")
		.filter((line) => line.startsWith("missing: "))
		.map((line) => line.slice("missing: ".length));
	// The tag is not part of the path: the path reported is the folder alone, joined to the
	// fixture root it sits under.
	assert.deepEqual(reported, [`${join(dir, missingName)}/`]);
});
