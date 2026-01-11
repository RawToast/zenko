import * as fs from "fs"
import * as path from "path"
import { beforeAll, describe, expect, test } from "bun:test"
import { generate, type OpenAPISpec } from "../zenko"

/**
 * Resolves fixture path relative to this test file, independent of CWD.
 */
function resolveFixture(filename: string): string {
  const testDir = path.dirname(new URL(import.meta.url).pathname)
  return path.join(testDir, "..", "resources", filename)
}

/**
 * Loads and parses a YAML fixture file.
 */
function loadSpec(filename: string): OpenAPISpec {
  const content = fs.readFileSync(resolveFixture(filename), "utf8")
  return Bun.YAML.parse(content) as OpenAPISpec
}

describe("Property Metadata", () => {
  let specYaml: OpenAPISpec
  let result: string

  beforeAll(() => {
    specYaml = loadSpec("property-metadata.yaml")
    result = generate(specYaml)
  })

  test("generates complete TypeScript output", () => {
    // The snapshot captures all metadata handling behavior including
    // readOnly, writeOnly, deprecated, examples, defaults, and const values.
    // This is the primary verification for property metadata handling.
    expect(result).toMatchSnapshot("property-metadata-complete-output")
  })

  test("handles const properties with literal values", () => {
    // Product has const fields: sku, currency
    expect(result).toContain("export const Product =")

    // const should generate z.literal()
    expect(result).toContain('z.literal("CONST_SKU")')
    expect(result).toContain('z.literal("USD")')
  })

  test("handles default values", () => {
    // Settings has many default values
    expect(result).toContain("export const Settings =")

    // Should use .default() in Zod
    expect(result).toContain(".default(")
    expect(result).toContain('.default("user")')
    expect(result).toContain('.default("active")')
    expect(result).toContain(".default(false)")
    expect(result).toContain(".default(true)")
    expect(result).toContain(".default(3600)")
    expect(result).toContain('.default("auto")')
  })

  test("generates all expected schemas", () => {
    // All schemas should be generated
    expect(result).toContain("export const User =")
    expect(result).toContain("export const UserInput =")
    expect(result).toContain("export const UserUpdate =")
    expect(result).toContain("export const Settings =")
    expect(result).toContain("export const SettingsUpdate =")
    expect(result).toContain("export const Product =")

    // Types should be generated
    expect(result).toContain("export type User =")
    expect(result).toContain("export type UserInput =")
    expect(result).toContain("export type UserUpdate =")
    expect(result).toContain("export type Settings =")
    expect(result).toContain("export type SettingsUpdate =")
    expect(result).toContain("export type Product =")
  })

  test("generates operation objects with correct request/response types", () => {
    // createUser should use UserInput for request and User for response
    expect(result).toContain("export const createUser:")
    expect(result).toContain("CreateUserOperation")

    // updateUser should use UserUpdate for request
    expect(result).toContain("export const updateUser:")
    expect(result).toContain("UpdateUserOperation")
  })

  test("handles status const with default value correctly", () => {
    // User.status has both const: active and default: active
    // This is an interesting edge case - const makes it always "active"
    expect(result).toContain("export const User =")
    expect(result).toContain('z.literal("active")')
  })

  test("applies validation constraints with default values", () => {
    const strictResult = generate(specYaml, { strictNumeric: true })

    // SettingsUpdate has constraints on some fields
    expect(strictResult).toContain("export const SettingsUpdate =")

    // Should include min/max constraints
    expect(strictResult).toContain(".min(")
    expect(strictResult).toContain(".max(")
  })
})
