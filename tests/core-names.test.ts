/**
 * The Factory core names nothing of the work Mac (fac-qpv.6.7): the Human publishes this
 * repo, and a work name must stay on the Mac whose Profile chooses the squash landing. The
 * seam is the published files themselves: every tracked file outside the Beads database is
 * read as a stranger publishing it would read it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { shippedProfile } from "./fixtures/install-mac.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** One work name, written in pieces so this file holds nothing the search below matches. */
const hidden = (...pieces: string[]): string => pieces.join("");

/**
 * The names a work Mac keeps to itself: the work login's folders, its provider logins and
 * repos, and the Profile kept for it here until fac-qpv.6.6 carries it over.
 */
const keptOnTheWorkMac = [
	hidden("bau", "_git"),
	hidden("client", "_config"),
	hidden("ar", "ivan"),
	hidden("codex", "-bradley"),
	hidden("bau", "health"),
	hidden("bau", "-library"),
	hidden("work", "-factory"),
	hidden("bradley", "/silo"),
	hidden("profile", ".", "work"),
];

/** The names as one regular expression, each matched as a literal rather than a pattern. */
const literal = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = keptOnTheWorkMac.map(literal).join("|");

test("the core's files name nothing of the work Mac", () => {
	const result = spawnSync("git", ["grep", "-i", "-n", "-E", pattern, "--", ".", ":(exclude).beads/*"], {
		cwd: root,
		encoding: "utf8",
	});
	// git grep exits 1 when nothing matches, which is the answer this test wants. Any other
	// status means either the search itself failed or a name is still published.
	assert.equal(result.status, 1, `the search failed or found a name (status ${result.status}):\n${result.stdout}${result.stderr}`);
	assert.equal(existsSync(join(root, "config", "profile")), true, "the one shipped example Profile is config/profile");
	assert.equal(existsSync(join(root, "config", hidden("profile", "personal"))), false, "no separate personal Profile ships");
	assert.equal(existsSync(join(root, "config", hidden("profile", "work"))), false, "no work Profile ships in this repo");
});

test("the shipped Profile is the personal Mac's, and its comments offer the other choices generically", () => {
	const profile = shippedProfile();
	for (const value of ["LANDING=pull-request", "OUTER_LAYER=factoryclaw", "WORKSPACE=project", "PROTECTED_TARGETS="]) {
		assert.ok(profile.includes(value), `the example names ${value}`);
	}
	// A Mac whose Profile chooses otherwise writes its own values; the example only says
	// which choices exist, with a placeholder repo name for the protected targets.
	for (const choice of ["LANDING=squash", "WORKSPACE=worktree", "OUTER_LAYER=none", "myrepo"]) {
		assert.ok(profile.includes(choice), `the example mentions ${choice}`);
	}
});
