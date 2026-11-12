/**
 * The archon command install leaves on a Mac (fac-lw9). A Mac whose earlier Factory put a
 * link at ~/.local/bin/archon must keep the file that link pointed at, so install writes its
 * wrapper inside its own root and links that into ~/.local/bin, as it does pm. FactoryClaw
 * calls ~/.local/bin/archon, and OpenClaw matches its exec allowlist against the resolved
 * binary, so the allowlist entry has to name the wrapper the link resolves to. The seam is
 * installation: scripts/install.sh runs on a temporary Mac, and the test reads back the
 * files it left and the allowlist it sent OpenClaw.
 */
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, type Mac, makeMac } from "./fixtures/install-mac.ts";

/** Where the wrapper sits on a Mac's PATH, the path FactoryClaw calls. */
const onPath = (mac: Mac): string => join(mac.home, ".local", "bin", "archon");

/** Where install keeps the wrapper itself, under the Factory's one root. */
const installedWrapper = (mac: Mac): string => join(mac.home, ".local", "share", "factory", "commands", "archon");

test("install replaces a symlinked ~/.local/bin/archon rather than writing through it", () => {
	const mac = makeMac();
	try {
		// An earlier Factory on this Mac: its wrapper, reached from ~/.local/bin/archon by a
		// link, holding its own text so an overwrite through the link is unmistakable.
		const previous = join(mac.home, "earlier-factory", "bin", "archon");
		const previousWrapper = '#!/bin/sh\n# The earlier Factory on this Mac\nexec "$HOME/earlier-factory/bin/archon" "$@"\n';
		mkdirSync(dirname(previous), { recursive: true });
		mkdirSync(dirname(onPath(mac)), { recursive: true });
		writeFileSync(previous, previousWrapper);
		symlinkSync(previous, onPath(mac));

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(readFileSync(previous, "utf8"), previousWrapper, "the file the earlier Factory's link pointed at is unchanged");
		assert.ok(lstatSync(onPath(mac)).isSymbolicLink(), "~/.local/bin/archon is still a link");
		assert.equal(realpathSync(onPath(mac)), realpathSync(installedWrapper(mac)), "the link resolves to the Factory's own wrapper");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("the archon allowlist entry names the wrapper, not the link FactoryClaw calls", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const allowed: { pattern: string; argPattern?: string }[] = JSON.parse(logOf(mac.logs.approvals)).agents.factoryclaw.allowlist;
		const archon = allowed.filter((entry) => entry.argPattern?.startsWith("^workflow "));
		assert.equal(archon.length, 1, "FactoryClaw has one archon entry");
		// OpenClaw resolves ~/.local/bin/archon before matching, so an entry naming that path
		// would never match; the entry must be the path the link resolves to.
		assert.notEqual(realpathSync(onPath(mac)), onPath(mac), "the link resolves elsewhere, so the two paths can be told apart");
		assert.equal(archon[0].pattern, realpathSync(onPath(mac)), "OpenClaw matches the entry against the resolved binary");
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
