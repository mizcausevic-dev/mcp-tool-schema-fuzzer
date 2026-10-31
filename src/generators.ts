import type { GeneratedCase, JsonSchema } from "./types.js";
import { provablyValid } from "./provable.js";

const MAX_SAMPLE_LENGTH = 256;
const MAX_SAMPLE_DEPTH = 8;
const MAX_REQUIRED_FIELDS = 64;

/** Deterministic candidate value; accept-labelled cases require a separate proof. */
export function sampleValid(schema: JsonSchema | undefined): unknown {
  return sampleValidAt(schema, 0);
}

function sampleValidAt(schema: JsonSchema | undefined, depth: number): unknown {
  if (!schema) return "x";
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  switch (schema.type) {
    case "string":
      if (schema.maxLength === 0) return "";
      if (Number.isSafeInteger(schema.minLength) && schema.minLength! > 0)
        return "x".repeat(Math.min(schema.minLength!, MAX_SAMPLE_LENGTH));
      return "x";
    case "integer":
    case "number": {
      if (typeof schema.minimum === "number") return schema.type === "integer" ? Math.ceil(schema.minimum) : schema.minimum;
      if (typeof schema.maximum === "number") return schema.type === "integer" ? Math.floor(schema.maximum) : schema.maximum;
      return 1;
    }
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return minimalValidAt(schema, depth + 1);
    case "null":
      return null;
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
    case "null":
      return "not-null";
    default:
      return null;
  }
}

/** Build a bounded candidate input with required properties populated. */
export function minimalValid(schema: JsonSchema): Record<string, unknown> {
  return minimalValidAt(schema, 0);
}

function minimalValidAt(schema: JsonSchema, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (depth > MAX_SAMPLE_DEPTH) return out;
  const required = Array.isArray(schema.required) ? schema.required.slice(0, MAX_REQUIRED_FIELDS) : [];
  for (const name of required) {
    if (typeof name !== "string") continue;
    const prop = schema.properties && Object.hasOwn(schema.properties, name) ? schema.properties[name] : undefined;
    // Assignment to "__proto__" on a regular object would change its prototype.
    setField(out, name, sampleValidAt(prop, depth));
  }
  return out;
}

function setField(input: Record<string, unknown>, name: string, value: unknown): void {
  // `input[name] = value` would mutate the prototype for the name "__proto__".
  Object.defineProperty(input, name, { value, enumerable: true, configurable: true, writable: true });
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
  const input = minimalValid(schema);
  if (!provablyValid(schema, input)) return [];
  return [
    accept(
      "valid-minimal",
      `${toolName}__valid-minimal`,
      undefined,
      input,
      "bounded schema check proves this minimal input valid; server should accept"
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
    setField(input, field, sampleWrongType(prop));
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
  // Without evaluating patternProperties we cannot prove this key is unknown.
  if (Object.hasOwn(schema, "patternProperties")) return [];
  const input = minimalValid(schema);
  let field = "__fuzzer_extra__";
  while (schema.properties && Object.hasOwn(schema.properties, field)) field += "_";
  setField(input, field, "unexpected");
  const strict = schema.additionalProperties === false;
  if (!strict && !provablyValid(schema, input)) return [];
  return [
    {
      kind: "extra-field",
      name: `${toolName}__extra-field`,
      field,
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
      if (typeof prop.minimum === "number" && Number.isFinite(prop.minimum)) {
        const input = minimalValid(schema);
        setField(input, field, prop.minimum);
        if (provablyValid(schema, input)) out.push(accept("boundary-min", `${toolName}__boundary-min__${field}`, field, input, `at minimum ${prop.minimum}; should accept`));
        const belowValue = prop.minimum - 1;
        if (Number.isFinite(belowValue) && belowValue < prop.minimum) {
          const below = minimalValid(schema);
          setField(below, field, belowValue);
          out.push(reject("boundary-below-min", `${toolName}__boundary-below-min__${field}`, field, below, `below minimum ${prop.minimum}; should reject`));
        }
      }
      if (typeof prop.maximum === "number" && Number.isFinite(prop.maximum)) {
        const input = minimalValid(schema);
        setField(input, field, prop.maximum);
        if (provablyValid(schema, input)) out.push(accept("boundary-max", `${toolName}__boundary-max__${field}`, field, input, `at maximum ${prop.maximum}; should accept`));
        const aboveValue = prop.maximum + 1;
        if (Number.isFinite(aboveValue) && aboveValue > prop.maximum) {
          const above = minimalValid(schema);
          setField(above, field, aboveValue);
          out.push(reject("boundary-above-max", `${toolName}__boundary-above-max__${field}`, field, above, `above maximum ${prop.maximum}; should reject`));
        }
      }
    } else if (prop.type === "string") {
      const minLength = prop.minLength;
      const maxLength = prop.maxLength;
      if (typeof minLength === "number" && Number.isSafeInteger(minLength) && minLength > 0 && minLength <= MAX_SAMPLE_LENGTH + 1) {
        const below = minimalValid(schema);
        setField(below, field, "x".repeat(minLength - 1));
        out.push(reject("boundary-below-min", `${toolName}__boundary-below-min-length__${field}`, field, below, `length ${minLength - 1} < minLength ${minLength}`));
      }
      if (typeof maxLength === "number" && Number.isSafeInteger(maxLength) && maxLength >= 0 && maxLength < MAX_SAMPLE_LENGTH) {
        const above = minimalValid(schema);
        setField(above, field, "x".repeat(maxLength + 1));
        out.push(reject("boundary-above-max", `${toolName}__boundary-above-max-length__${field}`, field, above, `length ${maxLength + 1} > maxLength ${maxLength}`));
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
    let outside = "__not_in_enum__";
    while (prop.enum.includes(outside)) outside += "_";
    setField(input, field, outside);
    out.push(reject("enum-violation", `${toolName}__enum-violation__${field}`, field, input, `value not in enum [${prop.enum.join(", ")}]`));
  }
  return out;
}
