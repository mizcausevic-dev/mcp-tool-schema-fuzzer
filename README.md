# mcp-tool-schema-fuzzer

Generate **adversarial test cases** from an MCP `tools/list` — `valid-minimal`, `missing-required`, `wrong-type`, `extra-field`, `boundary` (min/max + below/above), `enum-violation` — each carrying an **expected accept/reject verdict** you can replay against the server to check input-validation behavior.

It complements `mcp-tools-snapshot` (capture), `mcp-registry-risk-scanner` (static risk), `mcp-tool-card-generator` (disclosure), and `mcp-tools-diff` (drift) with **schema-enforcement test-plan generation**.

## Why

MCP servers declare an `inputSchema` per tool but the client has no easy way to verify the server actually enforces it. A tool that says `"required": ["customer_id"]` and silently accepts requests missing that field is a server bug — and a small one off the happy path that's easy to miss in review. This fuzzer reads the schema, generates the cases that *should* exercise each enforcement rule, and labels each one with the verdict the server should produce. A separate test runner can then invoke the cases and diff actual-vs-expected.

Pure transform — it does not call the MCP server or ship a replay runner. Each expected verdict is inferred from the declared schema, not observed server behavior. Replay requires a separate runner and a controlled target; inspect generated cases before invoking any tool with side effects.

## Run from source

The public npm registry returned `E404` for the unscoped `mcp-tool-schema-fuzzer` name on 2026-10-30. The `npm install` commands previously shown here are unavailable. A GitHub `v0.1.0` source release exists; other distribution routes were not verified.

```bash
git clone https://github.com/mizcausevic-dev/mcp-tool-schema-fuzzer.git
cd mcp-tool-schema-fuzzer
npm ci
npm run build
node dist/cli.js fixtures/tools.json --summary
```

The locked source-build toolchain currently has npm audit findings. Run `npm ci` in an isolated checkout until those development dependencies are remediated.

Requires Node ≥ 20.

## CLI

```bash
node dist/cli.js tools.json --out plan.json          # full plan
node dist/cli.js tools.json --summary                # counts only
node dist/cli.js tools.json --skip extra-field,enum-violation
```

Exit codes: `0` ok, `2` usage/IO error.

## Library

```ts
// From this checkout after `npm run build`:
import { fuzz } from "./dist/index.js";

const plan = fuzz(toolsList);
for (const tool of plan.plans) {
  for (const c of tool.cases) {
    // A separate runner must replay against a controlled server and compare
    // the observed response with c.expected ("accept" | "reject").
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
