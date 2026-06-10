import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import * as path from "path"
import { pathToFileURL } from "url"
import { nullableAllOfErrorsYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate, type OpenAPISpec } from "../zenko"

type RuntimeSchema = {
  safeParse: (value: unknown) => { success: boolean }
}

type GeneratedSchemas = {
  Record: RuntimeSchema
  ListRecordsError: RuntimeSchema
  GetRecordError: RuntimeSchema
  UpdateRecordError: RuntimeSchema
}

function expectSchemaToAccept(schema: RuntimeSchema, value: unknown): void {
  expect(schema.safeParse(value).success).toBe(true)
}

function expectSchemaToReject(schema: RuntimeSchema, value: unknown): void {
  expect(schema.safeParse(value).success).toBe(false)
}

describe("Nullable Types and AllOf Error Schemas", () => {
  const loadSpec = () => {
    const specContent = fs.readFileSync(nullableAllOfErrorsYamlPath, "utf8")
    return parseYaml(specContent) as OpenAPISpec
  }

  const importGeneratedSchemas = async (): Promise<GeneratedSchemas> => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), ".zenko-nullable-allof-")
    )
    const generatedPath = path.join(tempDir, "nullable-allof-errors.gen.ts")
    fs.writeFileSync(generatedPath, generate(loadSpec()))

    try {
      return (await import(
        pathToFileURL(generatedPath).href
      )) as GeneratedSchemas
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
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

  describe("OpenAPI 3.1 nullable array types (type: [string, null])", () => {
    test("maps nullable string fields to string | null union", () => {
      const result = generate(loadSpec())

      expect(result).toContain("notes: z.union([z.string(), z.null()]),")
      expect(result).toContain("completed_at: z.union([z.string(), z.null()]),")
      expect(result).toContain("archived_at: z.union([z.string(), z.null()]),")
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

    test("generated schema accepts null but rejects omitted nullable fields", async () => {
      const schemas = await importGeneratedSchemas()

      expectSchemaToAccept(schemas.Record, {
        id: "record-1",
        status: "draft",
        notes: null,
        completed_at: null,
        archived_at: "2026-01-01T00:00:00Z",
      })
      expectSchemaToReject(schemas.Record, {
        id: "record-1",
        status: "draft",
        completed_at: null,
        archived_at: null,
      })
      expectSchemaToReject(schemas.Record, {
        id: "record-1",
        status: "draft",
        notes: 123,
        completed_at: null,
        archived_at: null,
      })
    })
  })

  describe("allOf inheritance with required + enum", () => {
    test("extends base error via merge and keeps code required", () => {
      const result = generate(loadSpec())

      expect(result).toContain(
        "export const ListRecordsError = BaseEndpointError.merge"
      )
      expect(result).toContain(
        'code: z.enum(["record.invalid", "internal_error"]),'
      )
      expect(result).not.toContain(
        'code: z.enum(["record.invalid", "internal_error"]).optional(),'
      )
    })

    test("preserves per-operation enum constraints on code", () => {
      const result = generate(loadSpec())

      expect(result).toContain(
        'code: z.enum(["record.invalid", "record.not_found", "internal_error"]),'
      )
      expect(result).toContain(
        'code: z.enum(["record.invalid", "record.invalid_transition", "record.not_found", "internal_error"]),'
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

    test("generated schemas require error fields and enforce enum values", async () => {
      const schemas = await importGeneratedSchemas()
      const validError = {
        status: "400",
        code: "record.invalid",
        title: "Invalid request",
        description: "The request could not be processed.",
        retryable: false,
      }

      expectSchemaToAccept(schemas.ListRecordsError, validError)
      expectSchemaToReject(schemas.ListRecordsError, {
        ...validError,
        code: "not.allowed",
      })
      expectSchemaToReject(schemas.ListRecordsError, {
        status: "400",
        title: "Invalid request",
        description: "The request could not be processed.",
        retryable: false,
      })
      expectSchemaToReject(schemas.ListRecordsError, {
        code: "record.invalid",
        title: "Invalid request",
        description: "The request could not be processed.",
        retryable: false,
      })
    })

    test("generated schemas preserve per-operation error enums", async () => {
      const schemas = await importGeneratedSchemas()
      const baseError = {
        status: "404",
        title: "Not found",
        description: "The record was not found.",
        retryable: false,
      }

      expectSchemaToAccept(schemas.GetRecordError, {
        ...baseError,
        code: "record.not_found",
      })
      expectSchemaToAccept(schemas.UpdateRecordError, {
        ...baseError,
        code: "record.invalid_transition",
      })
      expectSchemaToReject(schemas.ListRecordsError, {
        ...baseError,
        code: "record.invalid_transition",
      })
    })
  })
})
