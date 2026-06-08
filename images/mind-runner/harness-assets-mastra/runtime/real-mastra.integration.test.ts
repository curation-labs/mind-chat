import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RUN_SCRIPT = fileURLToPath(new URL("./run.js", import.meta.url));
const PACKAGE_NODE_MODULES = fileURLToPath(new URL("../node_modules", import.meta.url));
const SHOULD_RUN = process.env.RUN_MASTRA_REAL_E2E === "1";

function runWrapper(
  args: string[],
  options: { stdin?: string; env?: Record<string, string> } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUN_SCRIPT, ...args], {
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(options.stdin ?? "");
  });
}

describe.skipIf(!SHOULD_RUN)("runtime/run.js real Mastra integration", () => {
  it(
    "should execute a real Mastra Agent through OpenRouter structured output",
    async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error(
          "OPENROUTER_API_KEY is required when RUN_MASTRA_REAL_E2E=1",
        );
      }

      const root = await mkdtemp(join(tmpdir(), "cch-real-mastra-"));
      const runtimeRoot = join(root, "runtime");
      const workspace = join(root, "workspace");
      const agentDir = join(runtimeRoot, "agents", "real-greeting-agent");
      await mkdir(agentDir, { recursive: true });
      await mkdir(workspace, { recursive: true });
      await symlink(PACKAGE_NODE_MODULES, join(runtimeRoot, "node_modules"), "dir");

      await writeFile(
        join(agentDir, "index.js"),
        `
import { Agent } from "@mastra/core/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

export default new Agent({
  name: "real-greeting-agent",
  instructions: [
    "Return only data that conforms to the structured output schema.",
    "Use a concise greeting, set ok to true, and use confidence 1."
  ].join("\\n"),
  model: openrouter.languageModel(process.env.MASTRA_REAL_MODEL ?? "openai/gpt-5.4-mini"),
});
`,
        "utf-8",
      );
      const schemaPath = join(workspace, "schema.json");
      const outputPath = join(workspace, "output.json");
      const eventsPath = join(workspace, "events.jsonl");
      await writeFile(
        schemaPath,
        JSON.stringify({
          type: "object",
          additionalProperties: false,
          required: ["ok", "message", "confidence"],
          properties: {
            ok: { type: "boolean", const: true },
            message: { type: "string", minLength: 1 },
            confidence: { type: "integer", minimum: 1, maximum: 1 },
          },
        }),
        "utf-8",
      );

      const result = await runWrapper(
        [
          "--agent-id",
          "real-greeting-agent",
          "--schema-path",
          schemaPath,
          "--output-path",
          outputPath,
          "--events-path",
          eventsPath,
        ],
        {
          stdin:
            "Say hello to the containerized CLI harness in one short sentence.",
          env: { MASTRA_RUNTIME_ROOT: runtimeRoot },
        },
      );

      expect(result, result.stderr).toMatchObject({ code: 0, stderr: "" });
      await expect(readFile(outputPath, "utf-8").then(JSON.parse)).resolves.toEqual({
        ok: true,
        message: expect.any(String),
        confidence: 1,
      });
      const events = (await readFile(eventsPath, "utf-8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { type: string; finishReason?: string });
      expect(events.at(-1)).toMatchObject({
        type: "agent.completed",
        finishReason: "stop",
      });
    },
    120_000,
  );
});
