import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import jsYaml from "js-yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe.skip("Complex Composition", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("complex-composition-complete-output")
  })

  test("handles allOf with multiple schema references", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // BaseEntity uses allOf with three refs + inline object
    expect(result).toContain("export const BaseEntity =")
    expect(result).toContain("export const Identifiable =")
    expect(result).toContain("export const Timestamped =")
    expect(result).toContain("export const Versioned =")

    // Should use z.intersection() or z.and() to combine schemas
  })

  test("handles oneOf with allOf variants", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Entity is oneOf with three variants, each using allOf
    expect(result).toContain("export const Entity =")
    expect(result).toContain("export const UserEntity =")
    expect(result).toContain("export const OrganizationEntity =")
    expect(result).toContain("export const ProjectEntity =")

    // Each variant should properly extend BaseEntity
    // UserEntity = BaseEntity & { username, email, role }
  })

  test("handles discriminated unions with const discriminators", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Entity has discriminator on 'type' property
    expect(result).toContain('"type"')
    expect(result).toContain('z.literal("user")')
    expect(result).toContain('z.literal("organization")')
    expect(result).toContain('z.literal("project")')

    // Should use z.discriminatedUnion("type", [...])
    expect(result).toContain("z.discriminatedUnion(")
  })

  test("handles anyOf inside allOf", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Resource uses allOf with anyOf for metadata
    expect(result).toContain("export const Resource =")
    expect(result).toContain("export const SimpleMetadata =")
    expect(result).toContain("export const ExtendedMetadata =")

    // metadata should be a union of SimpleMetadata | ExtendedMetadata
    // z.union([SimpleMetadata, ExtendedMetadata])
  })

  test("handles nested oneOf inside allOf", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ConfigurableItem has allOf with oneOf inside
    expect(result).toContain("export const ConfigurableItem =")
    expect(result).toContain("export const BasicConfig =")
    expect(result).toContain("export const AdvancedConfig =")

    // Should combine base properties with config union
  })

  test("handles complex nested composition in ComplexValidation", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ComplexValidation has oneOf with allOf inside
    expect(result).toContain("export const ComplexValidation =")

    // data property should be a union of two types
  })

  test("handles not keyword", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // NotEmptyString uses 'not' to exclude empty strings
    expect(result).toContain("export const NotEmptyString =")

    // Should generate validation that excludes empty strings
    // Could use z.string().min(1) or custom refinement
  })

  test("handles anyOf with mixed types", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // FlexibleValue has anyOf with string, number, and object
    expect(result).toContain("export const FlexibleValue =")

    // Should generate union: z.union([z.string().min(1), z.number().min(0), z.object(...)])
  })

  test("handles recursive schemas", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // HierarchicalData references itself in children
    expect(result).toContain("export const HierarchicalData =")

    // Should handle circular references with z.lazy()
  })

  test("handles null in anyOf", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // HierarchicalData.parent is anyOf with null
    expect(result).toContain("export const HierarchicalData =")

    // Should generate nullable or union with null
    // z.union([z.null(), Identifiable])
  })

  test("handles multiple discriminators in nested structures", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ContentBlock has blockType discriminator
    // TextBlock.formatting has nested anyOf with format types
    expect(result).toContain("export const ContentBlock =")
    expect(result).toContain("export const TextBlock =")
    expect(result).toContain("export const ImageBlock =")
    expect(result).toContain("export const CodeBlock =")
    expect(result).toContain("export const PlainFormat =")
    expect(result).toContain("export const RichFormat =")
  })

  test("handles ExtendedMetadata which uses allOf to extend SimpleMetadata", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ExtendedMetadata extends SimpleMetadata using allOf
    expect(result).toContain("export const ExtendedMetadata =")
    expect(result).toContain("export const SimpleMetadata =")

    // Should properly combine both schemas
  })

  test("maintains correct schema dependency order", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Base schemas should come before composed schemas
    const identifiableIndex = result.indexOf("export const Identifiable =")
    const timestampedIndex = result.indexOf("export const Timestamped =")
    const versionedIndex = result.indexOf("export const Versioned =")
    const baseEntityIndex = result.indexOf("export const BaseEntity =")
    const userEntityIndex = result.indexOf("export const UserEntity =")
    const entityIndex = result.indexOf("export const Entity =")

    expect(identifiableIndex).toBeLessThan(baseEntityIndex)
    expect(timestampedIndex).toBeLessThan(baseEntityIndex)
    expect(versionedIndex).toBeLessThan(baseEntityIndex)
    expect(baseEntityIndex).toBeLessThan(userEntityIndex)
    expect(userEntityIndex).toBeLessThan(entityIndex)
  })

  test("generates all expected schemas", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // All schemas should be present
    const expectedSchemas = [
      "Timestamped",
      "Identifiable",
      "Versioned",
      "BaseEntity",
      "Entity",
      "UserEntity",
      "OrganizationEntity",
      "ProjectEntity",
      "Resource",
      "SimpleMetadata",
      "ExtendedMetadata",
      "ComplexValidation",
      "ConfigurableItem",
      "BasicConfig",
      "AdvancedConfig",
      "NotEmptyString",
      "FlexibleValue",
      "HierarchicalData",
      "ContentBlock",
      "TextBlock",
      "ImageBlock",
      "CodeBlock",
      "PlainFormat",
      "RichFormat",
    ]

    for (const schema of expectedSchemas) {
      expect(result).toContain(`export const ${schema} =`)
      expect(result).toContain(`export type ${schema} =`)
    }
  })

  test("generates operation objects", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain("export const createEntity:")
    expect(result).toContain("export const getResource:")
    expect(result).toContain("export const validateData:")
  })

  test("handles default values in nested compositions", () => {
    const specContent = fs.readFileSync(
      "src/resources/complex-composition.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // CodeBlock has lineNumbers with default: true
    expect(result).toContain("export const CodeBlock =")
    expect(result).toContain(".default(true)")
  })
})
