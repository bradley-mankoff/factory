import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The seam is scripts/size, run against a throwaway git repo holding one file of each
// kind the counter treats specially. The repo is never committed: untracked files git
// does not ignore count, so fixtures need no commit.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fixtures: Record<string, string> = {
	// Module and function docstrings go; the multiline string assigned to message stays,
	// since it is code, and the trailing comment leaves its line counted.
	"hello.py": `"""Module docstring."""

# A comment.

def greet(name):
    """Greet someone."""
    message = """not a docstring,
still code"""
    return message  # trailing comment counts the line
`,
	// The full-line // comment and the /* */ block go; the trailing comment leaves its
	// line counted.
	"hello.js": `// full-line comment goes
/* block opens
   block continues */
const x = 1; // trailing comment counts the line
/* one-liner goes */
`,
	// A # heading is content in Markdown, unlike in code.
	"hello.md": `# Heading counts

Text counts.
`,
	// The shebang is a comment like any other # line.
	"hello.sh": `#!/bin/sh
# comment goes

echo hi
`,
};

test("scripts/size counts policy lines, not comments, docstrings or blanks", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-size-"));
	execFileSync("git", ["init", "-q", "-b", "main", root]);
	for (const [name, text] of Object.entries(fixtures)) {
		fs.writeFileSync(path.join(root, name), text);
	}
	const out = execFileSync("python3", [path.join(repoRoot, "scripts", "size"), root], {
		encoding: "utf-8",
	}).trim();
	// hello.py 4 (def, message lines, return) + hello.js 1 + hello.md 2 + hello.sh 1.
	assert.equal(out, "8");
});
