/**
 * The core Workflows ship with the Factory core (fac-qpv.6.2). The seam is installation:
 * scripts/install-workflows runs against a temporary Archon home, and the test reads the
 * result from the files there and through `archon workflow test`, never from the copy's
 * own code. A group beside the core group stands in for the person's own Workflows.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreGroup = join(root, "workflows", "factory");
// This Mac's Archon, which install.sh puts in the Factory's root: its binary and the
// provider plugins that `archon workflow test` needs.
const macArchon = process.env.ARCHON_HOME ?? join(homedir(), ".local", "share", "factory", "archon");

/** A temporary Archon home: links to this Mac's Archon, and an empty Workflow library. */
const makeArchonHome = (): string => {
	const home = mkdtempSync(join(tmpdir(), "factory-workflows-"));
	mkdirSync(join(home, "bin"));
	mkdirSync(join(home, "workflows"));
	symlinkSync(join(macArchon, "bin", "archon"), join(home, "bin", "archon"));
	symlinkSync(join(macArchon, "plugins"), join(home, "plugins"));
	return home;
};

const install = (home: string) =>
	spawnSync(join(root, "scripts", "install-workflows"), [join(home, "workflows")], { encoding: "utf8" });

/** Every file under a folder, as paths relative to it. */
const tree = (dir: string): string[] => {
	const out: string[] = [];
	const walk = (at: string) => {
		for (const entry of readdirSync(at).sort()) {
			const path = join(at, entry);
			if (statSync(path).isDirectory()) walk(path);
			else out.push(relative(dir, path));
		}
	};
	walk(dir);
	return out;
};

const runArchon = (home: string, args: string[]) =>
	spawnSync(join(home, "bin", "archon"), args, {
		cwd: home,
		encoding: "utf8",
		env: { ...process.env, ARCHON_HOME: home, ARCHON_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1", PI_SKIP_VERSION_CHECK: "1" },
	});

test("install replaces the core Workflows and leaves the person's own group alone", () => {
	const home = makeArchonHome();
	try {
		// The Mac's own Workflows, which install never writes to, and a stale copy of the
		// core group such as a Workflow removed from this repo leaves behind.
		const own = join(home, "workflows", "other", "mine", "mine.yaml");
		mkdirSync(dirname(own), { recursive: true });
		writeFileSync(own, "name: mine\n");
		const stale = join(home, "workflows", "factory", "retired", "retired.yaml");
		mkdirSync(dirname(stale), { recursive: true });
		writeFileSync(stale, "name: factory-retired\n");

		const result = install(home);
		assert.equal(result.status, 0, result.stderr || result.stdout);

		// The whole core group is this repo's copy, as real files Archon can read.
		assert.ok(tree(coreGroup).length > 0, "this repo holds the core Workflows");
		for (const name of ["factory-build", "factory-build-gated", "factory-register", "factory-research", "factory-task"]) {
			assert.equal(existsSync(join(home, "workflows", "factory", name, `${name}.yaml`)), true, `${name} is installed`);
			assert.ok(readdirSync(join(home, "workflows", "factory", name, "fixtures")).length > 0, `${name} has its fixtures`);
		}
		for (const flow of [
			"factory-build/flows/work",
			"factory-build-gated/flows/work",
			"factory-research/flows/look-a",
			"factory-research/flows/look-b",
			"factory-research/flows/combine",
			"factory-task/flows/task",
		]) {
			assert.equal(existsSync(join(home, "workflows", "factory", flow)), true, `${flow} is installed`);
		}
		for (const file of tree(coreGroup)) {
			const at = join(home, "workflows", "factory", file);
			assert.equal(lstatSync(at).isFile(), true, `${file} is a real file, not a link`);
			assert.equal(readFileSync(at, "utf8"), readFileSync(join(coreGroup, file), "utf8"), file);
		}
		assert.deepEqual(tree(join(home, "workflows", "factory")), tree(coreGroup), "the installed group holds this repo's files only");
		assert.equal(existsSync(stale), false, "the stale core file is gone");

		// The person's own group is untouched, file for file.
		assert.deepEqual(tree(join(home, "workflows", "other")), ["mine/mine.yaml"]);
		assert.equal(readFileSync(own, "utf8"), "name: mine\n");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("the landing Workflows land with bin/land, so this Mac's Profile decides how a Run's work lands", () => {
	const home = makeArchonHome();
	try {
		assert.equal(install(home).status, 0);
		for (const name of ["factory-build", "factory-build-gated", "factory-task"]) {
			const yaml = readFileSync(join(home, "workflows", "factory", name, `${name}.yaml`), "utf8");
			assert.match(yaml, /"\$HOME\/\.local\/share\/factory\/bin\/land"/, `${name} lands with bin/land`);
			assert.doesNotMatch(yaml, /gh pr /, `${name} runs no gh pull request command of its own`);
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("the library loads when a person's own group holds build.yaml beside the core", () => {
	const home = makeArchonHome();
	try {
		// A Workflow of the person's own, named the way a person names one: its file is
		// build.yaml, the name Archon refuses when another group's Workflow has it too. The
		// core's Workflow names are factory-prefixed, so its files must be as well (fac-8jx).
		const own = join(home, "workflows", "work", "build", "build.yaml");
		mkdirSync(dirname(own), { recursive: true });
		writeFileSync(
			own,
			[
				"name: work-build",
				"description: A Workflow of the person's own, called build.",
				"provider: pi",
				"nodes:",
				"  - id: do",
				'    bash: echo hi',
				"",
			].join("\n"),
		);
		mkdirSync(join(dirname(own), "fixtures"));
		writeFileSync(join(dirname(own), "fixtures", "answered.stubs.yaml"), 'do: "hi"\n');
		assert.equal(install(home).status, 0);

		const result = runArchon(home, ["workflow", "test"]);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		for (const name of ["factory-build", "factory-build-gated", "factory-register", "factory-research", "factory-task"]) {
			assert.match(result.stdout, new RegExp(`→ ${name}\\b`), `${name} loaded beside the person's build.yaml`);
		}
		assert.match(result.stdout, /→ work-build\b/, "the person's own build Workflow loads too");
		assert.match(result.stdout, /0 failed/);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("archon workflow test passes on every core Workflow after install", () => {
	const home = makeArchonHome();
	try {
		assert.equal(install(home).status, 0);
		const result = runArchon(home, ["workflow", "test"]);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		for (const name of ["factory-build", "factory-build-gated", "factory-register", "factory-research", "factory-task"]) {
			assert.match(result.stdout, new RegExp(name), `${name} was tested`);
		}
		assert.match(result.stdout, /0 failed/);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
