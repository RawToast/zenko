import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import * as fs from "fs"
import { parseYaml } from "../utils/yaml"
import * as path from "path"
import { generate } from "../zenko"

describe("DateEnum", () => {
  const tempDir = path.join(process.cwd(), "temp-test")

  beforeAll(() => {
    // Create temp directory for test output
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
  })

  afterAll(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  test("generates complete TypeScript output", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("date-enum-complete-output")
  })

  test("generates complete TypeScript output with strict options", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, {
      strictDates: true,
      strictNumeric: true,
    })

    expect(result).toMatchSnapshot("date-enum-complete-output-strict")
  })

  test("generates all expected schemas with proper types", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml)

    // Should generate all schemas
    expect(result).toContain("export const ErrorResponseStatus =")
    expect(result).toContain("export const CreateSomethingRequest =")
    expect(result).toContain("export const Status =")
    expect(result).toContain("export const Version =")
    expect(result).toContain("export const CreateSomethingErrorResponse =")

    // Should generate inferred types
    expect(result).toContain("export type ErrorResponseStatus =")
    expect(result).toContain("export type CreateSomethingRequest =")
    expect(result).toContain("export type Status =")
    expect(result).toContain("export type Version =")
    expect(result).toContain("export type CreateSomethingErrorResponse =")
  })

  test("generates enum schemas with proper values", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml)

    // Should generate MerchantStatus enum
    expect(result).toContain("Status =")
    expect(result).toContain('"enabled"')
    expect(result).toContain('"disabled"')
    expect(result).toContain('"closed"')

    // Should generate ApiVersion enum with exact date strings from spec
    expect(result).toContain("Version =")
    expect(result).toContain("z.enum(")
    expect(result).toContain('"2016-01-19"')
    expect(result).toContain('"2016-07-01"')
    expect(result).toContain('"2018-04-10"')
    expect(result).toContain('"2023-08-01"')

    // Should NOT contain parsed date strings
    expect(result).not.toContain("Tue Jan 19 2016")
    expect(result).not.toContain("Coordinated Universal Time")
  })

  test("generates date-time format schemas", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml)

    // Should generate DateTime schema with date-time format
    expect(result).toContain("export const DateTime =")
    expect(result).toContain("z.string()")
  })

  test("generates path functions with parameters", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml)

    // Should generate path function
    expect(result).toContain("export const paths = {")
    expect(result).toContain(
      "createSomething: ({ someId }: { someId: string }) =>"
    )
    expect(result).toContain("`/my-service/${someId}/create`")
  })

  test("generates operation objects with correct properties", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml)

    // Should generate operation object with type annotation
    expect(result).toContain(
      "export const createSomething: CreateSomethingOperation = {"
    )

    // Should include correct properties
    expect(result).toContain("path: paths.createSomething,")

    // Should include request type
    expect(result).toContain("request: CreateSomethingRequest,")

    // Should include method
    expect(result).toContain('method: "post"')
  })

  test("generates header functions for operations", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml)

    // Should generate header functions
    expect(result).toContain("export const headers = {")
    expect(result).toContain("createSomething:")
  })

  test("generates operation objects without type annotations when types disabled", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, { types: { emit: false } })

    // Should generate operation object without type annotation
    expect(result).toContain("export const createSomething = {")

    // Should not include operation type
    expect(result).not.toContain("export type CreateSomethingOperation =")
  })

  test("handles error response schemas correctly", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml)

    // Should generate error response schema
    expect(result).toContain("export const CreateSomethingErrorResponse =")
    expect(result).toContain("statusCode:")
    expect(result).toContain("errorType:")
    expect(result).toContain("message:")
  })

  test("generates open enums with openEnums: true", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, { openEnums: true })

    // Should generate open enum with Unknown template literal
    expect(result).toContain(
      'const StatusKnown = ["enabled", "disabled", "closed"] as const;'
    )
    expect(result).toContain("export const Status = z.enum(StatusKnown).or(")
    expect(result).toContain(
      "z.string().transform((v): `Unknown:${string}` => `Unknown:${v}`)"
    )

    // Version should also be open
    expect(result).toContain("const VersionKnown =")
    expect(result).toContain("export const Version = z.enum(VersionKnown).or(")
  })

  test("generates open enums only for specified enum names", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, { openEnums: ["Status"] })

    // Status should be open
    expect(result).toContain(
      'const StatusKnown = ["enabled", "disabled", "closed"] as const;'
    )
    expect(result).toContain("export const Status = z.enum(StatusKnown).or(")

    // Version should NOT be open (using standard z.enum)
    expect(result).toContain("export const Version = z.enum([")
    expect(result).not.toContain("const VersionKnown =")
  })

  test("generates complete output with open enums", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, { openEnums: true })

    expect(result).toMatchSnapshot("date-enum-open-enums")
  })

  test("generates open enums with object config form and custom prefix", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, {
      openEnums: { open: true, unknownPrefix: "unrecognized_" },
    })

    // Should generate open enum with custom prefix
    expect(result).toContain(
      'const StatusKnown = ["enabled", "disabled", "closed"] as const;'
    )
    expect(result).toContain("export const Status = z.enum(StatusKnown).or(")
    expect(result).toContain(
      "z.string().transform((v): `unrecognized_${string}` => `unrecognized_${v}`)"
    )

    // Version should also use custom prefix
    expect(result).toContain("const VersionKnown =")
    expect(result).toContain("export const Version = z.enum(VersionKnown).or(")
    expect(result).toContain(
      "z.string().transform((v): `unrecognized_${string}` => `unrecognized_${v}`)"
    )
  })

  test("generates open enums with object config form and selective enums", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, {
      openEnums: { open: ["Status"], unknownPrefix: "x-" },
    })

    // Status should be open with custom prefix
    expect(result).toContain(
      'const StatusKnown = ["enabled", "disabled", "closed"] as const;'
    )
    expect(result).toContain("export const Status = z.enum(StatusKnown).or(")
    expect(result).toContain(
      "z.string().transform((v): `x-${string}` => `x-${v}`)"
    )

    // Version should NOT be open (using standard z.enum)
    expect(result).toContain("export const Version = z.enum([")
    expect(result).not.toContain("const VersionKnown =")
  })

  test("generates open enums with object config form and default prefix", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, {
      openEnums: { open: true },
    })

    // Should use default "Unknown:" prefix when not specified
    expect(result).toContain(
      "z.string().transform((v): `Unknown:${string}` => `Unknown:${v}`)"
    )
  })

  test("backwards compatibility: openEnums: true still works", () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, { openEnums: true })

    // Should use default "Unknown:" prefix
    expect(result).toContain(
      "z.string().transform((v): `Unknown:${string}` => `Unknown:${v}`)"
    )
  })

  test('backwards compatibility: openEnums: ["Status"] still works', () => {
    const dateEnumContent = fs.readFileSync(
      "src/resources/date-enum.yaml",
      "utf8"
    )
    const specYaml = parseYaml(dateEnumContent)
    const result = generate(specYaml, { openEnums: ["Status"] })

    // Should use default "Unknown:" prefix
    expect(result).toContain(
      "z.string().transform((v): `Unknown:${string}` => `Unknown:${v}`)"
    )
  })
})
