# Changelog

## v0.1.0 — 2026-05-26

- Initial release: generate adversarial JSON test cases from an MCP `tools/list`.
- Six case generators: `valid-minimal`, `missing-required`, `wrong-type`, `extra-field` (verdict varies by `additionalProperties`), boundary (`-min`/`-max`/`-below-min`/`-above-max` for numeric ranges and string lengths), `enum-violation`.
- Deterministic — same input ⇒ same plan; safe for snapshot test suites.
- Per-case `expected` verdict (`accept` | `reject`) so a downstream replay runner can diff actual-vs-expected server behavior.
- Library API (`fuzz`, per-generator functions, `minimalValid`, `sampleValid`, `sampleWrongType`) + CLI (`mcp-tool-schema-fuzzer`, `--skip`, `--summary`).
- Composes with `mcp-tools-snapshot` (live capture → fuzz → replay) and the rest of the lane #1 MCP-governance set.
- Node 20/22 CI (lint, typecheck, coverage, build, demo, `npm audit`), AGPL-3.0-or-later, Dependabot.
