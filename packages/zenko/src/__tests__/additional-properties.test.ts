import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import jsYaml from "js-yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe.skip("Additional Properties", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("additional-properties-complete-output")
  })

  test("handles additionalProperties: true", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Metadata has additionalProperties: true
    expect(result).toContain("export const Metadata =")

    // Should use z.record() or .passthrough() to allow any additional properties
    // z.object({ ... }).passthrough()
    // or z.object({ ... }).and(z.record(z.unknown()))
    expect(result).toContain("Metadata")
  })

  test("handles additionalProperties with string type", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // MetadataInput and Labels have additionalProperties: string
    expect(result).toContain("export const MetadataInput =")
    expect(result).toContain("export const Labels =")

    // Should use z.record(z.string()) or similar
    expect(result).toContain("z.record(")
    expect(result).toContain("z.string()")
  })

  test("handles additionalProperties: false", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // StrictObject and NoAdditionalProps have additionalProperties: false
    expect(result).toContain("export const StrictObject =")
    expect(result).toContain("export const NoAdditionalProps =")

    // Should use .strict() to disallow additional properties
    // z.object({ ... }).strict()
  })

  test("handles additionalProperties with object schema", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Config has additionalProperties with object schema
    expect(result).toContain("export const Config =")

    // Should generate a record with object values
    // z.record(z.object({ enabled: z.boolean().optional(), value: z.string().optional() }))
  })

  test("handles additionalProperties with number type", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // NumericDictionary has additionalProperties: number with constraints
    expect(result).toContain("export const NumericDictionary =")

    // Should use z.record(z.number().min(0).max(100))
    expect(result).toContain("z.record(")
  })

  test("handles additionalProperties with boolean type", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // BooleanFlags has additionalProperties: boolean
    expect(result).toContain("export const BooleanFlags =")

    // Should use z.record(z.boolean())
    expect(result).toContain("z.record(")
    expect(result).toContain("z.boolean()")
  })

  test("handles additionalProperties with array type", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ArrayDictionary has additionalProperties: array
    expect(result).toContain("export const ArrayDictionary =")

    // Should use z.record(z.array(z.string()).min(1))
    expect(result).toContain("z.record(")
    expect(result).toContain("z.array(")
  })

  test("handles additionalProperties with oneOf", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // TypedDictionary has additionalProperties with oneOf
    expect(result).toContain("export const TypedDictionary =")

    // Should generate a union for the additionalProperties values
    // z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    expect(result).toContain("z.record(")
  })

  test("handles mixed required properties and additionalProperties", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // MixedConstraints has required fields and additionalProperties
    expect(result).toContain("export const MixedConstraints =")

    // Should combine object schema with record
    // z.object({ requiredField: z.string(), optionalField: z.number().optional() })
    //   .and(z.record(z.string().min(1).max(100)))
  })

  test("handles nested additionalProperties", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ComplexAdditionalProps has nested additionalProperties
    expect(result).toContain("export const ComplexAdditionalProps =")

    // Should handle multiple levels of additionalProperties
  })

  test("applies constraints to additionalProperties values", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml, { strictNumeric: true })

    // MixedConstraints has string additionalProperties with minLength/maxLength
    expect(result).toContain("export const MixedConstraints =")

    // Should include constraints: z.string().min(1).max(100)
  })

  test("generates all expected schemas", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // All schemas should be generated
    expect(result).toContain("export const Metadata =")
    expect(result).toContain("export const MetadataInput =")
    expect(result).toContain("export const Config =")
    expect(result).toContain("export const Labels =")
    expect(result).toContain("export const StrictObject =")
    expect(result).toContain("export const ComplexAdditionalProps =")
    expect(result).toContain("export const TypedDictionary =")
    expect(result).toContain("export const MixedConstraints =")
    expect(result).toContain("export const NumericDictionary =")
    expect(result).toContain("export const BooleanFlags =")
    expect(result).toContain("export const ArrayDictionary =")
    expect(result).toContain("export const NoAdditionalProps =")
  })

  test("generates operation objects", () => {
    const specContent = fs.readFileSync(
      "src/resources/additional-properties.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain("export const createMetadata:")
    expect(result).toContain("export const getConfig:")
    expect(result).toContain("export const updateConfig:")
    expect(result).toContain("export const createLabels:")
  })
})
