import * as fs from "fs"
import { beforeAll, describe, expect, test } from "bun:test"
import { anyOfCombinationsYamlPath } from "@zenko/specs"
import { generate, type OpenAPISpec } from "../zenko"

/**
 * Loads and parses a YAML fixture file.
 */
function loadSpec(specPath: string): OpenAPISpec {
  const content = fs.readFileSync(specPath, "utf8")
  return Bun.YAML.parse(content) as OpenAPISpec
}

/**
 * Extracts a specific schema export block from the generated output.
 * Matches from "export const Name =" through the closing semicolon,
 * handling multi-line object definitions.
 */
function extractExportBlock(result: string, schemaName: string): string | null {
  const pattern = new RegExp(
    `(export const ${schemaName} = [\\s\\S]*?;)\\n`,
    "m"
  )
  const match = result.match(pattern)
  return match?.[1]?.trim() ?? null
}

describe("anyOf Combinations", () => {
  let specYaml: OpenAPISpec
  let result: string

  beforeAll(() => {
    specYaml = loadSpec(anyOfCombinationsYamlPath)
    result = generate(specYaml)
  })

  test("generates complete TypeScript output", () => {
    expect(result).toMatchSnapshot("anyof-combinations-complete-output")
  })

  test("generates union for anyOf schemas", () => {
    // Should generate unions for anyOf
    expect(result).toContain("z.union([")

    // SearchFilter should be a union of three filter types
    expect(result).toContain("export const SearchFilter =")
    expect(result).toContain("export const TextFilter =")
    expect(result).toContain("export const DateRangeFilter =")
    expect(result).toContain("export const NumericRangeFilter =")
  })

  test("handles anyOf with inline required constraints", () => {
    // Contact has anyOf with required constraints
    const contactBlock = extractExportBlock(result, "Contact")
    expect(contactBlock).not.toBeNull()

    // The Contact schema should include both email and phone as optional
    // but with validation that at least one is present
    expect(contactBlock).toContain("email")
    expect(contactBlock).toContain("phone")
  })

  test("generates all variant schemas for SearchResult", () => {
    // SearchResult should have all three variants
    expect(result).toContain("export const DocumentResult =")
    expect(result).toContain("export const UserResult =")
    expect(result).toContain("export const ProductResult =")
    expect(result).toContain("export const SearchResult =")

    // Types should be generated
    expect(result).toContain("export type DocumentResult =")
    expect(result).toContain("export type UserResult =")
    expect(result).toContain("export type ProductResult =")
    expect(result).toContain("export type SearchResult =")
  })

  test("handles anyOf with primitive types", () => {
    // FlexibleData has anyOf with string, number, boolean, array, object
    const flexibleDataBlock = extractExportBlock(result, "FlexibleData")
    expect(flexibleDataBlock).not.toBeNull()

    // Should generate a union containing primitives and complex types
    expect(flexibleDataBlock).toContain("z.union([")
    expect(flexibleDataBlock).toContain("z.string()")
    expect(flexibleDataBlock).toContain("z.number()")
    expect(flexibleDataBlock).toContain("z.boolean()")
    expect(flexibleDataBlock).toContain("z.array(")
    expect(flexibleDataBlock).toContain("z.object(")
  })

  test("maintains schema dependency order with anyOf", () => {
    // Variant schemas should come before the union schema
    const textFilterIndex = result.indexOf("export const TextFilter =")
    const dateRangeFilterIndex = result.indexOf(
      "export const DateRangeFilter ="
    )
    const numericRangeFilterIndex = result.indexOf(
      "export const NumericRangeFilter ="
    )
    const searchFilterIndex = result.indexOf("export const SearchFilter =")

    // First verify all schemas are found
    expect(textFilterIndex).toBeGreaterThanOrEqual(0)
    expect(dateRangeFilterIndex).toBeGreaterThanOrEqual(0)
    expect(numericRangeFilterIndex).toBeGreaterThanOrEqual(0)
    expect(searchFilterIndex).toBeGreaterThanOrEqual(0)

    // Then verify ordering
    expect(textFilterIndex).toBeLessThan(searchFilterIndex)
    expect(dateRangeFilterIndex).toBeLessThan(searchFilterIndex)
    expect(numericRangeFilterIndex).toBeLessThan(searchFilterIndex)
  })

  test("generates operation objects with anyOf types", () => {
    // Operations should use the anyOf union types
    expect(result).toContain("export const createContact:")
    expect(result).toContain("export const searchItems:")
    expect(result).toContain("CreateContactOperation")
    expect(result).toContain("SearchItemsOperation")
  })

  test("handles anyOf in query parameters", () => {
    // searchItems operation has a filter parameter with anyOf schema
    // Verify key parts of the signature rather than exact string
    expect(result).toContain("searchItems:")
    // The path function accepts query and optional filter params
    expect(result).toContain("query: string")
    expect(result).toContain("filter?:")
    expect(result).toContain('params.set("filter", String(filter))')
  })

  test("generates type discriminators for anyOf variants when present", () => {
    // Filter types have a 'type' discriminator
    // SearchResult types have 'resultType' discriminator
    // These should use z.literal() for the discriminator values
    expect(result).toContain('z.literal("text")')
    expect(result).toContain('z.literal("dateRange")')
    expect(result).toContain('z.literal("numericRange")')
    expect(result).toContain('z.literal("document")')
    expect(result).toContain('z.literal("user")')
    expect(result).toContain('z.literal("product")')
  })
})
