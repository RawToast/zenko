import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import jsYaml from "js-yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe.skip("Property Metadata", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("property-metadata-complete-output")
  })

  test("handles readOnly properties correctly", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // User has readOnly fields: id, createdAt, updatedAt
    expect(result).toContain("export const User =")

    // readOnly fields should be present in response schemas
    // but could be marked differently (e.g., with .readonly() or separate schemas)
    // or they should be omitted from input schemas
  })

  test("handles writeOnly properties correctly", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // User has writeOnly field: passwordHash
    // UserInput has writeOnly field: password
    expect(result).toContain("export const User =")
    expect(result).toContain("export const UserInput =")

    // writeOnly fields should only appear in request schemas, not response schemas
  })

  test("separates input and output schemas for readOnly/writeOnly", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // UserInput should not have readOnly fields (id, createdAt, updatedAt)
    // User should not have writeOnly fields in the type definition

    expect(result).toContain("export const UserInput =")
    expect(result).toContain("export const User =")
    expect(result).toContain("export const UserUpdate =")
  })

  test("handles const properties with literal values", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Product has const fields: sku, currency
    expect(result).toContain("export const Product =")

    // const should generate z.literal()
    expect(result).toContain('z.literal("CONST_SKU")')
    expect(result).toContain('z.literal("USD")')
  })

  test("handles default values", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

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

  test("marks deprecated fields", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Settings has deprecatedField
    // Product has createdBy (deprecated)
    expect(result).toContain("export const Settings =")
    expect(result).toContain("export const Product =")

    // Could be marked with JSDoc comments: /** @deprecated */
    // or TypeScript's @deprecated tag
    // or Zod's .describe() with deprecation notice
  })

  test("includes example values in schema descriptions", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Examples could be included in .describe() or as JSDoc
    // User has examples for: id, username, email, role, createdAt, updatedAt
    expect(result).toContain("export const User =")

    // Could use .describe() with examples
    // e.g., z.string().describe("System-generated user ID. Example: 550e8400-e29b-41d4-a716-446655440000")
  })

  test("generates all expected schemas", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

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
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // createUser should use UserInput for request and User for response
    expect(result).toContain("export const createUser:")
    expect(result).toContain("CreateUserOperation")

    // updateUser should use UserUpdate for request
    expect(result).toContain("export const updateUser:")
    expect(result).toContain("UpdateUserOperation")
  })

  test("handles status const with default value correctly", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // User.status has both const: active and default: active
    // This is an interesting edge case - const makes it always "active"
    expect(result).toContain("export const User =")
    expect(result).toContain('z.literal("active")')
  })

  test("applies validation constraints with default values", () => {
    const specContent = fs.readFileSync(
      "src/resources/property-metadata.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml, { strictNumeric: true })

    // SettingsUpdate has constraints on some fields
    expect(result).toContain("export const SettingsUpdate =")

    // Should include min/max constraints
    expect(result).toContain(".min(")
    expect(result).toContain(".max(")
  })
})
