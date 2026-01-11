import { describe, test, expect } from "bun:test"
import {
  CONTENT_TYPE_MAP,
  findContentType,
  normalizeResponseSchema,
  resolveParameter,
} from "../schema-utils"
import type { OpenAPISpec } from "../../zenko"

describe("CONTENT_TYPE_MAP", () => {
  test("should have expected content type mappings", () => {
    expect(CONTENT_TYPE_MAP["application/json"]).toBe("unknown")
    expect(CONTENT_TYPE_MAP["text/csv"]).toBe("string")
    expect(CONTENT_TYPE_MAP["text/plain"]).toBe("string")
    expect(CONTENT_TYPE_MAP["application/octet-stream"]).toBe("unknown")
    expect(CONTENT_TYPE_MAP["application/pdf"]).toBe("unknown")
  })
})

describe("findContentType", () => {
  test("should prefer application/json when available", () => {
    const content = {
      "application/json": { schema: {} },
      "text/plain": { schema: {} },
      "text/csv": { schema: {} },
    }
    expect(findContentType(content)).toBe("application/json")
  })

  test("should use mapped content type when JSON not available", () => {
    const content = {
      "text/csv": { schema: {} },
      "text/plain": { schema: {} },
    }
    expect(findContentType(content)).toBe("text/csv")
  })

  test("should return first available when no mapped types present", () => {
    const content = {
      "application/xml": { schema: {} },
      "text/html": { schema: {} },
    }
    expect(findContentType(content)).toBe("application/xml")
  })

  test("should handle single content type", () => {
    const content = {
      "application/json": { schema: {} },
    }
    expect(findContentType(content)).toBe("application/json")
  })

  test("should return empty string for empty content", () => {
    expect(findContentType({})).toBe("")
  })

  test("should prefer JSON over other mapped types", () => {
    const content = {
      "text/csv": { schema: {} },
      "application/json": { schema: {} },
      "text/plain": { schema: {} },
    }
    expect(findContentType(content)).toBe("application/json")
  })

  test("should handle application/octet-stream", () => {
    const content = {
      "application/octet-stream": { schema: {} },
    }
    expect(findContentType(content)).toBe("application/octet-stream")
  })

  test("should handle application/pdf", () => {
    const content = {
      "application/pdf": { schema: {} },
    }
    expect(findContentType(content)).toBe("application/pdf")
  })
})

describe("normalizeResponseSchema", () => {
  test("should map text responses to string and keep enums", () => {
    const enumSchema = {
      type: "string",
      enum: ["OK", "DEGRADED"],
    }
    expect(normalizeResponseSchema("text/plain", enumSchema)).toEqual({
      type: "string",
      enum: ["OK", "DEGRADED"],
    })
  })

  test("should preserve nullable and enum for text responses", () => {
    const nullableEnumSchema = {
      type: "string",
      enum: ["OK", "DEGRADED"],
      nullable: true,
    }
    expect(normalizeResponseSchema("text/plain", nullableEnumSchema)).toEqual({
      type: "string",
      enum: ["OK", "DEGRADED"],
      nullable: true,
    })
  })

  test("should preserve nullable for text responses", () => {
    const nullableSchema = { type: "string", nullable: true }
    expect(normalizeResponseSchema("text/plain", nullableSchema)).toEqual({
      type: "string",
      nullable: true,
    })
  })

  test("should normalize text responses to string", () => {
    const textSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
    }
    expect(normalizeResponseSchema("text/plain", textSchema)).toEqual({
      type: "string",
    })
  })

  test("should keep $ref schemas for text responses", () => {
    const refSchema = { $ref: "#/components/schemas/errorMessage" }
    expect(normalizeResponseSchema("text/html", refSchema)).toEqual(refSchema)
  })

  test("should return json schema for json responses", () => {
    const jsonSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
    }
    expect(normalizeResponseSchema("application/json", jsonSchema)).toEqual(
      jsonSchema
    )
  })

  test("should map xml responses to string", () => {
    const xmlSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
    }
    expect(normalizeResponseSchema("application/xml", xmlSchema)).toEqual({
      type: "string",
    })
  })

  test("should no-op for binary content types", () => {
    const binarySchema = { type: "string", format: "binary" }
    expect(normalizeResponseSchema("application/pdf", binarySchema)).toEqual(
      binarySchema
    )
  })
})

describe("resolveParameter", () => {
  test("should return undefined for undefined parameter", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {},
    }
    expect(resolveParameter(undefined, spec)).toBeUndefined()
  })

  test("should return parameter as-is when no $ref", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {},
    }
    const param = {
      name: "id",
      in: "query",
      schema: { type: "string" },
    }
    expect(resolveParameter(param, spec)).toEqual(param)
  })

  test("should resolve parameter reference", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {},
      components: {
        parameters: {
          IdParam: {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        },
      },
    }
    const param = {
      $ref: "#/components/parameters/IdParam",
    }
    const resolved = resolveParameter(param, spec)
    expect(resolved).toEqual({
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string" },
    })
  })

  test("should return undefined for non-existent reference", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {},
      components: {
        parameters: {},
      },
    }
    const param = {
      $ref: "#/components/parameters/NonExistent",
    }
    expect(resolveParameter(param, spec)).toBeUndefined()
  })

  test("should merge overrides with resolved parameter", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {},
      components: {
        parameters: {
          BaseParam: {
            name: "id",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        },
      },
    }
    const param = {
      $ref: "#/components/parameters/BaseParam",
      required: true,
      description: "Override description",
    }
    const resolved = resolveParameter(param, spec)
    expect(resolved).toEqual({
      name: "id",
      in: "query",
      required: true,
      schema: { type: "string" },
      description: "Override description",
    })
  })

  test("should not include $ref in resolved result", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {},
      components: {
        parameters: {
          TestParam: {
            name: "test",
            in: "header",
            schema: { type: "number" },
          },
        },
      },
    }
    const param = {
      $ref: "#/components/parameters/TestParam",
    }
    const resolved = resolveParameter(param, spec)
    expect(resolved).not.toHaveProperty("$ref")
    expect(resolved).toEqual({
      name: "test",
      in: "header",
      schema: { type: "number" },
    })
  })

  test("should handle spec without components", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {},
    }
    const param = {
      $ref: "#/components/parameters/SomeParam",
    }
    expect(resolveParameter(param, spec)).toBeUndefined()
  })

  test("should handle spec without parameters in components", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {},
      components: {
        schemas: {},
      },
    }
    const param = {
      $ref: "#/components/parameters/SomeParam",
    }
    expect(resolveParameter(param, spec)).toBeUndefined()
  })
})
