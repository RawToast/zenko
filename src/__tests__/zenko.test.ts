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
  })
})
