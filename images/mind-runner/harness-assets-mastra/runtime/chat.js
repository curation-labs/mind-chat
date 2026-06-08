#!/usr/bin/env node
import { createInterface } from "node:readline";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { exit, stdout, stderr } from "node:process";

const runtimeRoot = process.env.MASTRA_RUNTIME_ROOT || "/opt/mastra-runtime";
const agentId = process.env.MASTRA_AGENT_ID || "mind";

const modulePath = join(runtimeRoot, "agents", agentId, "index.js");
let agent;
try {
  const mod = await import(pathToFileURL(modulePath).href);
  agent = mod.default ?? mod.agent ?? mod;
} catch (err) {
  stderr.write(`Failed to load agent: ${err.message}\n`);
  exit(1);
}

// ── Response length ───────────────────────────────────────────────────────────
const RESPONSE_LENGTH = (process.env.RESPONSE_LENGTH || "medium").toLowerCase();
const lengthDirectives = {
  brief:    "RESPONSE LENGTH: 1-2 sentences only. No paragraphs. Telegraph-style.",
  short:    "RESPONSE LENGTH: One short paragraph, 3-4 sentences maximum.",
  medium:   "RESPONSE LENGTH: 2-3 paragraphs maximum. Be substantive but concise.",
  long:     "RESPONSE LENGTH: Respond at full depth. Use as many paragraphs as the topic warrants.",
};
const lengthDirective = lengthDirectives[RESPONSE_LENGTH] ?? `RESPONSE LENGTH: ${RESPONSE_LENGTH}`;

// Seed conversation with length preference as a system message
const messages = [{ role: "system", content: lengthDirective }];

async function chat(userText) {
  messages.push({ role: "user", content: userText });
  const result = await agent.generate(messages);
  const text = result.text ?? result.object?.result ?? "";
  messages.push({ role: "assistant", content: text });
  return text;
}

// One-time greeting
const greeting = await chat(
  "Begin the conversation. Introduce yourself in 2-3 sentences in your own voice, then ask: What would you like to explore?"
);
stdout.write(`\n${greeting}\n\n`);

// REPL using line events — more reliable in Docker TTY
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
