import { beforeAll, describe, expect, test } from "bun:test"
import * as fs from "fs"
import { additionalPropertiesYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe("Additional Properties", () => {
  let specYaml: OpenAPISpec

  beforeAll(() => {
    const specContent = fs.readFileSync(additionalPropertiesYamlPath, "utf8")
    specYaml = parseYaml(specContent) as OpenAPISpec
  })

  test("generates complete TypeScript output", () => {
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("additional-properties-complete-output")
  })

  test("handles additionalProperties: true", () => {
    const result = generate(specYaml)

    // Metadata has additionalProperties: true
    expect(result).toContain("export const Metadata =")

    // Should use z.record() or .passthrough() to allow any additional properties
    // z.object({ ... }).passthrough()
    // or z.object({ ... }).and(z.record(z.unknown()))
    expect(result).toContain("Metadata")
  })

  test("handles additionalProperties with string type", () => {
    const result = generate(specYaml)

    // MetadataInput and Labels have additionalProperties: string
    expect(result).toContain("export const MetadataInput =")
    expect(result).toContain("export const Labels =")

    // Should use .catchall(z.string()) for unknown keys
    expect(result).toContain(".catchall(z.string())")
  })

  test("handles additionalProperties: false", () => {
    const result = generate(specYaml)

    // StrictObject and NoAdditionalProps have additionalProperties: false
    expect(result).toContain("export const StrictObject =")
    expect(result).toContain("export const NoAdditionalProps =")

    // Should use .strict() to disallow additional properties
    // z.object({ ... }).strict()
  })

  test("handles additionalProperties with object schema", () => {
    const result = generate(specYaml)

    // Config has additionalProperties with object schema
    expect(result).toContain("export const Config =")

    // Should generate a record with object values
    // z.record(z.object({ enabled: z.boolean().optional(), value: z.string().optional() }))
  })

  test("handles additionalProperties with number type", () => {
    const result = generate(specYaml)

    // NumericDictionary has additionalProperties: number with constraints
    expect(result).toContain("export const NumericDictionary =")

    // Should use .catchall(z.number().min(0).max(100))
    expect(result).toContain(".catchall(z.number()")
  })

  test("handles additionalProperties with boolean type", () => {
    const result = generate(specYaml)

    // BooleanFlags has additionalProperties: boolean
    expect(result).toContain("export const BooleanFlags =")

    // Should use .catchall(z.boolean())
    expect(result).toContain(".catchall(z.boolean())")
  })

  test("handles additionalProperties with array type", () => {
    const result = generate(specYaml)

    // ArrayDictionary has additionalProperties: array
    expect(result).toContain("export const ArrayDictionary =")

    // Should use .catchall(z.array(z.string()).min(1))
    expect(result).toContain(".catchall(z.array(z.string()).min(1))")
  })

  test("applies array bounds for top-level arrays", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {
        title: "Array bounds",
        version: "1.0.0",
      },
      paths: {},
      components: {
        schemas: {
          ArraySchema: {
            type: "array",
            items: {
              type: "string",
            },
            minItems: 1,
          },
        },
      },
    }
    const result = generate(spec)

    expect(result).toContain(
      "export const ArraySchema = z.array(z.string()).min(1);"
    )
  })

  test("handles additionalProperties with oneOf", () => {
    const result = generate(specYaml)

    // TypedDictionary has additionalProperties with oneOf
    expect(result).toContain("export const TypedDictionary =")

    // Should generate a union for the additionalProperties values
    // z.object({ ... }).catchall(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    expect(result).toContain(".catchall(z.union(")
  })

  test("handles mixed required properties and additionalProperties", () => {
    const result = generate(specYaml)

    // MixedConstraints has required fields and additionalProperties
    expect(result).toContain("export const MixedConstraints =")

    // Should combine object schema with catchall
    // z.object({ requiredField: z.string(), optionalField: z.number().optional() })
    //   .catchall(z.string().min(1).max(100))
  })

  test("handles nested additionalProperties", () => {
    const result = generate(specYaml)

    // ComplexAdditionalProps has nested additionalProperties
    expect(result).toContain("export const ComplexAdditionalProps =")

    // Should handle multiple levels of additionalProperties
  })

  test("applies constraints to additionalProperties values", () => {
    const specContent = fs.readFileSync(additionalPropertiesYamlPath, "utf8")
    const specYaml = parseYaml(specContent)
    const result = generate(specYaml, { strictNumeric: true })

    // MixedConstraints has string additionalProperties with minLength/maxLength
    expect(result).toContain("export const MixedConstraints =")

    // Should include constraints: z.string().min(1).max(100)
    expect(result).toContain(".catchall(z.string().min(1).max(100))")
  })

  test("generates all expected schemas", () => {
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
    const result = generate(specYaml)

    expect(result).toContain("export const createMetadata:")
    expect(result).toContain("export const getConfig:")
    expect(result).toContain("export const updateConfig:")
    expect(result).toContain("export const createLabels:")
  })
})
