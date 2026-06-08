#!/usr/bin/env node
// Container HTTP server — accepts { messages, model, length } per request.
// Stays alive for the session duration. Model is created on-demand and cached.
//
// Start: node /opt/mastra-runtime/server.js
// POST /chat  { messages: [{role,content}], model: string, length: string }
// GET  /health

import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { exit, stdout, stderr } from "node:process";
import { Agent } from "@mastra/core/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const runtimeRoot = process.env.MASTRA_RUNTIME_ROOT || "/opt/mastra-runtime";
const agentId     = process.env.MASTRA_AGENT_ID      || "harari-mind";
const PORT        = parseInt(process.env.SERVER_PORT  || "3001", 10);

const LENGTH_DIRECTIVES = {
  brief:  "RESPONSE LENGTH: 1-2 sentences only. No paragraphs. Telegraph-style.",
  short:  "RESPONSE LENGTH: One short paragraph, 3-4 sentences maximum.",
  medium: "RESPONSE LENGTH: 2-3 paragraphs maximum. Be substantive but concise.",
  long:   "RESPONSE LENGTH: Respond at full depth. Use as many paragraphs as needed.",
};

// ── Load baked instructions ───────────────────────────────────────────────────
const modulePath = join(runtimeRoot, "agents", agentId, "index.js");
let bakedInstructions, defaultModel;
try {
  const mod = await import(pathToFileURL(modulePath).href);
  bakedInstructions = mod.instructions;
  defaultModel      = mod.defaultModel ?? "anthropic/claude-sonnet-4-5";
} catch (err) {
  stderr.write(`Failed to load agent module: ${err.message}\n`);
  exit(1);
}

// ── Agent cache (one per model) ───────────────────────────────────────────────
const agentCache = new Map();
function getAgent(model) {
  if (!agentCache.has(model)) {
    agentCache.set(model, new Agent({
      name: agentId,
      model: createOpenRouter()(model),
      instructions: bakedInstructions,
    }));
  }
  return agentCache.get(model);
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", agentId, defaultModel }));
    return;
  }

  if (req.method === "POST" && req.url === "/chat") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { messages = [], model, length = "medium" } = JSON.parse(body);
        const resolvedModel = model || defaultModel;
        const agent = getAgent(resolvedModel);

        const lengthMsg = LENGTH_DIRECTIVES[length] ?? LENGTH_DIRECTIVES.medium;
        const allMessages = [
          { role: "system", content: lengthMsg },
          ...messages,
        ];

        const result = await agent.generate(allMessages);
        const text = result.text ?? result.object?.result ?? "";

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text, model: resolvedModel }));
      } catch (err) {
        stderr.write(`Chat error: ${err.stack}\n`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  stdout.write(`ready on :${PORT}\n`);
});
