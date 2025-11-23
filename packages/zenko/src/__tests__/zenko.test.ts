import { describe, test, expect } from "bun:test"
import { generate, generateWithMetadata, type OpenAPISpec } from "../zenko"
import { loadOpenAPISpec } from "../utils/yaml"

describe("generate", () => {
  describe("Edge cases", () => {
    test("handles empty spec", () => {
      const emptySpec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Empty", version: "1.0.0" },
        paths: {},
      }
      const result = generate(emptySpec)

      expect(result).toContain('import { z } from "zod"')
      expect(result).toContain("export const paths = {")
      expect(result).toMatchSnapshot("empty-spec-output")
    })

    test("handles spec with no components", () => {
      const simpleSpec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Simple", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operationId: "getTest",
              responses: {
                "200": {
                  description: "OK",
                },
              },
            },
          },
        },
      }
      const result = generate(simpleSpec)

      expect(result).toContain("getTest:")
      expect(result).toMatchSnapshot("no-components-spec-output")
    })

    test("handles circular dependencies gracefully", () => {
      const circularSpec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Circular", version: "1.0.0" },
        paths: {},
        components: {
          schemas: {
            A: {
              type: "object",
              properties: {
                b: { $ref: "#/components/schemas/B" },
              },
            },
            B: {
              type: "object",
              properties: {
                a: { $ref: "#/components/schemas/A" },
              },
            },
          },
        },
      }
      const result = generate(circularSpec)

      expect(result).toContain("export const A =")
      expect(result).toContain("export const B =")
      expect(result).toMatchSnapshot("circular-dependencies-output")
    })

    test("generates inline object schemas inside arrays", () => {
      const inlineSpec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Inline", version: "1.0.0" },
        paths: {},
        components: {
          schemas: {
            CollectionResponse: {
              type: "object",
              required: ["members"],
              properties: {
                members: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["identifier", "label", "categories"],
                    properties: {
                      identifier: { type: "string" },
                      label: { type: "string" },
                      categories: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = generate(inlineSpec)

      expect(result).toContain(
        "export const CollectionResponse = z.object({\n  members: z.array(z.object({"
      )
      expect(result).toContain("identifier: z.string()")
      expect(result).toContain("label: z.string()")
      expect(result).toContain("categories: z.array(z.string())")
      expect(result).not.toContain("members: z.array(z.unknown())")
    })

    test("generates path helpers with query parameters", () => {
      const querySpec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Query", version: "1.0.0" },
        paths: {
          "/search/{collection}": {
            get: {
              operationId: "searchCollection",
              parameters: [
                {
                  name: "collection",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
                {
                  name: "term",
                  in: "query",
                  required: true,
                  schema: { type: "string" },
                },
                {
                  name: "limit",
                  in: "query",
                  schema: { type: "integer" },
                },
                {
                  name: "includeArchived",
                  in: "query",
                  schema: { type: "boolean" },
                },
                {
                  name: "tags",
                  in: "query",
                  schema: { type: "array", items: { type: "string" } },
                },
              ],
              responses: {
                "200": {
                  description: "OK",
                },
              },
            },
          },
        },
      }

      const result = generate(querySpec)

      expect(result).toContain(
        "searchCollection: ({ collection, term, limit, includeArchived, tags }: { collection: string, term: string, limit?: number, includeArchived?: boolean, tags?: Array<string> }) => {"
      )
      expect(result).toContain("const params = new URLSearchParams()")
      expect(result).toContain('params.set("term", String(term))')
      expect(result).toContain(
        'if (limit !== undefined) {\n      params.set("limit", String(limit))\n    }'
      )
      expect(result).toContain(
        'if (includeArchived !== undefined) {\n      params.set("includeArchived", includeArchived ? "true" : "false")\n    }'
      )
      expect(result).toContain(
        'if (tags !== undefined) {\n      for (const value of tags) {\n        params.append("tags", String(value))\n      }\n    }'
      )
      expect(result).toContain(
        'return `/search/${collection}${_searchParams ? `?${_searchParams}` : ""}`'
      )
    })
  })

  describe("Response inference", () => {
    test("infers string error responses without schemas", () => {
      const spec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Error without schema", version: "1.0.0" },
        paths: {
          "/error": {
            get: {
              operationId: "getErrorWithoutSchema",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        required: ["message"],
                        properties: {
                          message: { type: "string" },
                        },
                      },
                    },
                  },
                },
                "500": {
                  description: "Server error",
                  content: {
                    "text/plain": {},
                  },
                },
              },
            },
          },
        },
      }

      const result = generate(spec)

      expect(result).toContain("getErrorWithoutSchema")
      expect(result).toMatchSnapshot("error-response-inference")
    })
  })

  describe("Type helpers", () => {
    const petstoreSpec = loadOpenAPISpec("src/resources/petstore.yaml")

    test("disables type emission", () => {
      const result = generate(petstoreSpec, {
        types: { emit: false },
      })

      expect(result).not.toContain("// Operation Types")
      expect(result).not.toContain("OperationDefinition<")
      expect(result).not.toContain("import type { PathFn")
      expect(result).not.toContain("type PathFn<")
    })

    test("uses package helpers by default", () => {
      const result = generate(petstoreSpec, {
        types: { treeShake: false },
      })

      expect(result).toContain(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "zenko";'
      )
      expect(result).toContain("// Operation Types")
      expect(result).toContain(
        "export type ListPetsOperation = OperationDefinition<"
      )
      expect(result).not.toContain("type PathFn<")
    })

    test("inlines helper types", () => {
      const result = generate(petstoreSpec, {
        types: { helpers: "inline", treeShake: false },
      })

      expect(result).toContain(
        "type PathFn<TArgs extends unknown[] = []> = (...args: TArgs) => string;"
      )
      expect(result).toContain("type OperationDefinition<")
      expect(result).toContain("// Operation Types")
      expect(result).toContain(
        "export type ListPetsOperation = OperationDefinition<"
      )
      expect(result).not.toContain("import type { PathFn")
    })

    test("uses custom helper import path", () => {
      const result = generate(petstoreSpec, {
        types: {
          helpers: "file",
          helpersOutput: "./custom-types",
          treeShake: false,
        },
      })

      expect(result).toContain(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "./custom-types";'
      )
      expect(result).toContain("// Operation Types")
      expect(result).toContain(
        "export type ListPetsOperation = OperationDefinition<"
      )
      expect(result).not.toContain("type PathFn<")
    })

    test("generates complete inline output", () => {
      const result = generate(petstoreSpec, {
        types: { helpers: "inline", treeShake: false },
      })

      expect(result).toMatchSnapshot("petstore-inline-helpers-output")
    })
  })

  describe("Helper file generation", () => {
    const petstoreSpec = loadOpenAPISpec("src/resources/petstore.yaml")

    test("generateWithMetadata returns helper file info when using file mode", () => {
      const result = generateWithMetadata(petstoreSpec, {
        types: {
          helpers: "file",
          helpersOutput: "./api-types.ts",
          treeShake: false,
        },
      })

      // Should include helper file information
      expect(result.helperFile).toBeDefined()
      expect(result.helperFile?.path).toBe("./api-types.ts")
      expect(result.helperFile?.content).toContain("export type PathFn")
      expect(result.helperFile?.content).toContain(
        "export type OperationDefinition"
      )

      // Main output should import from the helper file
      expect(result.output).toContain(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "./api-types.ts";'
      )
    })

    test("generateWithMetadata does not return helper file for package mode", () => {
      const result = generateWithMetadata(petstoreSpec, {
        types: { helpers: "package", treeShake: false },
      })

      expect(result.helperFile).toBeUndefined()
      expect(result.output).toContain('from "zenko"')
    })

    test("generateWithMetadata does not return helper file for inline mode", () => {
      const result = generateWithMetadata(petstoreSpec, {
        types: { helpers: "inline", treeShake: false },
      })

      expect(result.helperFile).toBeUndefined()
      expect(result.output).toContain("type PathFn<")
    })

    test("generateWithMetadata does not return helper file when emit is false", () => {
      const result = generateWithMetadata(petstoreSpec, {
        types: {
          emit: false,
          helpers: "file",
          helpersOutput: "./types.ts",
          treeShake: false,
        },
      })

      expect(result.helperFile).toBeUndefined()
    })

    test("generate function maintains backward compatibility", () => {
      const result = generate(petstoreSpec, {
        types: { helpers: "file", helpersOutput: "./api-types.ts" },
      })

      // Should return just the string output
      expect(typeof result).toBe("string")
      expect(result).toContain('from "./api-types.ts"')
    })
  })
})
