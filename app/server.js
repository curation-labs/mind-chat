#!/usr/bin/env node
/**
 * mind-chat app server
 *
 * Manages Docker containers (one per session) for harari-mind, mind-runner, mind-shell.
 * Serves the frontend and proxies chat requests to containers.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... node server.js
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT  = parseInt(process.env.PORT || "4000", 10);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("Error: OPENROUTER_API_KEY env var required");
  console.error("Usage: OPENROUTER_API_KEY=sk-or-... node server.js");
  process.exit(1);
}

// ── Image configs ─────────────────────────────────────────────────────────────
const IMAGE_CONFIGS = {
  "harari-mind": {
    image:       "harari-mind",
    entrypoint:  "/opt/mastra-runtime/server.js",
    agentId:     "harari-mind",
    startupMs:   8000,   // baked card — fast
    description: "Skills baked in at build time",
  },
  "mind-runner": {
    image:       "mind-runner",
    entrypoint:  "/opt/mastra-runtime/server.js",
    agentId:     "mind",
    startupMs:   8000,
    description: "Card cloned via drwn at build time",
  },
  "mind-shell": {
    image:       "mind-shell",
    entrypoint:  "/opt/mastra-runtime/server-shell.js",
    agentId:     "mind",
    startupMs:   30000,  // clones card at runtime — slower
    description: "Card loaded at runtime via CARD_REPO",
    requiresCardRepo: true,
  },
};

// ── Sessions ──────────────────────────────────────────────────────────────────
const sessions = new Map();
let nextPort = 3100;

function allocatePort() { return nextPort++; }

async function startContainer(sessionId, { image, model, length, cardRepo }) {
  const cfg  = IMAGE_CONFIGS[image];
  if (!cfg) throw new Error(`Unknown image: ${image}`);
  const port = allocatePort();

  const envFlags = [
    `-e OPENROUTER_API_KEY=${OPENROUTER_API_KEY}`,
    `-e SERVER_PORT=3001`,
    `-e MASTRA_AGENT_ID=${cfg.agentId}`,
    cfg.requiresCardRepo ? `-e CARD_REPO=${cardRepo}` : "",
  ].filter(Boolean).join(" ");

  const cmd = `docker run -d --platform linux/amd64 --entrypoint node ${envFlags} -p ${port}:3001 ${cfg.image} ${cfg.entrypoint}`;
  const containerId = execSync(cmd).toString().trim();

  console.log(`[${sessionId}] starting ${image} on port ${port} (${containerId.slice(0,12)})…`);
  await waitForHealth(`http://localhost:${port}/health`, cfg.startupMs);

  sessions.set(sessionId, { containerId, port, image, model, length });
  console.log(`[${sessionId}] ready`);
  return { sessionId, port };
}

async function waitForHealth(url, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 600));
  }
  throw new Error(`Container not healthy after ${timeout / 1000}s`);
}

function stopContainer(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  try { execSync(`docker rm -f ${s.containerId}`, { stdio: "ignore" }); } catch {}
  console.log(`[${sessionId}] stopped`);
  sessions.delete(sessionId);
}

process.on("SIGINT",  () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
function cleanup() { for (const [id] of sessions) stopContainer(id); }

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch(e) { reject(e); } });
    req.on("error", reject);
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const { method, url } = req;
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (method === "GET" && url === "/") {
    const html = readFileSync(join(__dir, "public", "index.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  if (method === "GET" && url === "/api/images") {
    json(res, 200, { images: Object.entries(IMAGE_CONFIGS).map(([id, c]) => ({
      id, description: c.description,
      requiresCardRepo: !!c.requiresCardRepo,
      startupMs: c.startupMs,
    }))});
    return;
  }

  if (method === "GET" && url === "/api/models") {
    json(res, 200, { models: MODELS });
    return;
  }

  if (method === "POST" && url === "/api/session") {
    const { image = "harari-mind", model = "anthropic/claude-sonnet-4-5", length = "medium", cardRepo } = await readBody(req);
    const sessionId = randomUUID();
    try {
      await startContainer(sessionId, { image, model, length, cardRepo });
      json(res, 200, { sessionId, image, model, length });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
    return;
  }

  const chatMatch = url.match(/^\/api\/session\/([^/]+)\/chat$/);
  if (method === "POST" && chatMatch) {
    const s = sessions.get(chatMatch[1]);
    if (!s) { json(res, 404, { error: "Session not found" }); return; }
    const { messages, model, length } = await readBody(req);
    try {
      const resp = await fetch(`http://localhost:${s.port}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model: model || s.model, length: length || s.length }),
      });
      json(res, resp.status, await resp.json());
    } catch (err) {
      json(res, 500, { error: err.message });
    }
    return;
  }

  const delMatch = url.match(/^\/api\/session\/([^/]+)$/);
  if (method === "DELETE" && delMatch) {
    stopContainer(delMatch[1]);
    json(res, 200, { ok: true });
    return;
  }

  res.writeHead(404); res.end();
});

// ── Model list ────────────────────────────────────────────────────────────────
const MODELS = [
  { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5",  provider: "Anthropic" },
  { id: "anthropic/claude-opus-4",     name: "Claude Opus 4",       provider: "Anthropic" },
  { id: "openai/gpt-5.4",              name: "GPT-5.4",             provider: "OpenAI"    },
  { id: "openai/gpt-4o",               name: "GPT-4o",              provider: "OpenAI"    },
  { id: "google/gemini-3.5-flash",     name: "Gemini 3.5 Flash",    provider: "Google"    },
  { id: "deepseek/deepseek-v4-pro",    name: "DeepSeek V4 Pro",     provider: "DeepSeek"  },
  { id: "meta-llama/llama-4-scout",    name: "Llama 4 Scout",       provider: "Meta"      },
  { id: "x-ai/grok-4.20",             name: "Grok 4.20",            provider: "xAI"       },
];

server.listen(PORT, () => {
  console.log(`\n🧠 Mind Chat running at http://localhost:${PORT}`);
  console.log(`   OPENROUTER_API_KEY: ${OPENROUTER_API_KEY.slice(0,12)}...`);
  console.log(`   Images: ${Object.keys(IMAGE_CONFIGS).join(", ")}`);
  console.log(`   Press Ctrl+C to stop\n`);
});
