#!/usr/bin/env node
// mind-shell entrypoint — installs card at runtime, then starts interactive chat.
//
// Required env vars:
//   CARD_REPO          git+https://github.com/org/repo.git#vX.Y.Z
//   OPENROUTER_API_KEY sk-or-...
// Optional:
//   MIND_MODEL         default: anthropic/claude-sonnet-4-5

import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { exit, stdout, stderr } from "node:process";

const CARD_REPO = process.env.CARD_REPO;
const MIND_ROOT = process.env.MIND_ROOT || "/opt/mind";
const MASTRA_RUNTIME_ROOT = process.env.MASTRA_RUNTIME_ROOT || "/opt/mastra-runtime";
const MIND_MODEL = process.env.MIND_MODEL || "anthropic/claude-sonnet-4-5";

if (!CARD_REPO) {
  stderr.write("Error: CARD_REPO is required.\n");
  stderr.write("Example: docker run -e CARD_REPO='git+https://github.com/curation-labs/harari-mind.git#v1.2.1' ...\n");
  exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
  stderr.write("Error: OPENROUTER_API_KEY is required.\n");
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
if (!cardName) {
  stderr.write(`Error: could not detect card name.\ndrwn output:\n${cloneOut}\n`);
  exit(1);
}

sh(`drwn card add "${cardName}"`);
sh("drwn write");
stdout.write(`Card ready: ${cardName}\n\n`);

// ── Generate Mastra agent ─────────────────────────────────────────────────────
execSync("node /tmp/generate-agent.js", {
  stdio: "inherit",
  env: {
    ...process.env,
    SKILLS_DIR: `${MIND_ROOT}/.claude/skills`,
    AGENT_OUT: `${MASTRA_RUNTIME_ROOT}/agents/mind/index.js`,
    AGENT_NAME: "mind",
    AGENT_PROVIDER: "openrouter",
    AGENT_MODEL: MIND_MODEL,
  },
});

// ── Load agent ────────────────────────────────────────────────────────────────
const modulePath = join(MASTRA_RUNTIME_ROOT, "agents", "mind", "index.js");
const mod = await import(pathToFileURL(modulePath).href);
const agent = mod.default ?? mod.agent ?? mod;

if (!agent || typeof agent.generate !== "function") {
  stderr.write("Error: agent module did not export a generate-able object.\n");
  exit(1);
}

// ── Response length ───────────────────────────────────────────────────────────
const RESPONSE_LENGTH = (process.env.RESPONSE_LENGTH || "medium").toLowerCase();
const lengthDirectives = {
  brief:  "RESPONSE LENGTH: 1-2 sentences only. No paragraphs. Telegraph-style.",
  short:  "RESPONSE LENGTH: One short paragraph, 3-4 sentences maximum.",
  medium: "RESPONSE LENGTH: 2-3 paragraphs maximum. Be substantive but concise.",
  long:   "RESPONSE LENGTH: Respond at full depth. Use as many paragraphs as the topic warrants.",
};
const lengthDirective = lengthDirectives[RESPONSE_LENGTH] ?? `RESPONSE LENGTH: ${RESPONSE_LENGTH}`;

// ── Chat REPL ─────────────────────────────────────────────────────────────────
const messages = [{ role: "system", content: lengthDirective }];

async function chat(userText) {
  messages.push({ role: "user", content: userText });
  const result = await agent.generate(messages);
  const text = result.text ?? result.object?.result ?? "";
  messages.push({ role: "assistant", content: text });
  return text;
}

const greeting = await chat(
  "Begin the conversation. Introduce yourself in 2-3 sentences in your own voice, then ask: What would you like to explore?"
);
stdout.write(`${greeting}\n\n`);

const rl = createInterface({ input: process.stdin, output: stdout });
rl.setPrompt("You: ");
rl.prompt();

let busy = false;

rl.on("line", async (raw) => {
  if (busy) return;
  const input = raw.trim();
  if (!input) { rl.prompt(); return; }
  if (input === "exit" || input === "quit") { stdout.write("Goodbye.\n"); exit(0); }

  busy = true;
  rl.pause();
  try {
    const response = await chat(input);
    stdout.write(`\n${response}\n\n`);
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
  }
  busy = false;
  rl.resume();
  rl.prompt();
});

rl.on("close", () => { stdout.write("\n"); exit(0); });
