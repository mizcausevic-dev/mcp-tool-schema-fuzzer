import { isDeepStrictEqual } from "node:util";

import type { JsonSchema } from "./types.js";

// This is deliberately a bounded proof for the subset we generate, not a
// general JSON Schema validator. Unknown assertions make an accept verdict
// unprovable; in particular, never execute an untrusted `pattern` as a RegExp.
const KEYWORDS = new Set([
  "type", "properties", "required", "additionalProperties", "enum",
  "minimum", "maximum", "minLength", "maxLength", "items",
  "$schema", "$id", "$comment", "title", "description", "default",
  "examples", "deprecated", "readOnly", "writeOnly"
]);
const MAX_DEPTH = 8;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True only when this bounded checker can prove an input satisfies its schema. */
export function provablyValid(schema: JsonSchema, value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH || !object(schema)) return false;
  if (Object.keys(schema).some((key) => !KEYWORDS.has(key))) return false;

  if (schema.type !== undefined) {
    const matches = (() => {
      switch (schema.type) {
        case "object": return object(value);
        case "array": return Array.isArray(value);
        case "string": return typeof value === "string";
        case "number": return typeof value === "number" && Number.isFinite(value);
        case "integer": return typeof value === "number" && Number.isSafeInteger(value);
        case "boolean": return typeof value === "boolean";
        case "null": return value === null;
        default: return false;
      }
    })();
    if (!matches) return false;
  }

  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || !schema.enum.some((entry) => isDeepStrictEqual(entry, value))) return false;
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && (typeof schema.minimum !== "number" || !Number.isFinite(schema.minimum) || value < schema.minimum)) return false;
    if (schema.maximum !== undefined && (typeof schema.maximum !== "number" || !Number.isFinite(schema.maximum) || value > schema.maximum)) return false;
  }
  if (typeof value === "string") {
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && (!Number.isSafeInteger(schema.minLength) || schema.minLength < 0 || length < schema.minLength)) return false;
    if (schema.maxLength !== undefined && (!Number.isSafeInteger(schema.maxLength) || schema.maxLength < 0 || length > schema.maxLength)) return false;
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    if (!object(schema.items) || value.some((item) => !provablyValid(schema.items!, item, depth + 1))) return false;
  }
  if (object(value)) {
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== "string" || !Object.hasOwn(value, name)))) return false;
    if (schema.properties !== undefined && !object(schema.properties)) return false;
    for (const [name, item] of Object.entries(value)) {
      if (schema.properties && Object.hasOwn(schema.properties, name)) {
        if (!provablyValid(schema.properties[name]!, item, depth + 1)) return false;
      } else if (schema.additionalProperties === false) {
        return false;
      } else if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
        if (!object(schema.additionalProperties) || !provablyValid(schema.additionalProperties, item, depth + 1)) return false;
      }
    }
  }
  return true;
}
