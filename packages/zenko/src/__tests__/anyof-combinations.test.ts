import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { generate, type OpenAPISpec } from "../zenko"

describe("anyOf Combinations", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("anyof-combinations-complete-output")
  })

  test("generates union for anyOf schemas", () => {
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should generate unions for anyOf
    expect(result).toContain("z.union([")

    // SearchFilter should be a union of three filter types
    expect(result).toContain("export const SearchFilter =")
    expect(result).toContain("export const TextFilter =")
    expect(result).toContain("export const DateRangeFilter =")
    expect(result).toContain("export const NumericRangeFilter =")
  })

  test("handles anyOf with inline required constraints", () => {
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Contact has anyOf with required constraints
    // Should accept objects with email, phone, or both
    expect(result).toContain("export const Contact =")

    // The Contact schema should include both email and phone as optional
    // but with validation that at least one is present
    expect(result).toContain("email")
    expect(result).toContain("phone")
  })

  test("generates all variant schemas for SearchResult", () => {
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

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
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // FlexibleData has anyOf with string, number, boolean, array, object
    expect(result).toContain("export const FlexibleData =")

    // Should generate a union of primitive types and complex types
    // z.union([z.string(), z.number(), z.boolean(), z.array(...), z.object(...)])
  })

  test("maintains schema dependency order with anyOf", () => {
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Variant schemas should come before the union schema
    const textFilterIndex = result.indexOf("export const TextFilter =")
    const dateRangeFilterIndex = result.indexOf(
      "export const DateRangeFilter ="
    )
    const numericRangeFilterIndex = result.indexOf(
      "export const NumericRangeFilter ="
    )
    const searchFilterIndex = result.indexOf("export const SearchFilter =")

    expect(textFilterIndex).toBeLessThan(searchFilterIndex)
    expect(dateRangeFilterIndex).toBeLessThan(searchFilterIndex)
    expect(numericRangeFilterIndex).toBeLessThan(searchFilterIndex)
  })

  test("generates operation objects with anyOf types", () => {
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Operations should use the anyOf union types
    expect(result).toContain("export const createContact:")
    expect(result).toContain("export const searchItems:")
    expect(result).toContain("CreateContactOperation")
    expect(result).toContain("SearchItemsOperation")
  })

  test("handles anyOf in query parameters", () => {
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // searchItems operation has a filter parameter with anyOf schema
    // Should properly type the query parameter
    expect(result).toContain(
      "searchItems: ({ query, filter }: { query: string, filter?: string }) => {"
    )
    expect(result).toContain('params.set("filter", String(filter))')
  })

  test("generates type discriminators for anyOf variants when present", () => {
    const specContent = fs.readFileSync(
      "src/resources/anyof-combinations.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

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
