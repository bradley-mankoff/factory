/**
 * herdr's own pi sound and pop-ups, turned off by install (fac-o2r, fac-o2r.1). With
 * [ui.sound.agents] pi = "off" and [ui.toast] delivery = "off" in herdr's settings, a pi
 * turn's ending makes no sound of herdr's and shows no pop-up, so pi-herdr-ding is the only
 * thing a pi turn sounds like, and a Project Manager's pane can hold that sound while its
 * Runs move. The seam is installation: scripts/install.sh runs on a temporary Mac that
 * already has herdr and a settings file of its own, and the test reads the file install
 * leaves. Nothing here looks inside install.sh.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { makeMac } from "./fixtures/install-mac.ts";

/** Herdr's settings as this Mac has them: a toast delivery to change, two other tables of
 * the person's, and an array of tables after them, so moving the new table to the end
 * cannot break the file or take a line of theirs with it. */
const HERDR_SETTINGS = `onboarding = false

[ui.toast]
delivery = "system"

[ui]
status_indicators = "symbols"
prompt_new_tab_name = false

[[keys.command]]
key = "prefix+e"
type = "plugin_action"
command = "herdr-sidebar.open-sidebar"
description = "toggle file sidebar"

[experimental]
kitty_graphics = true
`;

/** What the file holds after install: delivery turned off where it stood, and the pi sound
 * turned off in a table of its own, with every other line where it was. */
const WITH_SOUND_AND_POPUPS_OFF = `onboarding = false

[ui.toast]
delivery = "off"

[ui]
status_indicators = "symbols"
prompt_new_tab_name = false

[[keys.command]]
key = "prefix+e"
type = "plugin_action"
command = "herdr-sidebar.open-sidebar"
description = "toggle file sidebar"

[experimental]
kitty_graphics = true

[ui.sound.agents]
pi = "off"
`;

/** Herdr's settings file on a temporary Mac. */
const settingsFile = (home: string): string => join(home, ".config", "herdr", "config.toml");

/** Gives the temporary Mac the herdr settings a Mac that has run herdr has. */
const writeSettings = (home: string, text: string): void => {
	mkdirSync(dirname(settingsFile(home)), { recursive: true });
	writeFileSync(settingsFile(home), text);
};

test("install turns herdr's own pi sound and pop-ups off and keeps every other line", () => {
	const mac = makeMac();
	try {
		writeSettings(mac.home, HERDR_SETTINGS);

		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(readFileSync(settingsFile(mac.home), "utf8"), WITH_SOUND_AND_POPUPS_OFF);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("install gives a Mac that has herdr but has never run it the same two settings", () => {
	// Herdr writes its settings file when it first runs; a Mac that installed the Factory
	// before starting herdr still gets the sound and pop-ups off, so the first turn it does
	// play is a quiet one.
	const mac = makeMac();
	try {
		const result = mac.install();
		assert.equal(result.status, 0, result.stderr || result.stdout);

		assert.equal(readFileSync(settingsFile(mac.home), "utf8"), '[ui.sound.agents]\npi = "off"\n\n[ui.toast]\ndelivery = "off"\n');
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});

test("a second install leaves herdr's settings file as the first left it", () => {
	const mac = makeMac();
	try {
		writeSettings(mac.home, HERDR_SETTINGS);
		const first = mac.install();
		assert.equal(first.status, 0, first.stderr || first.stdout);
		const afterFirst = readFileSync(settingsFile(mac.home), "utf8");

		const second = mac.install();
		assert.equal(second.status, 0, second.stderr || second.stdout);

		assert.equal(readFileSync(settingsFile(mac.home), "utf8"), afterFirst);
	} finally {
		rmSync(dirname(mac.home), { recursive: true, force: true });
	}
});
