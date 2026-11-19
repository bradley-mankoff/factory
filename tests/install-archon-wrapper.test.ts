/**
 * The archon command install leaves on a Mac (fac-lw9). A Mac whose earlier Factory put a
 * link at ~/.local/bin/archon must keep the file that link pointed at, so install writes its
 * wrapper inside its own root and links that into ~/.local/bin, as it does pm. FactoryClaw
 * calls ~/.local/bin/archon, and OpenClaw matches its exec allowlist against the resolved
 * binary, so the allowlist entry has to name the wrapper the link resolves to. The seam is
 * installation: scripts/install.sh runs on a temporary Mac, and the test reads back the
 * files it left and the allowlist it sent OpenClaw. The wrapper is also the Project
 * Manager's run command, so a test runs it as a Project Manager's shell does and reads the
 * arguments Archon was handed (fac-02k).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { logOf, type Mac, makeMac } from "./fixtures/install-mac.ts";

/** Where the wrapper sits on a Mac's PATH, the path FactoryClaw calls. */
const onPath = (mac: Mac): string => join(mac.home, ".local", "bin", "archon");

/** Where install keeps the wrapper itself, under the Factory's one root. */
const installedWrapper = (mac: Mac): string => join(mac.home, ".local", "share", "factory", "commands", "archon");

/**
 * The arguments the installed wrapper handed Archon, run as a Project Manager's shell runs
 * it: the wrapper's own lines, then the ones this test sets. Archon is the temporary Mac's
 * stand-in, which writes down every call it gets.
 */
const wrapperArgs = (mac: Mac, args: string[], overrides: NodeJS.ProcessEnv = {}): string => {
	const env: NodeJS.ProcessEnv = { ...mac.env };
	delete env.WORKSPACE;
	delete env.FACTORY_PM_BRANCH;
	Object.assign(env, overrides);
	const result = spawnSync(installedWrapper(mac), args, { encoding: "utf8", env });
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const last = logOf(mac.logs.archon).trim().split("\n").at(-1) ?? "";
	return last.slice(last.indexOf("args=") + "args=".length);
};

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

test("under the worktree shape the wrapper starts a fresh Run from the Project Manager's branch", () => {
	// Archon would cut the Run from the project's default branch instead, and the Run would
	// land there; the Project Manager's branch is the right default (fac-02k).
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(
			wrapperArgs(mac, ["workflow", "run", "factory-build", "--detach", "pm-build-1 · fac-1"], {
				WORKSPACE: "worktree",
				FACTORY_PM_BRANCH: "pm/build-1",
			}),
			"workflow run factory-build --base pm/build-1 --detach pm-build-1 · fac-1",
			"the Run's base is the Project Manager's branch",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("under the worktree shape the wrapper leaves an adopting Run alone, because Archon refuses --base with --adopt", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(
			wrapperArgs(mac, ["workflow", "run", "factory-build", "--adopt", "withheld-1", "--detach", "pm-build-1 · fac-1"], {
				WORKSPACE: "worktree",
				FACTORY_PM_BRANCH: "pm/build-1",
			}),
			"workflow run factory-build --adopt withheld-1 --detach pm-build-1 · fac-1",
			"the adopting Run keeps the command its caller gave",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("under the worktree shape a --base the Project Manager passed is kept, not doubled", () => {
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(
			wrapperArgs(mac, ["workflow", "run", "factory-research", "--base", "release", "--detach", "pm-build-1 · why"], {
				WORKSPACE: "worktree",
				FACTORY_PM_BRANCH: "pm/build-1",
			}),
			"workflow run factory-research --base release --detach pm-build-1 · why",
			"a base the caller chose is not replaced",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a shell outside the worktree shape gets the wrapper's command unchanged", () => {
	// FactoryClaw and the Human's own shells call the same archon; only a Project Manager's
	// shell names the workspace shape, so only its Runs take the branch default.
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(
			wrapperArgs(mac, ["workflow", "run", "factory-build", "--detach", "pm-build-1 · fac-1"]),
			"workflow run factory-build --detach pm-build-1 · fac-1",
			"the command passes through as it was given",
		);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
