import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, it, expect } from "vitest";

import { fuzz } from "../src/fuzz.js";
import {
  genBoundary,
  genEnumViolation,
  genMissingRequired,
  genValidMinimal,
  genWrongType,
  minimalValid,
  sampleValid,
  sampleWrongType
} from "../src/generators.js";
import * as api from "../src/index.js";
import type { JsonSchema, ToolsListResult } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (): ToolsListResult =>
  JSON.parse(readFileSync(join(here, "..", "fixtures", "tools.json"), "utf8"));

const findTool = (plan: api.FuzzPlan, name: string): api.ToolPlan =>
  plan.plans.find((p) => p.tool === name)!;

describe("primitives", () => {
  it("sampleValid honors type + minLength + minimum", () => {
    expect(sampleValid({ type: "string" })).toBe("x");
    expect(sampleValid({ type: "string", minLength: 4 })).toBe("xxxx");
    expect(sampleValid({ type: "integer", minimum: 5 })).toBe(5);
    expect(sampleValid({ type: "boolean" })).toBe(true);
    expect(sampleValid({ enum: ["a", "b"] })).toBe("a");
  });
  it("sampleWrongType picks a different-type value", () => {
    expect(typeof sampleWrongType({ type: "string" })).toBe("number");
    expect(typeof sampleWrongType({ type: "integer" })).toBe("string");
  });
  it("sampleValid covers array / object / maximum-only / default branches", () => {
    expect(sampleValid({ type: "array" })).toEqual([]);
    expect(sampleValid({ type: "object" })).toEqual({});
    expect(sampleValid({ type: "integer", maximum: 9 })).toBe(9);
    expect(sampleValid(undefined)).toBe("x");
    expect(sampleValid({ type: "something-weird" })).toBe("x");
  });
  it("sampleWrongType covers boolean / array / object / default branches", () => {
    expect(typeof sampleWrongType({ type: "boolean" })).toBe("string");
    expect(typeof sampleWrongType({ type: "array" })).toBe("object");
    expect(Array.isArray(sampleWrongType({ type: "object" }))).toBe(true);
    expect(sampleWrongType(undefined)).toBeNull();
  });
  it("minimalValid populates only required fields", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a"]
    };
    const m = minimalValid(schema);
    expect(m).toEqual({ a: "x" });
  });
});

describe("per-generator", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { id: { type: "string", minLength: 2 }, count: { type: "integer", minimum: 1, maximum: 10 }, kind: { type: "string", enum: ["a", "b"] } },
    required: ["id"]
  };

  it("genValidMinimal emits one accept case", () => {
    const cases = genValidMinimal({ toolName: "t", schema });
    expect(cases).toHaveLength(1);
    expect(cases[0]!.expected).toBe("accept");
  });

  it("genMissingRequired emits one reject per required field", () => {
    const cases = genMissingRequired({ toolName: "t", schema });
    expect(cases).toHaveLength(1);
    expect(cases[0]!.expected).toBe("reject");
    expect(cases[0]!.field).toBe("id");
  });

  it("genWrongType emits a reject per typed property", () => {
    const cases = genWrongType({ toolName: "t", schema });
    expect(cases.map((c) => c.field).sort()).toEqual(["count", "id", "kind"]);
    expect(cases.every((c) => c.expected === "reject")).toBe(true);
  });

  it("genBoundary covers below/at/above for number bounds + length bounds", () => {
    const cases = genBoundary({ toolName: "t", schema });
    const kinds = cases.map((c) => c.kind).sort();
    expect(kinds).toContain("boundary-min");
    expect(kinds).toContain("boundary-max");
    expect(kinds).toContain("boundary-below-min");
    expect(kinds).toContain("boundary-above-max");
  });

  it("genEnumViolation emits one reject per enum field", () => {
    const cases = genEnumViolation({ toolName: "t", schema });
    expect(cases).toHaveLength(1);
    expect(cases[0]!.field).toBe("kind");
    expect(cases[0]!.expected).toBe("reject");
  });
});

describe("fuzz (full plan)", () => {
  const plan = fuzz(fixture());

  it("classifies tools by schemaPresent", () => {
    expect(plan.summary.tools).toBe(3);
    expect(plan.summary.schemedTools).toBe(2);
    expect(plan.summary.unschemedTools).toEqual(["ping"]);
    expect(findTool(plan, "ping").cases).toEqual([]);
  });

  it("lookup_invoice gets extra-field as REJECT (additionalProperties:false)", () => {
    const tool = findTool(plan, "lookup_invoice");
    const ef = tool.cases.find((c) => c.kind === "extra-field")!;
    expect(ef.expected).toBe("reject");
  });

  it("list_invoices gets extra-field as ACCEPT (additionalProperties unset)", () => {
    const tool = findTool(plan, "list_invoices");
    const ef = tool.cases.find((c) => c.kind === "extra-field")!;
    expect(ef.expected).toBe("accept");
  });

  it("list_invoices generates an enum-violation for status", () => {
    const tool = findTool(plan, "list_invoices");
    const enumCase = tool.cases.find((c) => c.kind === "enum-violation")!;
    expect(enumCase.field).toBe("status");
  });

  it("byKind counts add up to totalCases", () => {
    const sum = Object.values(plan.summary.byKind).reduce((a, b) => a + b, 0);
    expect(sum).toBe(plan.summary.totalCases);
  });

  it("--skip excludes those kinds from the plan", () => {
    const skipped = fuzz(fixture(), { skip: ["wrong-type", "extra-field"] });
    expect(skipped.summary.byKind["wrong-type"]).toBe(0);
    expect(skipped.summary.byKind["extra-field"]).toBe(0);
  });

  it("throws on non-array input", () => {
    expect(() => fuzz({} as unknown as ToolsListResult)).toThrow(/tools.*array/);
  });
});

describe("public API", () => {
  it("re-exports the surface", () => {
    expect(typeof api.fuzz).toBe("function");
    expect(typeof api.minimalValid).toBe("function");
  });
});
