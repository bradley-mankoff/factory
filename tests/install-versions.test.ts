/**
 * The Archon move (fac-aan): its install makes a Mac match the one version set. The seam is
 * installation: scripts/install.sh runs on a temporary Mac with stand-ins at the system's
 * edges (Archon, the release's curl), and the test reads back the Archon the Mac ends with
 * and the provider receipt beside it. This catches a pin that never reaches the binary or
 * its provider; it misses what Archon itself does at Run time, which the Bead's live Runs
 * prove.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac } from "./fixtures/install-mac.ts";

/** The Archon binary install puts in the Archon home, run with the Mac's own environment. */
const installedArchon = (home: string): string => join(home, ".local", "share", "factory", "archon", "bin", "archon");

/** The version the pi provider's receipt names; Archon writes it when `provider add pi` runs. */
const receiptTag = (home: string): string =>
	JSON.parse(
		readFileSync(
			join(
				home,
				".local",
				"share",
				"factory",
				"archon",
				"plugins",
				"installed",
				"coleam00",
				"Archon",
				"plugins",
				"provider-pi",
				"receipt.json",
			),
			"utf8",
		),
	).tag;

test("install moves a Mac on the previous Archon release to the pinned one and its provider", () => {
	const mac = makeMac({ archonVersion: "v0.12.1" });
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const version = execFileSync(installedArchon(mac.home), ["--version"], { encoding: "utf8", env: mac.env });
		assert.match(version, /archon v0\.14\.0/, "the binary at the Archon home reports the pinned release");
		assert.equal(receiptTag(mac.home), "v0.14.0", "the provider installed with that binary is the same release's");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install on a Mac already at the pinned set downloads nothing", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.equal(logOf(mac.logs.curl), "", "the release is not asked for");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
