import {
  genBoundary,
  genEnumViolation,
  genExtraField,
  genMissingRequired,
  genValidMinimal,
  genWrongType
} from "./generators.js";
import type {
  CaseKind,
  FuzzOptions,
  FuzzPlan,
  GeneratedCase,
  ToolPlan,
  ToolsListResult
} from "./types.js";

const GENERATORS: Array<{
  kinds: CaseKind[];
  fn: (ctx: { toolName: string; schema: import("./types.js").JsonSchema }) => GeneratedCase[];
}> = [
  { kinds: ["valid-minimal"], fn: genValidMinimal },
  { kinds: ["missing-required"], fn: genMissingRequired },
  { kinds: ["wrong-type"], fn: genWrongType },
  { kinds: ["extra-field"], fn: genExtraField },
  { kinds: ["boundary-min", "boundary-max", "boundary-below-min", "boundary-above-max"], fn: genBoundary },
  { kinds: ["enum-violation"], fn: genEnumViolation }
];

const EMPTY_BY_KIND = (): Record<CaseKind, number> => ({
  "valid-minimal": 0,
  "missing-required": 0,
  "wrong-type": 0,
  "extra-field": 0,
  "boundary-min": 0,
  "boundary-max": 0,
  "boundary-below-min": 0,
  "boundary-above-max": 0,
  "enum-violation": 0
});

/** Generate a test plan from a `tools/list` result. */
export function fuzz(list: ToolsListResult, opts: FuzzOptions = {}): FuzzPlan {
  if (!list || !Array.isArray(list.tools)) {
    throw new Error("expected a tools/list result with a `tools` array");
  }
  const skipped = new Set<CaseKind>(opts.skip ?? []);
  const plans: ToolPlan[] = [];
  const unschemedTools: string[] = [];
  const byKind = EMPTY_BY_KIND();
  let totalCases = 0;
  let schemedTools = 0;

  for (const tool of list.tools) {
    if (!tool?.name) continue;
    if (!tool.inputSchema) {
      unschemedTools.push(tool.name);
      plans.push({ tool: tool.name, schemaPresent: false, cases: [] });
      continue;
    }
    schemedTools++;
    const cases: GeneratedCase[] = [];
    for (const { kinds, fn } of GENERATORS) {
      if (kinds.every((k) => skipped.has(k))) continue;
      const generated = fn({ toolName: tool.name, schema: tool.inputSchema });
      for (const c of generated) {
        if (skipped.has(c.kind)) continue;
        cases.push(c);
        byKind[c.kind]++;
        totalCases++;
      }
    }
    plans.push({ tool: tool.name, schemaPresent: true, cases });
  }

  return {
    plans,
    summary: {
      tools: list.tools.length,
      schemedTools,
      unschemedTools,
      totalCases,
      byKind
    }
  };
}
