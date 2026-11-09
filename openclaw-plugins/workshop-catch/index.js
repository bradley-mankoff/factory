// Catches the skills OpenClaw's Skill Workshop learns for FactoryClaw (fac-60v.23).
//
// A learned skill copies steps from the skills the Factory installs and goes stale, but
// its save marks a place where FactoryClaw found those skills lacking. So each save is
// archived at once, before FactoryClaw can follow it, and filed as a Bead under the
// Factory's Epic asking whether FactoryClaw needs a new or changed skill. Other agents'
// learned skills are left alone.
import { readFile } from "node:fs/promises";

const AGENT = "factoryclaw";
const EPIC = "fac-60v";

export default {
  id: "workshop-catch",
  name: "Workshop catch",
  description: "Turns each skill the Skill Workshop learns for FactoryClaw into a Factory Bead, and archives the skill.",
  register(api) {
    const { factoryRepo, path } = api.pluginConfig;
    const run = (argv) =>
      api.runtime.system.runCommandWithTimeout(argv, { timeoutMs: 60_000, env: { ...process.env, PATH: path } });

    async function capture(skill) {
      // Read before archiving, which moves the skill's folder.
      const content = await readFile(skill.skillFile, "utf8");
      const archived = await run(["openclaw", "skills", "workshop", "archive", skill.name, "--agent", AGENT,
        "--reason", "Caught by the Factory's workshop-catch plugin and filed as a Bead", "--json"]);
      const outcome = archived.code === 0 ? "It was archived" : `Archiving it failed (${archived.stderr.trim()}), so archive it by hand`;
      const filed = await run(["bd", "-C", factoryRepo, "create", "--parent", EPIC, "--type", "task", "--priority", "2",
        "--title", `FactoryClaw learned a skill, ${skill.name}: does it need a new or changed Factory skill?`,
        "--description", `OpenClaw's Skill Workshop saved the learned skill \`${skill.name}\` for FactoryClaw ` +
          `(${new Date().toISOString()}). ${outcome}, so FactoryClaw no longer sees it. A save marks a place where ` +
          `FactoryClaw found the skills the Factory installs lacking. Decide whether one of those skills ` +
          `(factoryclaw/skills/, factoryclaw/AGENTS.md) needs changing or a new one is needed, and make the change ` +
          `there; close this Bead if not. The learned skill's SKILL.md, as saved:\n\n${content}`]);
      if (filed.code !== 0) api.logger.error(`workshop-catch: bd create failed for ${skill.name}: ${filed.stderr.trim()}`);
    }

    api.on("skill_changed", (event) => {
      const skill = event.after;
      if (event.source !== "workshop" || !skill || !skill.skillDir.includes(`/agents/${AGENT}/`)) return;
      // Not awaited: the Workshop holds the skill's lock until this handler returns,
      // and the archive waits on that lock.
      capture(skill).catch((err) => api.logger.error(`workshop-catch: ${skill.name}: ${err}`));
    });

    // The Workshop's notice to the Human ("💾 Learned: ... Say undo") is not one the
    // Human needs, and its undo no longer applies once the skill is archived.
    api.on("message_sending", (event, ctx) => {
      if (ctx.sessionKey?.startsWith(`agent:${AGENT}:`) && event.content?.startsWith("💾 Learned:")) {
        return { cancel: true, cancelReason: "workshop-catch filed the learned skill as a Factory Bead" };
      }
    });
  },
};
