/**
 * The Chains moved to the pi-chains package (fac-qpv.8.1), but the Factory still owns its
 * Chains file and the Scout's definition. The seam is those two files, read the way the
 * package reads them: `config/chains.json` is copied to the path the Profile names, and
 * the Scout's model names a role in that file. Nothing here loads the package.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chainsFile = join(root, "config", "chains.json");

/** The thinking levels pi accepts, from its own `--thinking` list. */
const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

type Entry = { model: string; thinking: string; seats?: string[] };
type Chains = Record<string, Entry[]>;

/** The Chains file install copies to the path the Profile names. */
const readChains = (): Chains => JSON.parse(readFileSync(chainsFile, "utf8")) as Chains;

test("every role the Factory names has a Chain of models and thinking levels", () => {
	// The roles the Factory names: the Project Manager, the spec review, the work and
	// standards agents, and the Scout.
	const chains = readChains();
	assert.deepEqual(Object.keys(chains).sort(), ["pm", "scout", "spec-review", "work"]);
	for (const [role, entries] of Object.entries(chains)) {
		assert.ok(Array.isArray(entries) && entries.length > 0, `${role} is an ordered list of entries`);
		for (const entry of entries) {
			assert.match(entry.model, /^[a-z0-9-]+\/[A-Za-z0-9.-]+$/, `${role}'s model is provider/model`);
			assert.ok(levels.includes(entry.thinking), `${role}'s thinking level is one pi offers`);
		}
	}
});

test("the Factory's Chains are the personal Mac's from the Epic, with maximum as its model's highest level", () => {
	// The Epic's personal Chains (fac-qpv.1). "Maximum" is written as the highest level
	// pi's catalog offers that model: Muse Spark 1.3 tops out at xhigh (its catalog entry
	// maps max to null), and DeepSeek v4.1 Flash offers max.
	const shipped = readChains();
	const pm = [
		{ model: "claude-bridge/claude-opus-5-5", thinking: "medium" },
		{ model: "opencode-go/muse-spark-1.3-contributor", thinking: "xhigh" },
	];
	assert.deepEqual(shipped, {
		pm,
		"spec-review": pm,
		work: [{ model: "opencode-go/deepseek-v4.1-flash", thinking: "max" }],
		scout: [{ model: "opencode-go/deepseek-v4.1-flash", thinking: "max" }],
	});
});

test("the Scout runs on the Scout Chain: its agent definition names the role, not a model", () => {
	const definition = readFileSync(join(root, "pi-agent", "agents", "scout.md"), "utf8");
	const model = /^model:\s*(\S+)\s*$/m.exec(definition)?.[1];
	assert.equal(model, "chain/scout", "the Scout's agent definition names the Scout Chain");
	const shipped = readChains();
	assert.ok(shipped.scout, "the Chains file install copies has the Scout's role");
});
