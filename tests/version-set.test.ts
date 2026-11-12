/**
 * The one version set (fac-88m.1, fac-aan): Archon, pi and pi-claude-bridge are upgraded
 * together or not at all, and the top of scripts/install.sh is where the set is written.
 * The seam is the published files: the installer read for its three values, which its map
 * line calls the contract ("its top holds the one version set"), and the spec, the map and
 * the pi folder's README read the way a stranger reads them. This catches a bump that
 * reaches the installer but not the documents, or the documents but not the installer; it
 * misses whether this Mac really runs the set, which the Run's acceptance test proves by
 * installing it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pinnedValue, repoRoot } from "./fixtures/install-mac.ts";

const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");

/** The spec's current version paragraph, which ends where the Claude Code decision starts. */
const versionSection = (): string => {
	const spec = read("2026-10-16-factory-stack.md");
	const start = spec.indexOf("### Versions it is built against");
	const end = spec.indexOf("No session runs in Claude Code");
	assert.ok(start >= 0 && end > start, "the spec keeps its Versions section before the Claude Code decision");
	return spec.slice(start, end);
};

test("the install pins Archon 0.14.0 with pi 1.3.0 and pi-claude-bridge 0.9.3", () => {
	assert.equal(pinnedValue("archon_version"), "0.14.0");
	assert.equal(pinnedValue("pi_version"), "1.3.0");
	assert.equal(pinnedValue("bridge"), "pi-claude-bridge@0.9.3");
});

test("the spec's version section names the Archon the install pins and the pi it bundles", () => {
	const section = versionSection();
	assert.match(section, /^- Archon 0\.14\.0, its binary at/m);
	assert.match(section, /^- pi 1\.3\.0 as the installed `pi` command/m);
	assert.match(section, /1\.3\.0 \(Archon's `bun\.lock` at tag v0\.14\.0\)/);
});

test("the map names the version set the install pins", () => {
	const map = read("map/paths.txt");
	assert.match(map, /version set: Archon 0\.14\.0, pi 1\.3\.0, pi-claude-bridge 0\.9\.3/);
	assert.match(map, /Archon 0\.14\.0 runs Workflows on pi/);
	assert.match(map, /The Archon 0\.14\.0 binary/);
});

test("the map names no Archon this Mac does not run", () => {
	assert.equal(
		read("map/paths.txt").includes("0.12.1"),
		false,
		"the map is this Mac's, so it names no earlier Archon as installed",
	);
});

test("the pi folder's README places the package lookup in the Archon the install pins", () => {
	const readme = read("pi-agent/README.md");
	assert.match(readme, /Archon 0\.14\.0 loads this folder's packages/);
	assert.match(
		readme,
		/community\/pi\/session-setup\.ts`, LOOKUP-2/,
		"the source the README cites is where the pinned release does the lookup",
	);
});
