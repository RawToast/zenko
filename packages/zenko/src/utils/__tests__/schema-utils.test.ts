import { describe, test, expect } from "bun:test"
import {
  CONTENT_TYPE_MAP,
  findContentType,
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
