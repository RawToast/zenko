import { describe, test, expect } from "bun:test"
import { OpenAPIGenerator, type OpenAPISpec } from "../zenko"
import * as fs from "fs"
import jsYaml from "js-yaml"

describe("OpenAPIGenerator", () => {
  describe("Petstore OpenAPI spec", () => {
    test("generates complete TypeScript output", () => {
      const petstoreContent = fs.readFileSync(
        "src/resources/petstore.yaml",
        "utf8"
      )
      const specYaml = jsYaml.load(petstoreContent) as OpenAPISpec
      const generator = new OpenAPIGenerator(specYaml)
      const result = generator.generate()

      expect(result).toMatchSnapshot("petstore-complete-output")
    })

    test("includes Zod import", () => {
      const petstoreContent = fs.readFileSync(
        "src/resources/petstore.yaml",
        "utf8"
      )
      const specYaml = jsYaml.load(petstoreContent) as OpenAPISpec
      const generator = new OpenAPIGenerator(specYaml)
      const result = generator.generate()

      expect(result).toContain('import { z } from "zod"')
    })

    test("generates schemas in correct dependency order", () => {
      const petstoreContent = fs.readFileSync(
        "src/resources/petstore.yaml",
        "utf8"
      )
      const specYaml = jsYaml.load(petstoreContent) as OpenAPISpec
      const generator = new OpenAPIGenerator(specYaml)
      const result = generator.generate()

      // Pet should come before Pets since Pets references Pet
      const petIndex = result.indexOf("export const Pet =")
      const petsIndex = result.indexOf("export const Pets =")
      expect(petIndex).toBeGreaterThan(-1)
      expect(petsIndex).toBeGreaterThan(-1)
      expect(petIndex).toBeLessThan(petsIndex)
    })

    test("generates all expected schemas", () => {
      const petstoreContent = fs.readFileSync(
        "src/resources/petstore.yaml",
        "utf8"
      )
      const specYaml = jsYaml.load(petstoreContent) as OpenAPISpec
      const generator = new OpenAPIGenerator(specYaml)
      const result = generator.generate()

      expect(result).toContain("export const Pet =")
      expect(result).toContain("export const Pets =")
      expect(result).toContain("export const Error =")
      expect(result).toContain("export type Pet =")
      expect(result).toContain("export type Pets =")
      expect(result).toContain("export type Error =")
    })

    test("generates path functions", () => {
      const petstoreContent = fs.readFileSync(
        "src/resources/petstore.yaml",
        "utf8"
      )
      const specYaml = jsYaml.load(petstoreContent) as OpenAPISpec
      const generator = new OpenAPIGenerator(specYaml)
      const result = generator.generate()

      expect(result).toContain("export const paths = {")
      expect(result).toContain("listPets:")
      expect(result).toContain("createPets:")
      expect(result).toContain("showPetById:")
    })

    test("generates operation objects", () => {
      const petstoreContent = fs.readFileSync(
        "src/resources/petstore.yaml",
        "utf8"
      )
      const specYaml = jsYaml.load(petstoreContent) as OpenAPISpec
      const generator = new OpenAPIGenerator(specYaml)
      const result = generator.generate()

      expect(result).toContain("export const listPets =")
      expect(result).toContain("export const createPets =")
      expect(result).toContain("export const showPetById =")
    })
  })

  describe("Edge cases", () => {
    test("handles empty spec", () => {
      const emptySpec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Empty", version: "1.0.0" },
        paths: {},
      }
      const generator = new OpenAPIGenerator(emptySpec)
      const result = generator.generate()

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
      const generator = new OpenAPIGenerator(simpleSpec)
      const result = generator.generate()

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
      const generator = new OpenAPIGenerator(circularSpec)
      const result = generator.generate()

      expect(result).toContain("export const A =")
      expect(result).toContain("export const B =")
      expect(result).toMatchSnapshot("circular-dependencies-output")
    })
  })
})
