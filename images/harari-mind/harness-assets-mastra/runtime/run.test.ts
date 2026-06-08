import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const RUN_SCRIPT = fileURLToPath(new URL("./run.js", import.meta.url));

async function makeWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "cch-mastra-run-"));
  const runtimeRoot = join(root, "runtime");
  const workspace = join(root, "workspace");
  const agentDir = join(runtimeRoot, "agents", "greeting-agent");
  await mkdir(agentDir, { recursive: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(
    join(agentDir, "index.js"),
    `
export default {
  async generate(prompt, options) {
    const object = options.structuredOutput.schema.parse({
      ok: true,
      prompt,
    });
    options.onStepFinish({
      finishReason: "stop",
      usage: { inputTokens: 2, outputTokens: 3 },
      toolCalls: [],
      warnings: [],
    });
    return {
      object,
      finishReason: "stop",
      usage: { inputTokens: 2, outputTokens: 3 },
    };
  },
};
`,
    "utf-8",
  );
  await writeFile(
    join(workspace, "schema.json"),
    JSON.stringify({
      type: "object",
      additionalProperties: false,
      required: ["ok", "prompt"],
      properties: {
        ok: { type: "boolean" },
        prompt: { type: "string" },
      },
    }),
    "utf-8",
  );
  return {
    root,
    runtimeRoot,
    workspace,
    outputPath: join(workspace, "output.txt"),
    eventsPath: join(workspace, "events.jsonl"),
    schemaPath: join(workspace, "schema.json"),
  };
}

async function writeAgent(
  runtimeRoot: string,
  agentId: string,
  source: string,
) {
  const agentDir = join(runtimeRoot, "agents", agentId);
  await mkdir(agentDir, { recursive: true });
  await writeFile(join(agentDir, "index.js"), source, "utf-8");
}

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

describe("runtime/run.js", () => {
  it("imports the configured agent, writes structured output, and records events", async () => {
    const paths = await makeWorkspace();

    const result = await runWrapper(
      [
        "--agent-id",
        "greeting-agent",
        "--schema-path",
        paths.schemaPath,
        "--output-path",
        paths.outputPath,
        "--events-path",
        paths.eventsPath,
      ],
      {
        stdin: "hello mastra",
        env: { MASTRA_RUNTIME_ROOT: paths.runtimeRoot },
      },
    );

    expect(result).toMatchObject({ code: 0, stderr: "" });
    await expect(readFile(paths.outputPath, "utf-8")).resolves.toBe(
      JSON.stringify({ ok: true, prompt: "hello mastra" }),
    );
    const events = (await readFile(paths.eventsPath, "utf-8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; finishReason?: string });
    expect(events.map((event) => event.type)).toEqual([
      "step",
      "agent.completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "agent.completed",
      finishReason: "stop",
    });
  });

  it("rejects Mastra Memory env vars with a clear failure event", async () => {
    const paths = await makeWorkspace();

    const result = await runWrapper(
      [
        "--agent-id",
        "greeting-agent",
        "--schema-path",
        paths.schemaPath,
        "--output-path",
        paths.outputPath,
        "--events-path",
        paths.eventsPath,
      ],
      {
        stdin: "hello",
        env: {
          MASTRA_RUNTIME_ROOT: paths.runtimeRoot,
          MASTRA_MEMORY_THREAD_ID: "thread_1",
        },
      },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Mastra Memory is not supported");
    await expect(readFile(paths.eventsPath, "utf-8")).resolves.toContain(
      "mastra_memory_not_supported",
    );
  });

  it("exits 2 when required args are missing", async () => {
    const result = await runWrapper(["--agent-id", "greeting-agent"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Missing required args");
  });

  it("exits 3 and records an event when the agent module cannot be imported", async () => {
    const paths = await makeWorkspace();

    const result = await runWrapper(
      [
        "--agent-id",
        "missing-agent",
        "--schema-path",
        paths.schemaPath,
        "--output-path",
        paths.outputPath,
        "--events-path",
        paths.eventsPath,
      ],
      { env: { MASTRA_RUNTIME_ROOT: paths.runtimeRoot } },
    );

    expect(result.code).toBe(3);
    expect(result.stderr).toContain("Failed to import");
    await expect(readFile(paths.eventsPath, "utf-8")).resolves.toContain(
      "agent_import_failed",
    );
  });

  it("exits 4 when the agent module has no generate method", async () => {
    const paths = await makeWorkspace();
    await writeAgent(
      paths.runtimeRoot,
      "not-agent",
      "export default { notGenerate: true };",
    );

    const result = await runWrapper(
      [
        "--agent-id",
        "not-agent",
        "--schema-path",
        paths.schemaPath,
        "--output-path",
        paths.outputPath,
        "--events-path",
        paths.eventsPath,
      ],
      { env: { MASTRA_RUNTIME_ROOT: paths.runtimeRoot } },
    );

    expect(result.code).toBe(4);
    expect(result.stderr).toContain("did not export a generate-able object");
    await expect(readFile(paths.eventsPath, "utf-8")).resolves.toContain(
      "agent_module_invalid",
    );
  });

  it("exits 1 and records an event when the agent throws", async () => {
    const paths = await makeWorkspace();
    await writeAgent(
      paths.runtimeRoot,
      "throws-agent",
      `
export default {
  async generate() {
    throw new Error("provider returned 503");
  },
};
`,
    );

    const result = await runWrapper(
      [
        "--agent-id",
        "throws-agent",
        "--schema-path",
        paths.schemaPath,
        "--output-path",
        paths.outputPath,
        "--events-path",
        paths.eventsPath,
      ],
      { env: { MASTRA_RUNTIME_ROOT: paths.runtimeRoot } },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("provider returned 503");
    await expect(readFile(paths.eventsPath, "utf-8")).resolves.toContain(
      "agent_generate_failed",
    );
  });

  it("exits 1 and records an event when schema conversion fails", async () => {
    const paths = await makeWorkspace();
    await writeFile(paths.schemaPath, "{not json", "utf-8");

    const result = await runWrapper(
      [
        "--agent-id",
        "greeting-agent",
        "--schema-path",
        paths.schemaPath,
        "--output-path",
        paths.outputPath,
        "--events-path",
        paths.eventsPath,
      ],
      { env: { MASTRA_RUNTIME_ROOT: paths.runtimeRoot } },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Failed to load/convert schema");
    await expect(readFile(paths.eventsPath, "utf-8")).resolves.toContain(
      "schema_load_failed",
    );
  });
});
