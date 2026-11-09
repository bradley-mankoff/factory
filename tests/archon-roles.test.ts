/**
 * The Factory's Archon roles: the tiers and @aliases a Workflow names instead of a model or
 * a seat (fac-qpv.1.4). The seam is Archon's own configuration interface: bin/archon-roles
 * runs against a temporary ARCHON_HOME made from this Mac's Archon, and the test reads back
 * the roles Archon will use with `archon ai alias list --json` and `archon ai tier list
 * --json`, rather than looking inside the YAML Archon wrote.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = join(root, "bin", "archon-roles");
// This Mac's Archon, which install.sh puts in the Factory's root: its binary and the
// provider plugins that `archon ai` needs to know the pi provider.
const installed = process.env.ARCHON_HOME ?? join(homedir(), ".local", "share", "factory", "archon");

type Role = { provider: string; model: string; effort?: string };

/** A temporary Archon home, holding links to this Mac's Archon and its plugins. */
const makeArchonHome = (): string => {
	const home = mkdtempSync(join(tmpdir(), "factory-archon-roles-"));
	mkdirSync(join(home, "bin"));
	symlinkSync(join(installed, "bin", "archon"), join(home, "bin", "archon"));
	symlinkSync(join(installed, "plugins"), join(home, "plugins"));
	return home;
};

const runArchon = (home: string, args: string[]): string => {
	const result = spawnSync(join(home, "bin", "archon"), args, {
		encoding: "utf8",
		env: { ...process.env, ARCHON_HOME: home },
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	return result.stdout;
};

const runRoles = (home: string) =>
	spawnSync(helper, [], { encoding: "utf8", env: { ...process.env, ARCHON_HOME: home } });

test("every role Archon names runs on a Chain, and a second run changes nothing", () => {
	const home = makeArchonHome();
	try {
		const first = runRoles(home);
		assert.equal(first.status, 0, first.stderr || first.stdout);

		const aliases = (JSON.parse(runArchon(home, ["ai", "alias", "list", "--json"])).aliases as Array<{
			name: string;
			effective: Role;
		}>).map((alias) => [alias.name, alias.effective] as [string, Role]);
		aliases.sort((a, b) => a[0].localeCompare(b[0]));
		assert.deepEqual(aliases, [
			["@reviewer", { provider: "pi", model: "chain/work" }],
			["@spec-review", { provider: "pi", model: "chain/spec-review" }],
			["@standards-review", { provider: "pi", model: "chain/work" }],
			["@work", { provider: "pi", model: "chain/work" }],
		]);

		const tiers = (JSON.parse(runArchon(home, ["ai", "tier", "list", "--json"])).tiers as Array<{
			tier: string;
			effective: Role;
		}>).map((tier) => [tier.tier, tier.effective] as [string, Role]);
		tiers.sort((a, b) => a[0].localeCompare(b[0]));
		assert.deepEqual(tiers, [
			["large", { provider: "pi", model: "chain/work" }],
			["medium", { provider: "pi", model: "chain/work" }],
			["small", { provider: "pi", model: "chain/work" }],
		]);

		const config = readFileSync(join(home, "config.yaml"), "utf8");
		const second = runRoles(home);
		assert.equal(second.status, 0, second.stderr || second.stdout);
		assert.equal(readFileSync(join(home, "config.yaml"), "utf8"), config);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
