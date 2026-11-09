// Spike guard v3: blocks bash commands containing GUARDTEST. Per-node scope comes from the
// handler's own ctx: a node whose system prompt contains SPIKE-GUARD-OFF is let through.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync } from "node:fs";

const LOG = "/private/tmp/claude-501/-Users-bradley-mankoff-Developer-graph-engineering/c8edddba-72ee-4e72-a872-406d607eda03/scratchpad/archon-pi-spike/guard.log";
const log = (s: string) => { try { appendFileSync(LOG, new Date().toISOString() + " " + s + "\n"); } catch {} };

export default function (pi: ExtensionAPI) {
	log("loaded pid=" + process.pid);
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		let off = false, how = "";
		try { off = ctx.getSystemPrompt().includes("SPIKE-GUARD-OFF"); how = "ctx.getSystemPrompt"; }
		catch (e) { how = "ctx-threw:" + String(e).slice(0, 60); }
		const cmd = String((event.input as { command?: string }).command ?? "");
		const block = !off && cmd.includes("GUARDTEST");
		log("bash how=" + how + " off=" + off + " block=" + block + " cwd=" + ctx.cwd.slice(-20) + " cmd=" + cmd.slice(0, 40));
		if (block) return { block: true, reason: "spike guard blocked" };
	});
}
