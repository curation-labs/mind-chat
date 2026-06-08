#!/usr/bin/env node
/**
 * generate-agent.js
 *
 * Reads all skills from $SKILLS_DIR, builds the Mastra agent instructions,
 * and writes the agent ES module to $AGENT_OUT.
 *
 * Skill structure expected:
 *   harari-mind/SKILL.md    — identity + activation directive (required)
 *   l1-<name>/SKILL.md      — L1 Soul Values
 *   l2-<name>/SKILL.md      — L2 Principles
 *   l3-<name>/SKILL.md      — L3 World Models
 *
 * Run during Docker build:
 *   SKILLS_DIR=/opt/harari-mind/.claude/skills \
 *   AGENT_OUT=/opt/mastra-runtime/agents/harari-mind/index.js \
 *   AGENT_NAME=harari-mind \
 *   AGENT_PROVIDER=openrouter \
 *   AGENT_MODEL=anthropic/claude-sonnet-4-5 \
 *   node generate-agent.js
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const SKILLS_DIR = process.env.SKILLS_DIR;
const AGENT_OUT  = process.env.AGENT_OUT;
const AGENT_NAME = process.env.AGENT_NAME  ?? "mind";
const MODEL      = process.env.AGENT_MODEL ?? "anthropic/claude-sonnet-4-5";
const PROVIDER   = process.env.AGENT_PROVIDER ?? "openrouter";

if (!SKILLS_DIR || !AGENT_OUT) {
  console.error("Error: SKILLS_DIR and AGENT_OUT must be set");
  process.exit(1);
}

const IDENTITY = "harari-mind";

function readSkill(dir) {
  try { return readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf8"); } catch { return null; }
}
function frontmatterField(md, field) {
  const m = md.match(new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, "m"));
  return m?.[1]?.trim() ?? "";
}
function stripFrontmatter(md) {
  return md.replace(/^---[\s\S]*?---\n/, "").trim();
}

const allDirs = readdirSync(SKILLS_DIR).sort();

// ── 1. Identity skill ─────────────────────────────────────────────────────────
let instructions = "";
const identityMd = readSkill(IDENTITY);
if (identityMd) {
  instructions += `${stripFrontmatter(identityMd)}\n\n`;
} else {
  console.warn("warn: harari-mind identity skill not found");
}

// ── 2. L1 Soul Values ─────────────────────────────────────────────────────────
const l1Dirs = allDirs.filter(d => d.startsWith("l1-"));
if (l1Dirs.length > 0) {
  instructions += `---\n# L1 SOUL VALUES (${l1Dirs.length})\nThese are your ontological anchors. They are non-negotiable.\n\n`;
  for (const dir of l1Dirs) {
    const md = readSkill(dir);
    if (!md) continue;
    const label = frontmatterField(md, "description") || dir;
    instructions += `## ${label}\n${stripFrontmatter(md)}\n\n`;
  }
}

// ── 3. L2 Principles ──────────────────────────────────────────────────────────
const l2Dirs = allDirs.filter(d => d.startsWith("l2-"));
if (l2Dirs.length > 0) {
  instructions += `---\n# L2 PRINCIPLES (${l2Dirs.length})\nThese are your decision rules and analytical methods.\n\n`;
  for (const dir of l2Dirs) {
    const md = readSkill(dir);
    if (!md) continue;
    const label = frontmatterField(md, "description") || dir;
    instructions += `## ${label}\n${stripFrontmatter(md)}\n\n`;
  }
}

// ── 4. L3 World Models ────────────────────────────────────────────────────────
const l3Dirs = allDirs.filter(d => d.startsWith("l3-"));
if (l3Dirs.length > 0) {
  instructions += `---\n# L3 WORLD MODELS (${l3Dirs.length})\nThese are the frameworks through which you interpret everything.\n\n`;
  for (const dir of l3Dirs) {
    const md = readSkill(dir);
    if (!md) continue;
    const label = frontmatterField(md, "description") || dir;
    instructions += `## ${label}\n${stripFrontmatter(md)}\n\n`;
  }
}

// ── 5. L4 Reflections ─────────────────────────────────────────────────────────
const l4Dirs = allDirs.filter(d => d.startsWith("l4-"));
if (l4Dirs.length > 0) {
  instructions += `---\n# L4 REFLECTIONS (${l4Dirs.length})\nCross-cutting tensions and unresolved contradictions in my thinking.\n\n`;
  for (const dir of l4Dirs) {
    const md = readSkill(dir);
    if (!md) continue;
    const label = frontmatterField(md, "description") || dir;
    instructions += `## ${label}\n${stripFrontmatter(md)}\n\n`;
  }
}

// ── 6. L5 Source Impressions ──────────────────────────────────────────────────
const l5Dirs = allDirs.filter(d => d.startsWith("l5-"));
if (l5Dirs.length > 0) {
  instructions += `---\n# L5 SOURCE IMPRESSIONS (${l5Dirs.length})\nDirect observations from each book — the evidentiary base.\n\n`;
  for (const dir of l5Dirs) {
    const md = readSkill(dir);
    if (!md) continue;
    const label = frontmatterField(md, "description") || dir;
    const source = frontmatterField(md, "source") || "";
    instructions += `## ${label}${source ? ` [${source}]` : ""}\n${stripFrontmatter(md)}\n\n`;
  }
}

// ── 8. Escape for JS template literal ─────────────────────────────────────────
const escaped = instructions
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

// ── 9. Provider config ────────────────────────────────────────────────────────
const providerConfigs = {
  openrouter: {
    importLine: `import { createOpenRouter } from "@openrouter/ai-sdk-provider";`,
    modelExpr:  `createOpenRouter()("${MODEL}")`,
  },
  anthropic: {
    importLine: `import { anthropic } from "@ai-sdk/anthropic";`,
    modelExpr:  `anthropic("${MODEL}")`,
  },
  openai: {
    importLine: `import { openai } from "@ai-sdk/openai";`,
    modelExpr:  `openai("${MODEL}")`,
  },
};
const pCfg = providerConfigs[PROVIDER] ?? providerConfigs.openrouter;

// ── 10. Write agent module ────────────────────────────────────────────────────
const agentJs = `// Auto-generated by generate-agent.js — do not edit manually
// Agent: ${AGENT_NAME}  Provider: ${PROVIDER}  Model: ${MODEL}
// Skills: identity(1) + L1(${l1Dirs.length}) + L2(${l2Dirs.length}) + L3(${l3Dirs.length}) + L4(${l4Dirs.length}) + L5(${l5Dirs.length})
import { Agent } from "@mastra/core/agent";
${pCfg.importLine}

export const instructions = \`${escaped}\`;
export const defaultModel = "${MODEL}";

const agent = new Agent({
  name: "${AGENT_NAME}",
  model: ${pCfg.modelExpr},
  instructions,
});

export default agent;
`;

mkdirSync(dirname(AGENT_OUT), { recursive: true });
writeFileSync(AGENT_OUT, agentJs);
console.log(`Generated agent: ${AGENT_OUT} (${agentJs.length} bytes)`);
console.log(`  Provider: ${PROVIDER}  Model: ${MODEL}`);
console.log(`  Skills: 1 identity + ${l1Dirs.length} L1 + ${l2Dirs.length} L2 + ${l3Dirs.length} L3 + ${l4Dirs.length} L4 + ${l5Dirs.length} L5`);
