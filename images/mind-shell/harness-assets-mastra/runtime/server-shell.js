#!/usr/bin/env node
// mind-shell HTTP server — installs card at startup, then serves chat requests.
// Same API as server.js in harari-mind/mind-runner.

import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { exit, stdout, stderr } from "node:process";
import { Agent } from "@mastra/core/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const CARD_REPO        = process.env.CARD_REPO;
const MIND_ROOT        = process.env.MIND_ROOT        || "/opt/mind";
const MASTRA_RUNTIME_ROOT = process.env.MASTRA_RUNTIME_ROOT || "/opt/mastra-runtime";
const MIND_MODEL       = process.env.MIND_MODEL       || "anthropic/claude-sonnet-4-5";
const PORT             = parseInt(process.env.SERVER_PORT || "3001", 10);

if (!CARD_REPO) {
  stderr.write("Error: CARD_REPO env var is required.\n");
  exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
  stderr.write("Error: OPENROUTER_API_KEY env var is required.\n");
  exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: "inherit", cwd: MIND_ROOT, ...opts });
}

// ── Install card ──────────────────────────────────────────────────────────────
stdout.write(`Loading card: ${CARD_REPO}\n`);
sh("drwn init --non-interactive --no-default-catalogs");
const cloneOut = execSync(`drwn card clone "${CARD_REPO}"`, { cwd: MIND_ROOT }).toString();
const cardName = cloneOut.match(/^Cloned (@[^\s@]+)@/m)?.[1];
if (!cardName) { stderr.write(`Could not detect card name.\n`); exit(1); }
sh(`drwn card add "${cardName}"`);
sh("drwn write");
stdout.write(`Card ready: ${cardName}\n`);

// ── Generate agent ────────────────────────────────────────────────────────────
execSync("node /tmp/generate-agent.js", {
  stdio: "inherit",
  env: {
    ...process.env,
    SKILLS_DIR: `${MIND_ROOT}/.claude/skills`,
    AGENT_OUT:  `${MASTRA_RUNTIME_ROOT}/agents/mind/index.js`,
    AGENT_NAME: "mind",
    AGENT_PROVIDER: "openrouter",
    AGENT_MODEL: MIND_MODEL,
  },
});

// ── Load instructions ─────────────────────────────────────────────────────────
const modulePath = join(MASTRA_RUNTIME_ROOT, "agents", "mind", "index.js");
const mod = await import(pathToFileURL(modulePath).href);
const bakedInstructions = mod.instructions;
const defaultModel      = mod.defaultModel ?? MIND_MODEL;

// ── Agent cache ───────────────────────────────────────────────────────────────
const agentCache = new Map();
function getAgent(model) {
  if (!agentCache.has(model)) {
    agentCache.set(model, new Agent({
      name: "mind",
      model: createOpenRouter()(model),
      instructions: bakedInstructions,
    }));
  }
  return agentCache.get(model);
}

const LENGTH_DIRECTIVES = {
  brief:  "RESPONSE LENGTH: 1-2 sentences only. No paragraphs. Telegraph-style.",
  short:  "RESPONSE LENGTH: One short paragraph, 3-4 sentences maximum.",
  medium: "RESPONSE LENGTH: 2-3 paragraphs maximum. Be substantive but concise.",
  long:   "RESPONSE LENGTH: Respond at full depth. Use as many paragraphs as needed.",
};

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", card: cardName, defaultModel }));
    return;
  }

  if (req.method === "POST" && req.url === "/chat") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { messages = [], model, length = "medium" } = JSON.parse(body);
        const agent = getAgent(model || defaultModel);
        const lengthMsg = LENGTH_DIRECTIVES[length] ?? LENGTH_DIRECTIVES.medium;
        const result = await agent.generate([
          { role: "system", content: lengthMsg },
          ...messages,
        ]);
        const text = result.text ?? result.object?.result ?? "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text, model: model || defaultModel }));
      } catch (err) {
        stderr.write(`Chat error: ${err.stack}\n`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  stdout.write(`ready on :${PORT}\n`);
});
