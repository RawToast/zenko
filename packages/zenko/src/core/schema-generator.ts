import { extractRefName } from "../utils/topological-sort"
import { formatPropertyName } from "../utils/property-name"

export type SchemaOptions = {
  strictDates: boolean
  strictNumeric: boolean
  optionalType: "optional" | "nullable" | "nullish"
  openEnums: boolean | string[]
}

/**
 * Checks if a named enum should be generated as "open" (accepting unknown values).
 */
export function isOpenEnum(
  name: string,
  openEnums: boolean | string[]
): boolean {
  if (openEnums === true) return true
  if (Array.isArray(openEnums)) return openEnums.includes(name)
  return false
}

/**
 * Applies the appropriate optional modifier to a Zod type based on the optionalType option.
 */
export function applyOptionalModifier(
  zodType: string,
  optionalType: "optional" | "nullable" | "nullish"
): string {
  switch (optionalType) {
    case "optional":
      return `${zodType}.optional()`
    case "nullable":
      return `${zodType}.nullable()`
    case "nullish":
      return `${zodType}.nullish()`
  }
}

/**
 * Generates a complete Zod schema export statement for a named schema.
 * Handles enums, allOf, objects, and arrays.
 */
export function generateZodSchema(
  name: string,
  schema: any,
  generatedTypes: Set<string>,
  options: SchemaOptions,
  nameMap?: Map<string, string>
): string {
  if (generatedTypes.has(name)) return ""
  generatedTypes.add(name)

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    if (isOpenEnum(name, options.openEnums)) {
      return `const ${name}Known = [${enumValues}] as const;\nexport const ${name} = z.enum(${name}Known).or(\n  z.string().transform((v): \`Unknown:\${string}\` => \`Unknown:\${v}\`)\n);`
    }
    return `export const ${name} = z.enum([${enumValues}]);`
  }

  // Handle allOf schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const allOfParts = schema.allOf.map((part: any) =>
      getZodTypeFromSchema(part, options, nameMap)
    )
    if (allOfParts.length === 0) return `export const ${name} = z.object({});`
    if (allOfParts.length === 1)
      return `export const ${name} = ${allOfParts[0]};`
    const first = allOfParts[0]
    const rest = allOfParts
      .slice(1)
      .map((part: string) => `.and(${part})`)
      .join("")
    return `export const ${name} = ${first}${rest};`
  }

  if (schema.type === "object" || schema.properties) {
    return `export const ${name} = ${buildZodObject(schema, options, nameMap)};`
  }

  if (schema.type === "array") {
    const itemSchema = schema.items ?? { type: "unknown" }
    const itemType = getZodTypeFromSchema(itemSchema, options, nameMap)
    const builder = applyStrictArrayBounds(
      schema,
      `z.array(${itemType})`,
      itemSchema,
      options.strictNumeric
    )
    return `export const ${name} = ${builder};`
  }

  return `export const ${name} = ${getZodTypeFromSchema(schema, options, nameMap)};`
}

/**
 * Converts an OpenAPI schema to a Zod type expression.
 * Recursively handles nested schemas, references, and all OpenAPI schema types.
 */
export function getZodTypeFromSchema(
  schema: any,
  options: SchemaOptions,
  nameMap?: Map<string, string>
): string {
  if (schema.$ref) {
    const refName = extractRefName(schema.$ref)
    return nameMap?.get(refName) || refName
  }

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `z.enum([${enumValues}])`
  }

  // Handle allOf schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const allOfParts = schema.allOf.map((part: any) =>
      getZodTypeFromSchema(part, options, nameMap)
    )
    if (allOfParts.length === 0) return "z.object({})"
    if (allOfParts.length === 1) return allOfParts[0]
    const first = allOfParts[0]
    const rest = allOfParts
      .slice(1)
      .map((part: string) => `.and(${part})`)
      .join("")
    return `${first}${rest}`
  }

  // Check for object with properties (including those without explicit type)
  if (
    schema.type === "object" ||
    schema.properties ||
    schema.allOf ||
    schema.oneOf ||
    schema.anyOf
  ) {
    return buildZodObject(schema, options, nameMap)
  }

  switch (schema.type) {
    case "string":
      return buildString(schema, options)
    case "boolean":
      return "z.boolean()"
    case "array":
      return `z.array(${getZodTypeFromSchema(
        schema.items ?? { type: "unknown" },
        options,
        nameMap
      )})`
    case "null":
      return "z.null()"
    case "number":
      return buildNumber(schema, options)
    case "integer":
      return buildInteger(schema, options)
    default:
      return "z.unknown()"
  }
}

/**
 * Constructs a Zod object schema expression from an OpenAPI object schema.
 *
 * For each property in `schema.properties` the function:
 * - Keeps required properties as required in the resulting Zod schema.
 * - Applies the optional modifier based on `options.optionalType` for non-required properties.
 * - Applies the property's OpenAPI `default` value as a `.default(...)` on non-required properties except when `options.optionalType` is `"nullable"`.
 *
 * @param schema - The OpenAPI object schema to convert into a Zod object expression.
 * @param options - Schema generation options that control optional/null/default handling.
 * @param nameMap - Optional map translating referenced schema names to target type names.
 * @returns A string containing the Zod object schema expression (for example: `z.object({...})`).
 */
export function buildZodObject(
  schema: any,
  options: SchemaOptions,
  nameMap?: Map<string, string>
): string {
  const properties: string[] = []

  for (const [propName, propSchema] of Object.entries(
    schema.properties || {}
  )) {
    const isRequired = schema.required?.includes(propName) ?? false
    const baseType = getZodTypeFromSchema(propSchema as any, options, nameMap)
    // Only apply .default() to non-required properties with "optional" or
    // "nullish" optionalType. When optionalType is "nullable", the field must
    // be present (but may be null), so .default() would break those semantics
    // by accepting undefined input.
    const withOptional = applyOptionalModifier(baseType, options.optionalType)
    const withDefault =
      options.optionalType !== "nullable"
        ? applyDefaultModifier(withOptional, propSchema as any)
        : withOptional
    const finalType = isRequired ? baseType : withDefault
    properties.push(`  ${formatPropertyName(propName)}: ${finalType},`)
  }

  if (properties.length === 0) {
    return "z.object({})"
  }

  return `z.object({\n${properties.join("\n")}\n})`
}

/**
 * Builds a Zod schema expression for an OpenAPI string schema.
 *
 * Constructs an appropriate Zod string validator based on the schema's `format`, length and pattern constraints, and generation options.
 *
 * @param schema - OpenAPI schema object describing the string (may include `format`, `minLength`, `maxLength`, `pattern`, etc.)
 * @param options - Generation options that control date-related format handling and application of length/pattern constraints
 * @returns A string containing the Zod schema expression corresponding to `schema`
 */
export function buildString(schema: any, options: SchemaOptions): string {
  // OpenAPI binary (multipart uploads) - keep runtime-safe across Node/Bun/Browser
  if (schema.format === "binary") {
    return `(typeof Blob === "undefined" ? z.unknown() : z.instanceof(Blob))`
  }

  if (options.strictDates) {
    switch (schema.format) {
      case "date-time":
        return "z.string().datetime()"
      case "date":
        return "z.string().date()"
      case "time":
        return "z.string().time()"
      case "duration":
        return "z.string().duration()"
    }
  }

  let builder = "z.string()"

  if (options.strictNumeric) {
    if (typeof schema.minLength === "number") {
      builder += `.min(${schema.minLength})`
    }

    if (typeof schema.maxLength === "number") {
      builder += `.max(${schema.maxLength})`
    }

    if (schema.pattern) {
      builder += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`
    }
  }

  switch (schema.format) {
    case "uuid":
      return `${builder}.uuid()`
    case "email":
      return `${builder}.email()`
    case "uri":
    case "url":
      return `${builder}.url()`
    case "ipv4":
      return `${builder}.ip({ version: "v4" })`
    case "ipv6":
      return `${builder}.ip({ version: "v6" })`
    default:
      return builder
  }
}

/**
 * Appends a default value to a Zod type expression when the OpenAPI schema defines one.
 *
 * @param zodType - The Zod type expression to modify (as a string)
 * @param schema - The OpenAPI schema object that may contain a `default` value
 * @returns The original `zodType` with `.default(<value>)` appended if `schema.default` is defined, otherwise the unmodified `zodType`
 */
function applyDefaultModifier(zodType: string, schema: any): string {
  if (!schema || schema.default === undefined) return zodType
  return `${zodType}.default(${JSON.stringify(schema.default)})`
}

/**
 * Builds a Zod number schema with numeric constraints.
 */
export function buildNumber(schema: any, options: SchemaOptions): string {
  let builder = "z.number()"

  if (options.strictNumeric) {
    builder = applyNumericBounds(schema, builder)

    if (typeof schema.multipleOf === "number" && schema.multipleOf !== 0) {
      builder += `.refine((value) => Math.abs(value / ${schema.multipleOf} - Math.round(value / ${schema.multipleOf})) < Number.EPSILON, { message: "Must be a multiple of ${schema.multipleOf}" })`
    }
  }

  return builder
}

/**
 * Builds a Zod integer schema (number with int validator).
 */
export function buildInteger(schema: any, options: SchemaOptions): string {
  let builder = buildNumber(schema, options)
  builder += ".int()"
  return builder
}

/**
 * Applies minItems, maxItems, and uniqueItems constraints to array schemas.
 */
export function applyStrictArrayBounds(
  schema: any,
  builder: string,
  itemSchema: any,
  enforceBounds: boolean
): string {
  if (!enforceBounds) {
    return builder
  }

  if (typeof schema.minItems === "number") {
    builder += `.min(${schema.minItems})`
  }

  if (typeof schema.maxItems === "number") {
    builder += `.max(${schema.maxItems})`
  }

  if (schema.uniqueItems && isPrimitiveLike(itemSchema)) {
    builder +=
      '.refine((items) => new Set(items).size === items.length, { message: "Items must be unique" })'
  }

  return builder
}

/**
 * Checks if a schema represents a primitive type (safe for uniqueness checks).
 */
export function isPrimitiveLike(schema: any): boolean {
  if (schema?.$ref) return false

  const primitiveTypes = new Set(["string", "number", "integer", "boolean"])
  return primitiveTypes.has(schema?.type)
}

/**
 * Applies min/max numeric bounds with exclusive variants.
 */
export function applyNumericBounds(schema: any, builder: string): string {
  if (typeof schema.minimum === "number") {
    if (schema.exclusiveMinimum === true) {
      builder += `.gt(${schema.minimum})`
    } else {
      builder += `.min(${schema.minimum})`
    }
  } else if (typeof schema.exclusiveMinimum === "number") {
    builder += `.gt(${schema.exclusiveMinimum})`
  }

  if (typeof schema.maximum === "number") {
    if (schema.exclusiveMaximum === true) {
      builder += `.lt(${schema.maximum})`
    } else {
      builder += `.max(${schema.maximum})`
    }
  } else if (typeof schema.exclusiveMaximum === "number") {
    builder += `.lt(${schema.exclusiveMaximum})`
  }

  return builder
}
