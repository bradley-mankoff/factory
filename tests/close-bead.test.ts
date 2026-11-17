/**
 * bin/close-bead is the build Workflows' node after bin/land (fac-enj): a clean landing
 * needs no Project Manager judgment, so the Run writes its record on the Bead and closes
 * it before any Notice exists. A Bead whose Project Manager still has steps after the
 * landing carries the `after-landing` label, and the Run leaves it open. The seam is the
 * command: a temporary home, a Run's artifacts folder holding the `landing` note bin/land
 * writes, and a stand-in for the Beads CLI at the edge, which answers `bd show --json` with
 * the Bead's labels and writes down every call. Each case then runs bin/finish on the same
 * artifacts, so the test reads the Notice the Project Manager gets, not the script's words.
 * Nothing here looks inside bin/close-bead.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const closeBead = join(root, "bin", "close-bead");
const finish = join(root, "bin", "finish");

const landing = "merged pull request https://github.com/example/calc/pull/7 into main";

type Mac = {
	dir: string;
	labels: (labels: string[]) => void;
	note: (name: string, text: string) => void;
	close: () => { status: number | null; stdout: string; stderr: string };
	finish: () => { status: number | null; stdout: string; stderr: string };
	beadCalls: () => string[][];
	notice: () => string;
};

/**
 * One temporary Mac: a home for the Notice bin/tell-pm writes, a Run's artifacts folder,
 * and a stand-in `bd` that records every call and answers `show --json` with the labels the
 * test gave it, in the shape the Beads CLI prints.
 */
const makeMac = (): Mac => {
	const dir = mkdtempSync(join(tmpdir(), "factory-close-bead-"));
	const home = join(dir, "home");
	const bin = join(dir, "bin");
	const artifacts = join(dir, "artifacts");
	const log = join(dir, "bd-log");
	const labelsFile = join(dir, "labels.json");
	mkdirSync(home, { recursive: true });
	mkdirSync(bin, { recursive: true });
	mkdirSync(artifacts, { recursive: true });
	writeFileSync(
		join(bin, "bd"),
		[
			"#!/bin/sh",
			'for arg in "$@"; do printf \'%s\\n\' "$arg"; done >> "$BD_LOG"',
			"printf -- '---\\n' >> \"$BD_LOG\"",
			'if [ "$1" = show ]; then cat "$BD_LABELS"; fi',
			"",
		].join("\n"),
		{ mode: 0o755 },
	);

	const env = {
		...process.env,
		HOME: home,
		PATH: `${bin}:${process.env.PATH ?? ""}`,
		ARTIFACTS_DIR: artifacts,
		WORKFLOW_ID: "run-123",
		ARGUMENTS: "pm-calc · fac-1",
		BD_LOG: log,
		BD_LABELS: labelsFile,
	};
	const labels = (names: string[]) => writeFileSync(labelsFile, `${JSON.stringify([{ id: "fac-1", labels: names }])}\n`);
	const note = (name: string, text: string) => writeFileSync(join(artifacts, name), text);
	const close = () => spawnSync(closeBead, ["fac-1", "factory-build"], { cwd: dir, encoding: "utf8", env });
	const finishRun = () => spawnSync(finish, ["factory-build"], { cwd: dir, encoding: "utf8", env });
	const beadCalls = () => {
		const text = existsSync(log) ? readFileSync(log, "utf8") : "";
		return text
			.split("---\n")
			.filter((record) => record !== "")
			.map((record) => record.split("\n").slice(0, -1));
	};
	const notice = () => {
		const lines = readFileSync(join(home, ".local", "share", "factory", "notices", "pm-calc.md"), "utf8")
			.split("\n")
			.filter(Boolean);
		assert.equal(lines.length, 1, "a Run leaves one Notice line");
		return lines[0].replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} /, "");
	};

	return { dir, labels, note, close, finish: finishRun, beadCalls, notice };
};

test("a landed Bead with no after-landing label is closed with its Run record, and the Notice says so", () => {
	const mac = makeMac();
	try {
		mac.note("landing", `${landing}\n`);
		mac.labels([]);

		const result = mac.close();
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(mac.beadCalls(), [
			["show", "fac-1", "--json"],
			["comments", "add", "fac-1", `Run run-123, Workflow factory-build: ${landing}`],
			["close", "fac-1", "--reason", landing],
		]);

		const finished = mac.finish();
		assert.equal(finished.status, 0, finished.stderr);
		assert.equal(mac.notice(), `Run run-123 (factory-build) for Bead fac-1 ${landing}, and closed the Bead.`);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a landed Bead carrying after-landing is left open for those steps, and the Notice says so", () => {
	const mac = makeMac();
	try {
		mac.note("landing", `${landing}\n`);
		mac.labels(["after-landing"]);

		const result = mac.close();
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(mac.beadCalls(), [["show", "fac-1", "--json"]], "the Bead is read, never written");

		const finished = mac.finish();
		assert.equal(finished.status, 0, finished.stderr);
		assert.equal(
			mac.notice(),
			`Run run-123 (factory-build) for Bead fac-1 ${landing}, and left the Bead open for its after-landing steps.`,
		);
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});

test("a node that finds no landing note fails and leaves the Bead alone", () => {
	const mac = makeMac();
	try {
		mac.labels([]);

		const result = mac.close();
		assert.notEqual(result.status, 0, "a Run without a landing never closes its Bead");
		assert.match(result.stderr, /no landing/, "the failure says what is missing");
		assert.deepEqual(mac.beadCalls(), [], "the Bead is not even read");
	} finally {
		rmSync(mac.dir, { recursive: true, force: true });
	}
});
