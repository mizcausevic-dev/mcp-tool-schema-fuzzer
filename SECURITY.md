# Security Policy

`mcp-tool-schema-fuzzer` is an offline test-case generator. It reads an MCP
`tools/list` JSON you provide and emits a JSON test plan. It performs no
network calls, does not invoke any MCP server, and does not execute any tool.

The generated cases are intentionally adversarial (missing required fields,
wrong types, boundary violations). They are safe as-is — they are JSON data,
not invocations — but treat them as you would any fuzzing corpus once a test
runner does replay them against a live server.

## Supported versions

Only the latest tagged release is supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private disclosure:

- [Open a security advisory](https://github.com/mizcausevic-dev/mcp-tool-schema-fuzzer/security/advisories/new)

Do not file public issues for security reports.
