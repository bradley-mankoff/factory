/**
 * A stand-in for pi's own turn-end report: at `agent_settled` it reports the pane idle,
 * the way herdr's pi integration does (`pane report-agent ... --source herdr:pi --state
 * idle`).
 *
 * The blocked-mark test loads it after the extension under test, which is the order a
 * Project Manager's session has, since pi loads the extensions named on its command line
 * before the ones in the user's pi folder (fac-3mz.5). Both reports go through the test's
 * stand-in `herdr`, so the test reads which one reached herdr last.
 *
 * Its state is `idle` and never `working`, so it stands only for the report that ends a
 * turn; a test that needs a turn's start writes nothing.
 */
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function piTurnEndReport(pi: ExtensionAPI): void {
	pi.on("agent_settled", () => {
		const pane = process.env.HERDR_PANE_ID;
		if (!pane) return;
		spawnSync("herdr", ["pane", "report-agent", pane, "--source", "herdr:pi", "--agent", "pi", "--state", "idle"]);
	});
}
