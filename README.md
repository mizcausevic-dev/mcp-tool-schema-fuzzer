# mcp-tool-schema-fuzzer

Generate **adversarial test cases** from an MCP `tools/list` — `valid-minimal`, `missing-required`, `wrong-type`, `extra-field`, `boundary` (min/max + below/above), `enum-violation` — each carrying an **expected accept/reject verdict** you can replay against the server to check input-validation behavior.

Lane #1, deepening to 5: it joins `mcp-tools-snapshot` (capture) + `mcp-registry-risk-scanner` (static risk) + `mcp-tool-card-generator` (disclosure) + `mcp-tools-diff` (drift) with **schema-enforcement testing**.

## Why

MCP servers declare an `inputSchema` per tool but the client has no easy way to verify the server actually enforces it. A tool that says `"required": ["customer_id"]` and silently accepts requests missing that field is a server bug — and a small one off the happy path that's easy to miss in review. This fuzzer reads the schema, generates the cases that *should* exercise each enforcement rule, and labels each one with the verdict the server should produce. A separate test runner can then invoke the cases and diff actual-vs-expected.

Pure transform — does not call the MCP server. Pairs naturally with `mcp-tools-snapshot` (snapshot live → fuzz → replay against the server).

## Install

```bash
npm install -g mcp-tool-schema-fuzzer   # CLI
npm install mcp-tool-schema-fuzzer      # library
```

Requires Node ≥ 20.

## CLI

```bash
mcp-tool-schema-fuzzer tools.json --out plan.json          # full plan
mcp-tool-schema-fuzzer tools.json --summary                # counts only
mcp-tool-schema-fuzzer tools.json --skip extra-field,enum-violation
```

Exit codes: `0` ok, `2` usage/IO error.

## Library

```ts
import { fuzz } from "mcp-tool-schema-fuzzer";

const plan = fuzz(toolsList);
for (const tool of plan.plans) {
  for (const c of tool.cases) {
    // replay against the server, compare to c.expected ("accept" | "reject")
  }
}
```

## Case kinds

| Kind | Per | Verdict | What it checks |
|---|---|---|---|
| `valid-minimal` | tool | accept | server accepts a minimal valid input |
| `missing-required` | required field | reject | server rejects when a required field is missing |
| `wrong-type` | typed property | reject | server rejects when a property has the wrong JSON type |
| `extra-field` | tool | reject if `additionalProperties: false` else accept | strict vs permissive object enforcement |
| `boundary-min` / `boundary-max` | numeric/string-length field | accept | values exactly at the declared min/max |
| `boundary-below-min` / `boundary-above-max` | numeric/string-length field | reject | values just outside the declared bounds |
| `enum-violation` | enum field | reject | server rejects a value not in the enum |

Generators are deterministic — running the same `tools/list` twice produces the same plan, so a snapshot test suite is stable across runs.

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE).
