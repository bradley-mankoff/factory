/**
 * bin/node-prompts puts a Flows marker in each checked node's prompt (fac-qpv.3.1). The
 * marker is the line the pi-flows package reads when an agent tries to finish (fac-qpv.8.1).
 * The seam is the script's output for a Workflow folder; nothing here looks inside it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("bin/node-prompts puts a marker naming the node, Bead, folders and check in each checked node's prompt", () => {
	const dir = mkdtempSync(join(tmpdir(), "factory-node-prompts-"));
	try {
		const workflow = join(dir, "workflows", "factory", "build");
		const flows = join(workflow, "flows");
		const artifacts = join(dir, "artifacts");
		mkdirSync(flows, { recursive: true });
		mkdirSync(artifacts, { recursive: true });
		writeFileSync(join(flows, "work"), "changed-files\n");
		writeFileSync(join(flows, "spec"), "check-passes\n");
		const result = spawnSync(join(root, "bin", "node-prompts"), [workflow], {
			encoding: "utf8",
			env: {
				...process.env,
				ARGUMENTS: "pm-factory · fac-qpv.3.1",
				ARTIFACTS_DIR: artifacts,
				FACTORY_CHECK: "python3 -m unittest",
			},
		});
		assert.equal(result.status, 0, result.stderr);
		const prompts = JSON.parse(result.stdout) as Record<string, string>;
		assert.deepEqual(
			Object.fromEntries(
				["marker_work", "marker_spec"].map((key) => [key, JSON.parse(prompts[key].slice("FLOWS ".length))]),
			),
			{
				marker_work: {
					node: "work",
					bead: "fac-qpv.3.1",
					flows: realpathSync(flows),
					artifacts,
					check: "python3 -m unittest",
				},
				marker_spec: {
					node: "spec",
					bead: "fac-qpv.3.1",
					flows: realpathSync(flows),
					artifacts,
					check: "python3 -m unittest",
				},
			},
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
