import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { nullableAllOfErrorsYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe("Nullable Types and AllOf Error Schemas", () => {
  const loadSpec = () => {
    const specContent = fs.readFileSync(nullableAllOfErrorsYamlPath, "utf8")
    return parseYaml(specContent) as OpenAPISpec
  }

  test("generates complete TypeScript output", () => {
    const result = generate(loadSpec())
    expect(result).toMatchSnapshot("nullable-allof-errors-complete-output")
  })

  test("generates all expected schemas and operations", () => {
    const result = generate(loadSpec())

    const expectedSchemas = [
      "BaseEndpointError",
      "ListRecordsError",
      "GetRecordError",
      "UpdateRecordError",
      "RecordStatus",
      "Record",
      "StatusUpdateRequest",
      "RecordListResponse",
    ]

    for (const schema of expectedSchemas) {
      expect(result).toContain(`export const ${schema} =`)
      expect(result).toContain(`export type ${schema} =`)
    }

    expect(result).toContain("export const listRecords:")
    expect(result).toContain("export const getRecord:")
    expect(result).toContain("export const updateRecordStatus:")
  })

  describe("Issue: OpenAPI 3.1 nullable array types (type: [string, null])", () => {
    test("maps nullable string fields to z.unknown() instead of string | null", () => {
      const result = generate(loadSpec())

      // Known limitation: getZodTypeFromSchema switch falls through for array types
      expect(result).toContain("notes: z.unknown(),")
      expect(result).toContain("completed_at: z.unknown(),")
      expect(result).toContain("archived_at: z.unknown(),")
    })

    test("oneOf string and null workaround generates a proper union", () => {
      const specContent = `openapi: 3.1.0
info:
  title: Nullable Workaround
  version: 1.0.0
paths: {}
components:
  schemas:
    NullableNotes:
      oneOf:
        - type: string
        - type: "null"
`
      const result = generate(parseYaml(specContent) as OpenAPISpec)

      expect(result).toContain(
        "export const NullableNotes = z.union([z.string(), z.null()]);"
      )
    })
  })

  describe("Issue: allOf inheritance with required + enum", () => {
    test("extends base error via merge but makes code optional", () => {
      const result = generate(loadSpec())

      expect(result).toContain(
        "export const ListRecordsError = BaseEndpointError.merge"
      )
      expect(result).toContain(
        'code: z.enum(["record.invalid", "internal_error"]).optional(),'
      )
    })

    test("preserves per-operation enum constraints on code", () => {
      const result = generate(loadSpec())

      expect(result).toContain(
        'code: z.enum(["record.invalid", "record.not_found", "internal_error"]).optional(),'
      )
      expect(result).toContain(
        'code: z.enum(["record.invalid", "record.invalid_transition", "record.not_found", "internal_error"]).optional(),'
      )
    })

    test("keeps code required on the base error schema", () => {
      const result = generate(loadSpec())

      expect(result).toMatch(
        /export const BaseEndpointError = z\.object\(\{[\s\S]*code: z\.string\(\),/
      )
      expect(result).not.toMatch(
        /export const BaseEndpointError = z\.object\(\{[\s\S]*code: z\.string\(\)\.optional\(\)/
      )
    })
  })
})
