import { describe, test, expect } from "bun:test"
import {
  type SchemaOptions,
  applyOptionalModifier,
  generateZodSchema,
  getZodTypeFromSchema,
  buildZodObject,
  buildString,
  buildNumber,
  buildInteger,
  applyStrictArrayBounds,
  isPrimitiveLike,
  applyNumericBounds,
} from "../schema-generator"

const defaultOptions: SchemaOptions = {
  strictDates: false,
  strictNumeric: false,
  optionalType: "optional",
}

describe("applyOptionalModifier", () => {
  test("should apply optional modifier", () => {
    expect(applyOptionalModifier("z.string()", "optional")).toBe(
      "z.string().optional()"
    )
  })

  test("should apply nullable modifier", () => {
    expect(applyOptionalModifier("z.string()", "nullable")).toBe(
      "z.string().nullable()"
    )
  })

  test("should apply nullish modifier", () => {
    expect(applyOptionalModifier("z.string()", "nullish")).toBe(
      "z.string().nullish()"
    )
  })
})

describe("isPrimitiveLike", () => {
  test("should return true for primitive types", () => {
    expect(isPrimitiveLike({ type: "string" })).toBe(true)
    expect(isPrimitiveLike({ type: "number" })).toBe(true)
    expect(isPrimitiveLike({ type: "integer" })).toBe(true)
    expect(isPrimitiveLike({ type: "boolean" })).toBe(true)
  })

  test("should return false for non-primitive types", () => {
    expect(isPrimitiveLike({ type: "object" })).toBe(false)
    expect(isPrimitiveLike({ type: "array" })).toBe(false)
    expect(isPrimitiveLike({ $ref: "#/components/schemas/User" })).toBe(false)
  })

  test("should return false for undefined or null", () => {
    expect(isPrimitiveLike(undefined)).toBe(false)
    expect(isPrimitiveLike(null)).toBe(false)
  })
})

describe("applyNumericBounds", () => {
  test("should apply minimum constraint", () => {
    const result = applyNumericBounds({ minimum: 0 }, "z.number()")
    expect(result).toBe("z.number().min(0)")
  })

  test("should apply maximum constraint", () => {
    const result = applyNumericBounds({ maximum: 100 }, "z.number()")
    expect(result).toBe("z.number().max(100)")
  })

  test("should apply both min and max", () => {
    const result = applyNumericBounds(
      { minimum: 0, maximum: 100 },
      "z.number()"
    )
    expect(result).toBe("z.number().min(0).max(100)")
  })

  test("should apply exclusive minimum", () => {
    const result = applyNumericBounds(
      { minimum: 0, exclusiveMinimum: true },
      "z.number()"
    )
    expect(result).toBe("z.number().gt(0)")
  })

  test("should apply exclusive maximum", () => {
    const result = applyNumericBounds(
      { maximum: 100, exclusiveMaximum: true },
      "z.number()"
    )
    expect(result).toBe("z.number().lt(100)")
  })

  test("should apply OpenAPI 3.0 exclusive bounds", () => {
    const result = applyNumericBounds(
      { exclusiveMinimum: 0, exclusiveMaximum: 100 },
      "z.number()"
    )
    expect(result).toBe("z.number().gt(0).lt(100)")
  })

  test("should return unchanged builder when no bounds", () => {
    const result = applyNumericBounds({}, "z.number()")
    expect(result).toBe("z.number()")
  })
})

describe("buildString", () => {
  test("should build basic string", () => {
    expect(buildString({}, defaultOptions)).toBe("z.string()")
  })

  test("should apply format validators", () => {
    expect(buildString({ format: "email" }, defaultOptions)).toBe(
      "z.string().email()"
    )
    expect(buildString({ format: "uuid" }, defaultOptions)).toBe(
      "z.string().uuid()"
    )
    expect(buildString({ format: "url" }, defaultOptions)).toBe(
      "z.string().url()"
    )
    expect(buildString({ format: "uri" }, defaultOptions)).toBe(
      "z.string().url()"
    )
  })

  test("should apply IP validators", () => {
    expect(buildString({ format: "ipv4" }, defaultOptions)).toBe(
      'z.string().ip({ version: "v4" })'
    )
    expect(buildString({ format: "ipv6" }, defaultOptions)).toBe(
      'z.string().ip({ version: "v6" })'
    )
  })

  test("should apply date validators when strictDates is enabled", () => {
    const strictOptions = { ...defaultOptions, strictDates: true }
    expect(buildString({ format: "date-time" }, strictOptions)).toBe(
      "z.string().datetime()"
    )
    expect(buildString({ format: "date" }, strictOptions)).toBe(
      "z.string().date()"
    )
    expect(buildString({ format: "time" }, strictOptions)).toBe(
      "z.string().time()"
    )
    expect(buildString({ format: "duration" }, strictOptions)).toBe(
      "z.string().duration()"
    )
  })

  test("should not apply date validators when strictDates is disabled", () => {
    expect(buildString({ format: "date-time" }, defaultOptions)).toBe(
      "z.string()"
    )
  })

  test("should apply string constraints when strictNumeric is enabled", () => {
    const strictOptions = { ...defaultOptions, strictNumeric: true }
    expect(buildString({ minLength: 1, maxLength: 10 }, strictOptions)).toBe(
      "z.string().min(1).max(10)"
    )
  })

  test("should apply pattern constraint when strictNumeric is enabled", () => {
    const strictOptions = { ...defaultOptions, strictNumeric: true }
    const result = buildString({ pattern: "^[a-z]+$" }, strictOptions)
    expect(result).toContain('.regex(new RegExp("^[a-z]+$"))')
  })

  test("should not apply constraints when strictNumeric is disabled", () => {
    expect(
      buildString(
        { minLength: 1, maxLength: 10, pattern: "^[a-z]+$" },
        defaultOptions
      )
    ).toBe("z.string()")
  })
})

describe("buildNumber", () => {
  test("should build basic number", () => {
    expect(buildNumber({}, defaultOptions)).toBe("z.number()")
  })

  test("should apply numeric bounds when strictNumeric is enabled", () => {
    const strictOptions = { ...defaultOptions, strictNumeric: true }
    expect(buildNumber({ minimum: 0, maximum: 100 }, strictOptions)).toBe(
      "z.number().min(0).max(100)"
    )
  })

  test("should apply multipleOf constraint when strictNumeric is enabled", () => {
    const strictOptions = { ...defaultOptions, strictNumeric: true }
    const result = buildNumber({ multipleOf: 5 }, strictOptions)
    expect(result).toContain("refine")
    expect(result).toContain("Must be a multiple of 5")
  })

  test("should not apply constraints when strictNumeric is disabled", () => {
    expect(
      buildNumber({ minimum: 0, maximum: 100, multipleOf: 5 }, defaultOptions)
    ).toBe("z.number()")
  })
})

describe("buildInteger", () => {
  test("should build integer with int() modifier", () => {
    expect(buildInteger({}, defaultOptions)).toBe("z.number().int()")
  })

  test("should apply numeric bounds when strictNumeric is enabled", () => {
    const strictOptions = { ...defaultOptions, strictNumeric: true }
    expect(buildInteger({ minimum: 0, maximum: 100 }, strictOptions)).toBe(
      "z.number().min(0).max(100).int()"
    )
  })
})

describe("applyStrictArrayBounds", () => {
  const itemSchema = { type: "string" }

  test("should not apply bounds when enforceBounds is false", () => {
    const result = applyStrictArrayBounds(
      { minItems: 1, maxItems: 10 },
      "z.array(z.string())",
      itemSchema,
      false
    )
    expect(result).toBe("z.array(z.string())")
  })

  test("should apply minItems constraint", () => {
    const result = applyStrictArrayBounds(
      { minItems: 1 },
      "z.array(z.string())",
      itemSchema,
      true
    )
    expect(result).toBe("z.array(z.string()).min(1)")
  })

  test("should apply maxItems constraint", () => {
    const result = applyStrictArrayBounds(
      { maxItems: 10 },
      "z.array(z.string())",
      itemSchema,
      true
    )
    expect(result).toBe("z.array(z.string()).max(10)")
  })

  test("should apply both min and max items", () => {
    const result = applyStrictArrayBounds(
      { minItems: 1, maxItems: 10 },
      "z.array(z.string())",
      itemSchema,
      true
    )
    expect(result).toBe("z.array(z.string()).min(1).max(10)")
  })

  test("should apply uniqueItems for primitive types", () => {
    const result = applyStrictArrayBounds(
      { uniqueItems: true },
      "z.array(z.string())",
      itemSchema,
      true
    )
    expect(result).toContain("refine")
    expect(result).toContain("Items must be unique")
  })

  test("should not apply uniqueItems for object types", () => {
    const objSchema = { type: "object" }
    const result = applyStrictArrayBounds(
      { uniqueItems: true },
      "z.array(z.object({}))",
      objSchema,
      true
    )
    expect(result).toBe("z.array(z.object({}))")
  })

  test("should not apply uniqueItems for ref types", () => {
    const refSchema = { $ref: "#/components/schemas/User" }
    const result = applyStrictArrayBounds(
      { uniqueItems: true },
      "z.array(User)",
      refSchema,
      true
    )
    expect(result).toBe("z.array(User)")
  })
})

describe("buildZodObject", () => {
  test("should build empty object", () => {
    expect(buildZodObject({}, defaultOptions)).toBe("z.object({})")
  })

  test("should build object with required properties", () => {
    const schema = {
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name", "age"],
    }
    const result = buildZodObject(schema, defaultOptions)
    expect(result).toContain("name: z.string()")
    expect(result).toContain("age: z.number()")
    expect(result).not.toContain("optional()")
  })

  test("should build object with optional properties", () => {
    const schema = {
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    }
    const result = buildZodObject(schema, defaultOptions)
    expect(result).toContain("name: z.string()")
    expect(result).toContain("age: z.number().optional()")
  })

  test("should apply nullable modifier when optionalType is nullable", () => {
    const schema = {
      properties: {
        name: { type: "string" },
      },
      required: [],
    }
    const result = buildZodObject(schema, {
      ...defaultOptions,
      optionalType: "nullable",
    })
    expect(result).toContain("name: z.string().nullable()")
  })

  test("should handle properties with invalid identifiers", () => {
    const schema = {
      properties: {
        "invalid-name": { type: "string" },
        "6starts-with-number": { type: "string" },
      },
      required: [],
    }
    const result = buildZodObject(schema, defaultOptions)
    expect(result).toContain('"invalid-name"')
    expect(result).toContain('"6starts-with-number"')
  })
})

describe("getZodTypeFromSchema", () => {
  test("should handle $ref", () => {
    const schema = { $ref: "#/components/schemas/User" }
    expect(getZodTypeFromSchema(schema, defaultOptions)).toBe("User")
  })

  test("should handle $ref with nameMap", () => {
    const schema = { $ref: "#/components/schemas/UserProfile" }
    const nameMap = new Map([["UserProfile", "userProfile"]])
    expect(getZodTypeFromSchema(schema, defaultOptions, nameMap)).toBe(
      "userProfile"
    )
  })

  test("should handle enum", () => {
    const schema = { enum: ["red", "green", "blue"] }
    expect(getZodTypeFromSchema(schema, defaultOptions)).toBe(
      'z.enum(["red", "green", "blue"])'
    )
  })

  test("should handle allOf with single schema", () => {
    const schema = { allOf: [{ type: "string" }] }
    expect(getZodTypeFromSchema(schema, defaultOptions)).toBe("z.string()")
  })

  test("should handle allOf with multiple schemas", () => {
    const schema = {
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "number" } } },
      ],
    }
    const result = getZodTypeFromSchema(schema, defaultOptions)
    expect(result).toContain(".and(")
  })

  test("should handle empty allOf", () => {
    const schema = { allOf: [] }
    expect(getZodTypeFromSchema(schema, defaultOptions)).toBe("z.object({})")
  })

  test("should handle object type", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } }
    const result = getZodTypeFromSchema(schema, defaultOptions)
    expect(result).toContain("z.object")
    expect(result).toContain("name")
  })

  test("should handle string type", () => {
    expect(getZodTypeFromSchema({ type: "string" }, defaultOptions)).toBe(
      "z.string()"
    )
  })

  test("should handle boolean type", () => {
    expect(getZodTypeFromSchema({ type: "boolean" }, defaultOptions)).toBe(
      "z.boolean()"
    )
  })

  test("should handle array type", () => {
    const schema = { type: "array", items: { type: "string" } }
    expect(getZodTypeFromSchema(schema, defaultOptions)).toBe(
      "z.array(z.string())"
    )
  })

  test("should handle array without items", () => {
    const schema = { type: "array" }
    expect(getZodTypeFromSchema(schema, defaultOptions)).toBe(
      "z.array(z.unknown())"
    )
  })

  test("should handle null type", () => {
    expect(getZodTypeFromSchema({ type: "null" }, defaultOptions)).toBe(
      "z.null()"
    )
  })

  test("should handle number type", () => {
    expect(getZodTypeFromSchema({ type: "number" }, defaultOptions)).toBe(
      "z.number()"
    )
  })

  test("should handle integer type", () => {
    expect(getZodTypeFromSchema({ type: "integer" }, defaultOptions)).toBe(
      "z.number().int()"
    )
  })

  test("should handle unknown type", () => {
    expect(getZodTypeFromSchema({ type: "unknown" }, defaultOptions)).toBe(
      "z.unknown()"
    )
    expect(getZodTypeFromSchema({}, defaultOptions)).toBe("z.unknown()")
  })

  test("should handle schema with properties but no type", () => {
    const schema = { properties: { name: { type: "string" } } }
    const result = getZodTypeFromSchema(schema, defaultOptions)
    expect(result).toContain("z.object")
  })
})

describe("generateZodSchema", () => {
  test("should not regenerate if already generated", () => {
    const generatedTypes = new Set(["User"])
    const result = generateZodSchema(
      "User",
      { type: "string" },
      generatedTypes,
      defaultOptions
    )
    expect(result).toBe("")
    expect(generatedTypes.size).toBe(1)
  })

  test("should generate enum schema", () => {
    const generatedTypes = new Set<string>()
    const result = generateZodSchema(
      "Color",
      { enum: ["red", "green", "blue"] },
      generatedTypes,
      defaultOptions
    )
    expect(result).toBe(
      'export const Color = z.enum(["red", "green", "blue"]);'
    )
    expect(generatedTypes.has("Color")).toBe(true)
  })

  test("should generate object schema", () => {
    const generatedTypes = new Set<string>()
    const schema = {
      type: "object",
      properties: { name: { type: "string" } },
    }
    const result = generateZodSchema(
      "User",
      schema,
      generatedTypes,
      defaultOptions
    )
    expect(result).toContain("export const User = z.object(")
    expect(result).toContain("name")
    expect(generatedTypes.has("User")).toBe(true)
  })

  test("should generate array schema", () => {
    const generatedTypes = new Set<string>()
    const schema = { type: "array", items: { type: "string" } }
    const result = generateZodSchema(
      "Tags",
      schema,
      generatedTypes,
      defaultOptions
    )
    expect(result).toBe("export const Tags = z.array(z.string());")
    expect(generatedTypes.has("Tags")).toBe(true)
  })

  test("should generate allOf schema with single item", () => {
    const generatedTypes = new Set<string>()
    const schema = { allOf: [{ type: "string" }] }
    const result = generateZodSchema(
      "Name",
      schema,
      generatedTypes,
      defaultOptions
    )
    expect(result).toBe("export const Name = z.string();")
  })

  test("should generate allOf schema with multiple items", () => {
    const generatedTypes = new Set<string>()
    const schema = {
      allOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "number" } } },
      ],
    }
    const result = generateZodSchema(
      "Combined",
      schema,
      generatedTypes,
      defaultOptions
    )
    expect(result).toContain("export const Combined =")
    expect(result).toContain(".and(")
  })

  test("should generate empty allOf", () => {
    const generatedTypes = new Set<string>()
    const schema = { allOf: [] }
    const result = generateZodSchema(
      "Empty",
      schema,
      generatedTypes,
      defaultOptions
    )
    expect(result).toBe("export const Empty = z.object({});")
  })

  test("should use nameMap for schema name mapping", () => {
    const generatedTypes = new Set<string>()
    const nameMap = new Map([["UserProfile", "userProfile"]])
    const schema = { $ref: "#/components/schemas/UserProfile" }
    const result = generateZodSchema(
      "Test",
      schema,
      generatedTypes,
      defaultOptions,
      nameMap
    )
    expect(result).toBe("export const Test = userProfile;")
  })
})
