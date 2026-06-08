#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argv, exit, stderr, stdin } from "node:process";
import { jsonSchemaToZodInstance } from "./schema-to-zod.js";

function parseArgs(values) {
  const parsed = {};
  for (let i = 2; i < values.length; i += 2) {
    const key = values[i];
    if (key?.startsWith("--")) {
      parsed[key.slice(2)] = values[i + 1];
    }
  }
  return parsed;
}

function writeEvent(eventsPath, event) {
  appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);
}

function fail(eventsPath, code, message, eventError = message) {
  if (eventsPath) {
    writeEvent(eventsPath, {
      type: "agent.failed",
      error: eventError,
    });
  }
  stderr.write(`${message}\n`);
  exit(code);
}

const args = parseArgs(argv);
const runtimeRoot = process.env.MASTRA_RUNTIME_ROOT || "/opt/mastra-runtime";
const agentId = args["agent-id"] || process.env.MASTRA_AGENT_ID;
const schemaPath = args["schema-path"];
const outputPath = args["output-path"];
const eventsPath = args["events-path"];

if (!agentId || !schemaPath || !outputPath || !eventsPath) {
  fail(
    eventsPath,
    2,
    "Missing required args: --agent-id --schema-path --output-path --events-path",
  );
}

writeFileSync(eventsPath, "");

if (process.env.MASTRA_MEMORY_THREAD_ID || process.env.MASTRA_MEMORY_RESOURCE_ID) {
  fail(
    eventsPath,
    1,
    "Mastra Memory is not supported in this version of @containerized-cli-harness/mastra",
    "mastra_memory_not_supported: Stage 1B initial scope omits Memory configuration",
  );
}

const prompt = await new Promise((resolve) => {
  let data = "";
  stdin.on("data", (chunk) => {
    data += chunk;
  });
  stdin.on("end", () => resolve(data.trim()));
});

const modulePath = join(runtimeRoot, "agents", agentId, "index.js");
let agent;
try {
  const mod = await import(pathToFileURL(modulePath).href);
  agent = mod.default ?? mod.agent ?? mod;
} catch (err) {
  fail(
    eventsPath,
    3,
    `Failed to import ${modulePath}: ${err instanceof Error ? err.message : String(err)}`,
    `agent_import_failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)}`,
  );
}

if (!agent || typeof agent.generate !== "function") {
  fail(
    eventsPath,
    4,
    `Agent module ${agentId} did not export a generate-able object`,
    "agent_module_invalid: missing .generate() method",
  );
}

let zodSchema;
try {
  const schemaJson = JSON.parse(readFileSync(schemaPath, "utf-8"));
  zodSchema = jsonSchemaToZodInstance(schemaJson);
} catch (err) {
  fail(
    eventsPath,
    1,
    `Failed to load/convert schema from ${schemaPath}: ${err instanceof Error ? err.message : String(err)}`,
    `schema_load_failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)}`,
  );
}

const startedAt = Date.now();
try {
  const result = await agent.generate(prompt, {
    structuredOutput: { schema: zodSchema },
    onStepFinish: (step) => {
      writeEvent(eventsPath, {
        type: "step",
        payload: {
          finishReason: step?.finishReason,
          usage: step?.usage,
          toolCalls: step?.toolCalls?.length ? step.toolCalls : undefined,
          toolResults: step?.toolResults?.length ? step.toolResults : undefined,
          warnings: step?.warnings?.length ? step.warnings : undefined,
        },
      });
    },
  });
  writeEvent(eventsPath, {
    type: "agent.completed",
    finishReason: result.finishReason,
    usage: result.usage,
    durationMs: Date.now() - startedAt,
  });
  writeFileSync(outputPath, JSON.stringify(result.object ?? { text: result.text }));
  exit(0);
} catch (err) {
  fail(
    eventsPath,
    1,
    err instanceof Error ? err.stack ?? err.message : String(err),
    `agent_generate_failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)}`,
  );
}
