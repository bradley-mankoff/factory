/**
 * The archon command install puts on PATH is a link to the wrapper it keeps in its own root,
 * so a Mac whose ~/.local/bin/archon links into another Factory keeps that Factory's file
 * (fac-lw9). Writing through the link overwrote the earlier Factory's wrapper; this Factory's
 * archon allowlist is then read from the same path, so the link and the allowlist cannot
 * drift apart either. The seam is installation: scripts/install.sh runs on a temporary Mac
 * with stand-ins at the system's edges, and the test reads back the files and the allowlist
 * it leaves.
 */
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, makeMac, type Mac } from "./fixtures/install-mac.ts";

/** The wrapper install owns, under the Factory's one root. */
const factoryWrapper = (mac: Mac): string => join(mac.home, ".local", "share", "factory", "commands", "archon");

/** The command PATH serves, which install links to the Factory's wrapper. */
const commandOnPath = (mac: Mac): string => join(mac.home, ".local", "bin", "archon");

test("install replaces a symlinked ~/.local/bin/archon and leaves the file it pointed at", () => {
	const mac = makeMac();
	try {
		// A Mac running an earlier Factory: ~/.local/bin/archon links to that Factory's
		// wrapper. Its text differs from this Factory's, so an overwrite is unmistakable.
		const earlier = join(mac.home, "earlier-factory", "bin", "archon");
		const earlierWrapper = '#!/bin/sh\n# The earlier Factory on this Mac\nexec "$HOME/earlier-factory/bin/archon" "$@"\n';
		mkdirSync(dirname(earlier), { recursive: true });
		mkdirSync(dirname(commandOnPath(mac)), { recursive: true });
		writeFileSync(earlier, earlierWrapper);
		symlinkSync(earlier, commandOnPath(mac));

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(readFileSync(earlier, "utf8"), earlierWrapper, "the file the old link pointed at is unchanged");
		assert.ok(lstatSync(commandOnPath(mac)).isSymbolicLink(), "~/.local/bin/archon is a link");
		assert.equal(realpathSync(commandOnPath(mac)), realpathSync(factoryWrapper(mac)), "the link resolves to the Factory's wrapper");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the archon allowlist pattern is the path ~/.local/bin/archon resolves to", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const allowed: { pattern: string; argPattern?: string }[] = JSON.parse(logOf(mac.logs.approvals)).agents.factoryclaw.allowlist;
		const archon = allowed.find((entry) => entry.argPattern === "^workflow (status|runs)( |$)");
		assert.equal(archon?.pattern, realpathSync(commandOnPath(mac)), "FactoryClaw's allowlist names the archon command's real path");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
