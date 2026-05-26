// Generate adversarial inputs from MCP tools/list inputSchemas — a JSON test
// plan you can replay against the server to check input-validation behavior.

export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: JsonSchema;
  [key: string]: unknown;
};

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

export interface ToolsListResult {
  tools: McpTool[];
}

export type CaseKind =
  | "valid-minimal"
  | "missing-required"
  | "wrong-type"
  | "extra-field"
  | "boundary-min"
  | "boundary-max"
  | "boundary-below-min"
  | "boundary-above-max"
  | "enum-violation";

export type Expectation = "accept" | "reject";

export interface GeneratedCase {
  name: string;
  kind: CaseKind;
  /** A property name the case targets (when applicable). */
  field?: string;
  input: unknown;
  expected: Expectation;
  reason: string;
}

export interface ToolPlan {
  tool: string;
  schemaPresent: boolean;
  cases: GeneratedCase[];
}

export interface FuzzPlan {
  plans: ToolPlan[];
  summary: {
    tools: number;
    schemedTools: number;
    unschemedTools: string[];
    totalCases: number;
    byKind: Record<CaseKind, number>;
  };
}

export interface FuzzOptions {
  /** Skip generators in this set (default: none). */
  skip?: CaseKind[];
}
