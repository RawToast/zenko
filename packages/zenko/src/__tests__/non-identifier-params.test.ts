import { describe, it, expect } from "bun:test"
import { generate } from "../zenko"

describe("Non-identifier parameter handling", () => {
  it("should handle parameters with hyphens correctly", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/users/{user-id}": {
          get: {
            operationId: "getUser",
            parameters: [
              {
                name: "user-id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
              {
                name: "filter-name",
                in: "query",
                required: false,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    const result = generate(spec)

    // Should generate valid TypeScript with proper destructuring and aliases
    expect(result).toContain('"user-id": userId, "filter-name": filterName')
    expect(result).toContain('"user-id": string, "filter-name"?: string')
    expect(result).toContain("if (filterName !== undefined)")
    expect(result).toContain('params.set("filter-name", String(filterName))')
    expect(result).toContain("return `/users/${userId}")

    // Should not contain invalid syntax
    expect(result).not.toContain("{ user-id, filter-name }")
    expect(result).not.toContain("user-id: string")
    expect(result).not.toContain('if ("filter-name" !== undefined)')
    expect(result).not.toContain('String("filter-name")')
    expect(result).not.toContain("return `/users/${user-id}")
  })

  it("should handle parameters with other non-identifier characters", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/items/{123item}": {
          get: {
            operationId: "getItem",
            parameters: [
              {
                name: "123item",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
              {
                name: "123filter",
                in: "query",
                required: false,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "Success" } },
          },
        },
      },
    }

    const result = generate(spec)

    // Should alias parameters starting with numbers
    expect(result).toContain('"123item": _123item')
    expect(result).toContain('"123item": string')
    expect(result).toContain("return `/items/${_123item}")

    // Should alias query parameters starting with numbers
    expect(result).toContain('"123filter": _123filter')
    expect(result).toContain('"123filter"?: string')
    expect(result).toContain("if (_123filter !== undefined)")
    expect(result).toContain('params.set("123filter", String(_123filter))')

    // Should not contain invalid syntax
    expect(result).not.toContain("{ 123item }")
    expect(result).not.toContain("123item: string")
    expect(result).not.toContain("return `/items/${123item}")
    expect(result).not.toContain('if ("123filter" !== undefined)')
    expect(result).not.toContain('String("123filter")')
  })
})
