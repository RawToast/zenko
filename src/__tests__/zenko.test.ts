import { describe, test, expect } from "bun:test"
import { generate, type OpenAPISpec } from "../zenko"

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
  })
})
