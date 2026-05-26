import type { GeneratedCase, JsonSchema } from "./types.js";

/** Deterministic, schema-valid sample value for a primitive property schema. */
export function sampleValid(schema: JsonSchema | undefined): unknown {
  if (!schema) return "x";
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  switch (schema.type) {
    case "string":
      if (typeof schema.minLength === "number" && schema.minLength > 0) {
        return "x".repeat(schema.minLength);
      }
      return "x";
    case "integer":
    case "number": {
      if (typeof schema.minimum === "number") return schema.minimum;
      if (typeof schema.maximum === "number") return schema.maximum;
      return 1;
    }
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "x";
  }
}

/** Pick a deterministic value of a DIFFERENT type than `schema.type`. */
export function sampleWrongType(schema: JsonSchema | undefined): unknown {
  switch (schema?.type) {
    case "string":
      return 42; // string expected → number
    case "integer":
    case "number":
      return "not-a-number";
    case "boolean":
      return "true"; // string instead of bool
    case "array":
      return { not: "an array" };
    case "object":
      return [];
    default:
      return null;
  }
}

/** Build the minimal valid input: only `required` properties, valid values. */
export function minimalValid(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of schema.required ?? []) {
    out[name] = sampleValid(schema.properties?.[name]);
  }
  return out;
}

interface CtxIn {
  toolName: string;
  schema: JsonSchema;
}

const reject = (kind: GeneratedCase["kind"], name: string, field: string | undefined, input: unknown, reason: string): GeneratedCase => {
  const c: GeneratedCase = { kind, name, input, expected: "reject", reason };
  if (field !== undefined) c.field = field;
  return c;
};
const accept = (kind: GeneratedCase["kind"], name: string, field: string | undefined, input: unknown, reason: string): GeneratedCase => {
  const c: GeneratedCase = { kind, name, input, expected: "accept", reason };
  if (field !== undefined) c.field = field;
  return c;
};

/** valid-minimal: one case carrying only required fields with valid values. */
export function genValidMinimal({ toolName, schema }: CtxIn): GeneratedCase[] {
  return [
    accept(
      "valid-minimal",
      `${toolName}__valid-minimal`,
      undefined,
      minimalValid(schema),
      "all required fields present with valid types; server should accept"
    )
  ];
}

/** missing-required: one case per required field, with that field omitted. */
export function genMissingRequired({ toolName, schema }: CtxIn): GeneratedCase[] {
  const required = schema.required ?? [];
  return required.map((field) => {
    const input = minimalValid(schema);
    delete input[field];
    return reject(
      "missing-required",
      `${toolName}__missing-required__${field}`,
      field,
      input,
      `required field "${field}" omitted; server should reject`
    );
  });
}

/** wrong-type: one case per typed property, with a wrong-type value. */
export function genWrongType({ toolName, schema }: CtxIn): GeneratedCase[] {
  const out: GeneratedCase[] = [];
  for (const [field, prop] of Object.entries(schema.properties ?? {})) {
    if (typeof prop.type !== "string") continue;
    const input = minimalValid(schema);
    input[field] = sampleWrongType(prop);
    out.push(
      reject(
        "wrong-type",
        `${toolName}__wrong-type__${field}`,
        field,
        input,
        `field "${field}" carries a value of the wrong type for its declared "${prop.type}"`
      )
    );
  }
  return out;
}

/** extra-field: one case with an unexpected property. */
export function genExtraField({ toolName, schema }: CtxIn): GeneratedCase[] {
  const input = minimalValid(schema);
  input["__fuzzer_extra__"] = "unexpected";
  const strict = schema.additionalProperties === false;
  return [
    {
      kind: "extra-field",
      name: `${toolName}__extra-field`,
      field: "__fuzzer_extra__",
      input,
      expected: strict ? "reject" : "accept",
      reason: strict
        ? "additionalProperties: false → server should reject unknown field"
        : "schema does not forbid extras → server may accept the unknown field"
    }
  ];
}

/** boundary: cases at, just below, and just above min/max for numeric / length-bounded fields. */
export function genBoundary({ toolName, schema }: CtxIn): GeneratedCase[] {
  const out: GeneratedCase[] = [];
  for (const [field, prop] of Object.entries(schema.properties ?? {})) {
    if (prop.type === "integer" || prop.type === "number") {
      if (typeof prop.minimum === "number") {
        const input = minimalValid(schema);
        input[field] = prop.minimum;
        out.push(accept("boundary-min", `${toolName}__boundary-min__${field}`, field, input, `at minimum ${prop.minimum}; should accept`));
        const below = minimalValid(schema);
        below[field] = prop.minimum - 1;
        out.push(reject("boundary-below-min", `${toolName}__boundary-below-min__${field}`, field, below, `below minimum ${prop.minimum}; should reject`));
      }
      if (typeof prop.maximum === "number") {
        const input = minimalValid(schema);
        input[field] = prop.maximum;
        out.push(accept("boundary-max", `${toolName}__boundary-max__${field}`, field, input, `at maximum ${prop.maximum}; should accept`));
        const above = minimalValid(schema);
        above[field] = prop.maximum + 1;
        out.push(reject("boundary-above-max", `${toolName}__boundary-above-max__${field}`, field, above, `above maximum ${prop.maximum}; should reject`));
      }
    } else if (prop.type === "string") {
      if (typeof prop.minLength === "number" && prop.minLength > 0) {
        const below = minimalValid(schema);
        below[field] = "x".repeat(prop.minLength - 1);
        out.push(reject("boundary-below-min", `${toolName}__boundary-below-min-length__${field}`, field, below, `length ${prop.minLength - 1} < minLength ${prop.minLength}`));
      }
      if (typeof prop.maxLength === "number") {
        const above = minimalValid(schema);
        above[field] = "x".repeat(prop.maxLength + 1);
        out.push(reject("boundary-above-max", `${toolName}__boundary-above-max-length__${field}`, field, above, `length ${prop.maxLength + 1} > maxLength ${prop.maxLength}`));
      }
    }
  }
  return out;
}

/** enum-violation: one case per enum field with a non-enum value. */
export function genEnumViolation({ toolName, schema }: CtxIn): GeneratedCase[] {
  const out: GeneratedCase[] = [];
  for (const [field, prop] of Object.entries(schema.properties ?? {})) {
    if (!Array.isArray(prop.enum) || prop.enum.length === 0) continue;
    const input = minimalValid(schema);
    input[field] = "__not_in_enum__";
    out.push(reject("enum-violation", `${toolName}__enum-violation__${field}`, field, input, `value not in enum [${prop.enum.join(", ")}]`));
  }
  return out;
}
