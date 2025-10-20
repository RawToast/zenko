import { describe, test, expect } from "bun:test"
import { generate, type OpenAPISpec } from "../zenko"

describe("tree-shaking integration", () => {
  test("tree-shakes imports when enabled", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            response: {
              "200": { description: "Success" },
            },
          },
        },
      },
    }

    // Without tree-shaking (default)
    const resultWithoutTreeShake = generate(spec, {
      types: { treeShake: false },
    })
    expect(resultWithoutTreeShake).toContain(
      'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "zenko";'
    )

    // With tree-shaking enabled
    const resultWithTreeShake = generate(spec, {
      types: { treeShake: true },
    })

    // Should import OperationDefinition and OperationErrors (default type)
    expect(resultWithTreeShake).toContain(
      'import type { OperationDefinition, OperationErrors } from "zenko";'
    )
    expect(resultWithTreeShake).not.toContain("PathFn")
    expect(resultWithTreeShake).not.toContain("HeaderFn")
  })

  test("includes all types when they are used", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {
        "/test/{id}": {
          get: {
            operationId: "getTest",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: {
              "200": { description: "Success" },
              "400": { description: "Bad Request" },
            },
          },
        },
      },
    }

    const result = generate(spec, {
      types: { treeShake: true },
    })

    // Should include only OperationDefinition and OperationErrors (PathFn is never used in package/file mode)
    expect(result).toContain(
      'import type { OperationDefinition, OperationErrors } from "zenko";'
    )
    expect(result).not.toContain("HeaderFn")
  })

  test("returns no import when no operations exist", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test API", version: "1.0.0" },
      paths: {},
    }

    const result = generate(spec, {
      types: { treeShake: true },
    })

    // Should not include any zenko import
    expect(result).not.toContain("import type")
    expect(result).not.toContain('from "zenko"')
  })
})
