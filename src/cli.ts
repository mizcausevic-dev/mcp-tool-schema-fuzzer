#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { fuzz } from "./fuzz.js";
import type { CaseKind, ToolsListResult } from "./types.js";

interface Args {
  source?: string;
  out?: string;
  skip: CaseKind[];
  summary: boolean;
  help: boolean;
}

const ALL_KINDS: CaseKind[] = [
  "valid-minimal",
  "missing-required",
  "wrong-type",
  "extra-field",
  "boundary-min",
  "boundary-max",
  "boundary-below-min",
  "boundary-above-max",
  "enum-violation"
];

function parseArgs(argv: string[]): Args {
  const args: Args = { skip: [], summary: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--summary") args.summary = true;
    else if (a === "--skip") {
      const list = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean) as CaseKind[];
      for (const k of list) {
        if (!ALL_KINDS.includes(k)) throw new Error(`--skip: unknown kind "${k}"`);
        args.skip.push(k);
      }
    } else if (!a.startsWith("-")) args.source = a;
    else throw new Error(`Unknown option: ${a}`);
  }
  return args;
}

const HELP = `mcp-tool-schema-fuzzer — generate adversarial test cases from an MCP tools/list

Usage:
  mcp-tool-schema-fuzzer <tools.json> [--skip KIND,KIND,...] [--out plan.json] [--summary]

Input: an MCP "tools/list" result. For each tool with an inputSchema, the
fuzzer emits cases covering: valid-minimal, missing-required, wrong-type,
extra-field, boundary-min / -max / -below-min / -above-max, enum-violation.
Each case carries an "expected" verdict (accept | reject) you can compare
against actual server behavior.

Options:
  --skip <kinds>   Comma-separated CaseKinds to omit.
  --out <file>     Write the plan to a file (default: stdout).
  --summary        Emit only the summary (counts + unschemed tools).
  -h, --help       Show this help.

Exit codes: 0 ok, 2 usage/IO error.`;

export function run(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help || !args.source) {
    process.stdout.write(`${HELP}\n`);
    return args.help ? 0 : 2;
  }
  let plan;
  try {
    const list = JSON.parse(readFileSync(args.source, "utf8")) as ToolsListResult;
    plan = fuzz(list, { skip: args.skip });
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    return 2;
  }
  const payload = args.summary ? plan.summary : plan;
  const json = JSON.stringify(payload, null, 2);
  if (args.out) {
    writeFileSync(args.out, `${json}\n`, "utf8");
    process.stdout.write(`wrote ${plan.summary.totalCases} cases across ${plan.summary.schemedTools} schemed tool(s) → ${args.out}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exit(run(process.argv.slice(2)));
}
