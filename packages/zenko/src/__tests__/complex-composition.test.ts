import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { complexCompositionYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe("Complex Composition", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("complex-composition-complete-output")
  })

  test("handles allOf with multiple schema references", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // BaseEntity uses allOf with three refs + inline object
    expect(result).toContain("export const BaseEntity =")
    expect(result).toContain("export const Identifiable =")
    expect(result).toContain("export const Timestamped =")
    expect(result).toContain("export const Versioned =")

    // Should merge object schemas for discriminated unions
    expect(result).toContain("Identifiable.merge(")
  })

  test("handles oneOf with allOf variants", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
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
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Entity has discriminator on 'type' property
    expect(result).toContain('"type"')
    expect(result).toContain('z.literal("user")')
    expect(result).toContain('z.literal("organization")')
    expect(result).toContain('z.literal("project")')

    expect(result).not.toContain('type: z.literal("user").optional()')
    expect(result).not.toContain('type: z.literal("organization").optional()')
    expect(result).not.toContain('type: z.literal("project").optional()')

    // Should use z.discriminatedUnion("type", [...])
    expect(result).toContain("z.discriminatedUnion(")
  })

  test("handles anyOf inside allOf", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Resource uses allOf with anyOf for metadata
    expect(result).toContain("export const Resource =")
    expect(result).toContain("export const SimpleMetadata =")
    expect(result).toContain("export const ExtendedMetadata =")

    // metadata should be a union of SimpleMetadata | ExtendedMetadata
    expect(result).toContain(
      "metadata: z.union([SimpleMetadata, ExtendedMetadata]).optional()"
    )
  })

  test("handles nested oneOf inside allOf", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ConfigurableItem has allOf with oneOf inside
    expect(result).toContain("export const ConfigurableItem =")
    expect(result).toContain("export const BasicConfig =")
    expect(result).toContain("export const AdvancedConfig =")

    // Should combine base properties with config union
    expect(result).toContain(
      "config: z.union([BasicConfig, AdvancedConfig]).optional()"
    )
  })

  test("handles complex nested composition in ComplexValidation", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ComplexValidation has oneOf with allOf inside
    expect(result).toContain("export const ComplexValidation =")

    // data property should be a union of two types
    expect(result).toContain("data: z.union([Identifiable.merge")
    expect(result).toContain('dataType: z.literal("structured")')
    expect(result).toContain('dataType: z.literal("unstructured")')
  })

  test("handles not keyword", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // NotEmptyString uses 'not' to exclude empty strings
    expect(result).toContain("export const NotEmptyString =")

    // Should generate validation that excludes empty strings
    // Could use z.string().min(1) or custom refinement
    expect(result).toMatch(/\.refine\(|\.min\(1\)/)
  })

  test("handles anyOf with mixed types", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // FlexibleValue has anyOf with string, number, and object
    expect(result).toContain("export const FlexibleValue =")

    // Should generate union: z.union([z.string().min(1), z.number().min(0), z.object(...)])
    expect(result).toContain(
      "export const FlexibleValue = z.union([z.string(), z.number(), z.object({"
    )
    expect(result).toContain("key: z.string()")
  })

  test("handles recursive schemas", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // HierarchicalData references itself in children
    expect(result).toContain("export const HierarchicalData =")

    // Should handle circular references with z.lazy() and z.ZodTypeAny annotation
    expect(result).toContain("z.lazy((): z.ZodTypeAny => HierarchicalData)")
  })

  test("handles null in anyOf", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // HierarchicalData.parent is anyOf with null
    expect(result).toContain("export const HierarchicalData =")

    // Should generate nullable or union with null
    expect(result).toContain(
      "parent: z.union([z.null(), Identifiable]).optional()"
    )
  })

  test("handles multiple discriminators in nested structures", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
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
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ExtendedMetadata extends SimpleMetadata using allOf
    expect(result).toContain("export const ExtendedMetadata =")
    expect(result).toContain("export const SimpleMetadata =")

    // Should properly combine both schemas
    expect(result).toContain("ExtendedMetadata = SimpleMetadata.merge")
    expect(result).toContain(
      "customFields: z.object({}).catchall(z.string()).optional()"
    )
  })

  test("does not emit z.literal for non-primitive const", () => {
    const specContent = `openapi: 3.0.0
info:
  title: Const Object Test
  version: 1.0.0
paths: {}
components:
  schemas:
    ConstObject:
      type: object
      const:
        foo: bar
      properties:
        foo:
          type: string
`
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain("export const ConstObject = z.object({")
    expect(result).not.toContain("z.literal({")
  })

  test("treats single-value enums as optional", () => {
    const specContent = `openapi: 3.0.0
info:
  title: Single Enum Property
  version: 1.0.0
paths: {}
components:
  schemas:
    SingleEnum:
      type: object
      properties:
        kind:
          type: string
          enum: ["only"]
`
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain('kind: z.literal("only").optional()')
  })

  test("maintains correct schema dependency order", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
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
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
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
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain("export const createEntity:")
    expect(result).toContain("export const getResource:")
    expect(result).toContain("export const validateData:")
  })

  test("handles default values in nested compositions", () => {
    const specContent = fs.readFileSync(complexCompositionYamlPath, "utf8")
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // CodeBlock has lineNumbers with default: true
    expect(result).toContain("export const CodeBlock =")
    expect(result).toContain(".default(true)")
  })
})
