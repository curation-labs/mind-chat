import { describe, expect, it } from "vitest";

import { jsonSchemaToZodInstance } from "./schema-to-zod.js";

describe("jsonSchemaToZodInstance", () => {
  it("converts a strict object schema", () => {
    const schema = jsonSchemaToZodInstance({
      type: "object",
      additionalProperties: false,
      required: ["greeting"],
      properties: {
        greeting: { type: "string" },
      },
    });

    expect(schema.safeParse({ greeting: "hi" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ greeting: 42 }).success).toBe(false);
    expect(schema.safeParse({ greeting: "hi", extra: 1 }).success).toBe(false);
  });

  it("converts array constraints", () => {
    const schema = jsonSchemaToZodInstance({
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 3,
        },
      },
    });

    expect(schema.safeParse({ items: ["a"] }).success).toBe(true);
    expect(schema.safeParse({ items: ["a", "b", "c"] }).success).toBe(true);
    expect(schema.safeParse({ items: [] }).success).toBe(false);
    expect(schema.safeParse({ items: ["a", "b", "c", "d"] }).success).toBe(
      false,
    );
  });

  it("converts enum, integer, and nullable unions", () => {
    const schema = jsonSchemaToZodInstance({
      type: "object",
      required: ["priority", "count"],
      properties: {
        priority: { type: "string", enum: ["low", "medium", "high"] },
        count: { type: "integer", minimum: 0 },
        notes: { type: ["string", "null"] },
      },
    });

    expect(schema.safeParse({ priority: "low", count: 0 }).success).toBe(true);
    expect(
      schema.safeParse({ priority: "high", count: 5, notes: null }).success,
    ).toBe(true);
    expect(schema.safeParse({ priority: "urgent", count: 0 }).success).toBe(
      false,
    );
    expect(schema.safeParse({ priority: "low", count: -1 }).success).toBe(
      false,
    );
    expect(schema.safeParse({ priority: "low" }).success).toBe(false);
  });

  it("converts the skill-recommendation output schema shape", () => {
    const schema = jsonSchemaToZodInstance({
      type: "object",
      required: ["user_summary", "themes_identified", "recommendations"],
      additionalProperties: false,
      properties: {
        user_summary: { type: "string" },
        themes_identified: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 7,
        },
        recommendations: {
          type: "array",
          minItems: 0,
          maxItems: 5,
          items: {
            type: "object",
            required: [
              "skill_id",
              "name",
              "rationale",
              "evidence_from_logs",
            ],
            additionalProperties: false,
            properties: {
              skill_id: { type: "string" },
              name: { type: "string" },
              rationale: { type: "string" },
              evidence_from_logs: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                maxItems: 3,
              },
            },
          },
        },
      },
    });

    expect(
      schema.safeParse({
        user_summary: "summary",
        themes_identified: ["debugging"],
        recommendations: [
          {
            skill_id: "skill_1",
            name: "Debugging",
            rationale: "Matches the session",
            evidence_from_logs: ["ran tests"],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        user_summary: "summary",
        themes_identified: [],
        recommendations: [],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        themes_identified: ["debugging"],
        recommendations: [],
      }).success,
    ).toBe(false);
  });
});
