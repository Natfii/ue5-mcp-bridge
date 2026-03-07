import { describe, it, expect } from "vitest";
import { convertToMCPSchema, convertAnnotations } from "../../lib.js";

// ─── convertToMCPSchema ──────────────────────────────────────────────

describe("convertToMCPSchema", () => {
  it("returns empty properties and no required for null params", () => {
    const schema = convertToMCPSchema(null);
    expect(schema).toEqual({
      type: "object",
      properties: {},
      required: undefined,
    });
  });

  it("returns empty properties and no required for undefined params", () => {
    const schema = convertToMCPSchema(undefined);
    expect(schema).toEqual({
      type: "object",
      properties: {},
      required: undefined,
    });
  });

  it("returns empty properties and no required for empty array", () => {
    const schema = convertToMCPSchema([]);
    expect(schema).toEqual({
      type: "object",
      properties: {},
      required: undefined,
    });
  });

  it("maps string type correctly", () => {
    const schema = convertToMCPSchema([
      { name: "path", type: "string", description: "A path" },
    ]);
    expect(schema.properties.path.type).toBe("string");
    expect(schema.properties.path.description).toBe("A path");
  });

  it("maps number type correctly", () => {
    const schema = convertToMCPSchema([
      { name: "count", type: "number", description: "Count" },
    ]);
    expect(schema.properties.count.type).toBe("number");
  });

  it("maps boolean type correctly", () => {
    const schema = convertToMCPSchema([
      { name: "flag", type: "boolean", description: "Flag" },
    ]);
    expect(schema.properties.flag.type).toBe("boolean");
  });

  it("maps array type correctly", () => {
    const schema = convertToMCPSchema([
      { name: "items", type: "array", description: "Items" },
    ]);
    expect(schema.properties.items.type).toBe("array");
  });

  it("maps object type correctly", () => {
    const schema = convertToMCPSchema([
      { name: "config", type: "object", description: "Config" },
    ]);
    expect(schema.properties.config.type).toBe("object");
  });

  it("falls back to string for unknown types", () => {
    const schema = convertToMCPSchema([
      { name: "foo", type: "custom_type", description: "Unknown" },
    ]);
    expect(schema.properties.foo.type).toBe("string");
  });

  it("omits type field entirely for 'any' type", () => {
    const schema = convertToMCPSchema([
      { name: "value", type: "any", description: "Any value" },
    ]);
    expect(schema.properties.value).not.toHaveProperty("type");
    expect(schema.properties.value.description).toBe("Any value");
  });

  it("'any' type with required still appears in required array", () => {
    const schema = convertToMCPSchema([
      { name: "value", type: "any", description: "Any value", required: true },
    ]);
    expect(schema.properties.value).not.toHaveProperty("type");
    expect(schema.required).toContain("value");
  });

  it("includes default value when provided", () => {
    const schema = convertToMCPSchema([
      { name: "x", type: "number", description: "X", default: 42 },
    ]);
    expect(schema.properties.x.default).toBe(42);
  });

  it("omits default key when not provided", () => {
    const schema = convertToMCPSchema([
      { name: "x", type: "number", description: "X" },
    ]);
    expect(schema.properties.x).not.toHaveProperty("default");
  });

  it("populates required array only for required params", () => {
    const schema = convertToMCPSchema([
      { name: "a", type: "string", description: "A", required: true },
      { name: "b", type: "string", description: "B", required: false },
      { name: "c", type: "string", description: "C", required: true },
    ]);
    expect(schema.required).toEqual(["a", "c"]);
  });

  it("returns undefined required when no params are required", () => {
    const schema = convertToMCPSchema([
      { name: "a", type: "string", description: "A", required: false },
    ]);
    expect(schema.required).toBeUndefined();
  });
});

// ─── convertAnnotations ──────────────────────────────────────────────

describe("convertAnnotations", () => {
  it("returns safe defaults when annotations is null", () => {
    expect(convertAnnotations(null)).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it("returns safe defaults when annotations is undefined", () => {
    expect(convertAnnotations(undefined)).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it("passes through all provided annotation values", () => {
    const input = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    };
    expect(convertAnnotations(input)).toEqual(input);
  });

  it("fills missing fields with defaults via nullish coalescing", () => {
    const partial = { readOnlyHint: true };
    expect(convertAnnotations(partial)).toEqual({
      readOnlyHint: true,
      destructiveHint: true, // default
      idempotentHint: false, // default
      openWorldHint: false, // default
    });
  });

  it("does not replace false with default (nullish coalescing check)", () => {
    const input = {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    };
    expect(convertAnnotations(input)).toEqual(input);
  });
});
