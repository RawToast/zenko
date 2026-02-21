import { extractRefName } from "../utils/topological-sort"
import { formatPropertyName } from "../utils/property-name"

export type SchemaOptions = {
  strictDates: boolean
  strictNumeric: boolean
  dateTimeOffset: boolean | string[]
  optionalType: "optional" | "nullable" | "nullish"
  openEnums: boolean | string[]
  openEnumPrefix: string
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
  nameMap?: Map<string, string>,
  schemaRegistry?: Record<string, unknown>
): string {
  if (generatedTypes.has(name)) return ""
  generatedTypes.add(name)

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    if (isOpenEnum(name, options.openEnums)) {
      const p = options.openEnumPrefix
      return `const ${name}Known = [${enumValues}] as const;\nexport const ${name} = z.enum(${name}Known).or(\n  z.string().transform((v): \`${p}\${string}\` => \`${p}\${v}\`)\n);`
    }
    return `export const ${name} = z.enum([${enumValues}]);`
  }

  // Handle allOf schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const allOfSchemas = buildAllOfSchemas(schema)
    const allOfParts = allOfSchemas.map((part: any) =>
      getZodTypeFromSchema(part, options, nameMap, schemaRegistry, name)
    )
    if (allOfParts.length === 0) return `export const ${name} = z.object({});`
    if (allOfParts.length === 1)
      return `export const ${name} = ${allOfParts[0]};`
    const shouldMerge = allOfSchemas.every((part: any) =>
      isObjectSchema(part, schemaRegistry)
    )
    const joinMethod = shouldMerge ? "merge" : "and"
    const first = allOfParts[0]
    const rest = allOfParts
      .slice(1)
      .map((part: string) => `.${joinMethod}(${part})`)
      .join("")
    return `export const ${name} = ${first}${rest};`
  }

  if (schema.type === "object" || schema.properties) {
    return `export const ${name} = ${buildZodObject(
      schema,
      options,
      nameMap,
      schemaRegistry,
      name
    )};`
  }

  if (schema.type === "array") {
    const itemSchema = schema.items ?? { type: "unknown" }
    const itemType = getZodTypeFromSchema(
      itemSchema,
      options,
      nameMap,
      schemaRegistry,
      name
    )
    const enforceBounds =
      options.strictNumeric ||
      schema.minItems !== undefined ||
      schema.maxItems !== undefined ||
      schema.uniqueItems === true
    const builder = applyStrictArrayBounds(
      schema,
      `z.array(${itemType})`,
      itemSchema,
      enforceBounds
    )
    return `export const ${name} = ${builder};`
  }

  return `export const ${name} = ${getZodTypeFromSchema(
    schema,
    options,
    nameMap,
    schemaRegistry,
    name,
    name
  )};`
}

function buildZodUnion(
  schemas: any[],
  options: SchemaOptions,
  nameMap?: Map<string, string>,
  schemaRegistry?: Record<string, unknown>,
  currentSchemaName?: string
): string {
  const unionParts = schemas.map((part) =>
    getZodTypeFromSchema(
      part,
      options,
      nameMap,
      schemaRegistry,
      currentSchemaName
    )
  )

  if (unionParts.length === 0) return "z.unknown()"
  if (unionParts.length === 1) return unionParts[0] ?? "z.unknown()"
  return `z.union([${unionParts.join(", ")}])`
}

function isPrimitiveConstValue(
  value: unknown
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
}

function resolveRefSchema(
  schema: any,
  schemaRegistry?: Record<string, unknown>
): any {
  if (!schema?.$ref) return schema
  const refName = extractRefName(schema.$ref)
  return schemaRegistry?.[refName] ?? schema
}

function hasMeaningfulSchemaKeys(schema: any): boolean {
  const meaningfulKeys = [
    "$ref",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "enum",
    "const",
    "oneOf",
    "anyOf",
    "not",
  ]

  return meaningfulKeys.some((key) => schema?.[key] !== undefined)
}

function buildAllOfSchemas(schema: any): any[] {
  const allOfSchemas = Array.isArray(schema.allOf) ? [...schema.allOf] : []
  const baseSchema = { ...schema }
  delete baseSchema.allOf
  if (hasMeaningfulSchemaKeys(baseSchema)) {
    allOfSchemas.push(baseSchema)
  }
  return allOfSchemas
}

function schemaReferencesName(
  schema: any,
  targetName: string,
  schemaRegistry?: Record<string, unknown>,
  nameMap?: Map<string, string>,
  visited = new Set<unknown>()
): boolean {
  if (!schema || visited.has(schema)) return false
  visited.add(schema)

  if (schema.$ref) {
    const refName = extractRefName(schema.$ref)
    const resolvedName = nameMap?.get(refName) || refName
    if (resolvedName === targetName) return true
    const resolvedSchema = schemaRegistry?.[refName]
    if (resolvedSchema) {
      return schemaReferencesName(
        resolvedSchema,
        targetName,
        schemaRegistry,
        nameMap,
        visited
      )
    }
  }

  if (Array.isArray(schema.allOf)) {
    return schema.allOf.some((part: any) =>
      schemaReferencesName(part, targetName, schemaRegistry, nameMap, visited)
    )
  }

  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.some((part: any) =>
      schemaReferencesName(part, targetName, schemaRegistry, nameMap, visited)
    )
  }

  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some((part: any) =>
      schemaReferencesName(part, targetName, schemaRegistry, nameMap, visited)
    )
  }

  if (schema.not) {
    return schemaReferencesName(
      schema.not,
      targetName,
      schemaRegistry,
      nameMap,
      visited
    )
  }

  if (schema.items) {
    return schemaReferencesName(
      schema.items,
      targetName,
      schemaRegistry,
      nameMap,
      visited
    )
  }

  if (schema.properties) {
    return Object.values(schema.properties).some((value) =>
      schemaReferencesName(value, targetName, schemaRegistry, nameMap, visited)
    )
  }

  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    return schemaReferencesName(
      schema.additionalProperties,
      targetName,
      schemaRegistry,
      nameMap,
      visited
    )
  }

  return false
}

function isObjectSchema(
  schema: any,
  schemaRegistry?: Record<string, unknown>
): boolean {
  const resolvedSchema = resolveRefSchema(schema, schemaRegistry)
  if (!resolvedSchema) return false
  if (resolvedSchema.allOf && Array.isArray(resolvedSchema.allOf)) {
    const allOfSchemas = buildAllOfSchemas(resolvedSchema)
    return allOfSchemas.every((part: any) =>
      isObjectSchema(part, schemaRegistry)
    )
  }

  return (
    resolvedSchema.type === "object" ||
    resolvedSchema.properties !== undefined ||
    resolvedSchema.additionalProperties !== undefined
  )
}

type DiscriminatorMappingEntry = {
  ref: string
  values: string[]
}

function buildDiscriminatorMapping(
  discriminator: { mapping?: Record<string, string> } | undefined
): Map<string, DiscriminatorMappingEntry> {
  const mapping = new Map<string, DiscriminatorMappingEntry>()
  if (!discriminator?.mapping) return mapping

  for (const [discriminatorValue, schemaRef] of Object.entries(
    discriminator.mapping
  )) {
    if (typeof schemaRef !== "string") continue
    const refName = extractRefName(schemaRef)
    const existing = mapping.get(refName)
    if (existing) {
      if (!existing.values.includes(discriminatorValue)) {
        existing.values.push(discriminatorValue)
      }
      continue
    }
    mapping.set(refName, { ref: schemaRef, values: [discriminatorValue] })
  }

  return mapping
}

type DiscriminatorValue = string | number | boolean | null

function extractDiscriminatorValuesFromSchema(
  schema: any,
  discriminator: string,
  schemaRegistry?: Record<string, unknown>,
  visited = new Set<unknown>()
): DiscriminatorValue[] {
  if (!schema || typeof schema !== "object" || visited.has(schema)) return []
  visited.add(schema)

  if (schema.$ref && typeof schema.$ref === "string") {
    const refName = extractRefName(schema.$ref)
    const resolvedSchema = schemaRegistry?.[refName]
    return resolvedSchema
      ? extractDiscriminatorValuesFromSchema(
          resolvedSchema,
          discriminator,
          schemaRegistry,
          visited
        )
      : []
  }

  const values: DiscriminatorValue[] = []
  const propSchema = schema.properties?.[discriminator]
  if (propSchema) {
    const propConst = (propSchema as { const?: unknown }).const
    if (propConst !== undefined && isPrimitiveConstValue(propConst)) {
      values.push(propConst)
    } else if (
      Array.isArray((propSchema as { enum?: unknown[] }).enum) &&
      (propSchema as { enum?: unknown[] }).enum?.length === 1 &&
      isPrimitiveConstValue((propSchema as { enum?: unknown[] }).enum?.[0])
    ) {
      values.push(
        (propSchema as { enum?: DiscriminatorValue[] })
          .enum?.[0] as DiscriminatorValue
      )
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf) {
      values.push(
        ...extractDiscriminatorValuesFromSchema(
          part,
          discriminator,
          schemaRegistry,
          visited
        )
      )
    }
  }

  return Array.from(new Set(values))
}

function buildMappedDiscriminatorSchema(
  schema: any,
  discriminator: string,
  mappedValue: DiscriminatorValue
): any {
  return {
    allOf: [
      schema,
      {
        type: "object",
        properties: {
          [discriminator]: {
            const: mappedValue,
          },
        },
        required: [discriminator],
      },
    ],
  }
}

function applyDiscriminatorMapping(
  schemas: any[],
  discriminator: string,
  mapping: Map<string, DiscriminatorMappingEntry>,
  schemaRegistry?: Record<string, unknown>
): { schemas: any[]; hasUnmapped: boolean } {
  const oneOfRefNames = new Set<string>()
  for (const part of schemas) {
    if (part?.$ref) {
      oneOfRefNames.add(extractRefName(part.$ref))
    }
  }

  const mappedSchemas: any[] = []
  let hasUnmapped = false

  for (const part of schemas) {
    const mappedValues: DiscriminatorValue[] = []
    if (part?.$ref) {
      const refName = extractRefName(part.$ref)
      const mappedEntry = mapping.get(refName)
      if (mappedEntry?.values.length) {
        mappedValues.push(...mappedEntry.values)
      }
      mappedValues.push(
        ...extractDiscriminatorValuesFromSchema(
          part,
          discriminator,
          schemaRegistry
        )
      )
    } else {
      mappedValues.push(
        ...extractDiscriminatorValuesFromSchema(
          part,
          discriminator,
          schemaRegistry
        )
      )
    }

    const uniqueValues = Array.from(new Set(mappedValues))

    if (uniqueValues.length === 0) {
      hasUnmapped = true
      mappedSchemas.push(part)
      continue
    }

    for (const value of uniqueValues) {
      mappedSchemas.push(
        buildMappedDiscriminatorSchema(part, discriminator, value)
      )
    }
  }

  for (const [refName, mappedEntry] of mapping.entries()) {
    if (oneOfRefNames.has(refName)) continue
    const refSchema = { $ref: mappedEntry.ref }
    for (const value of mappedEntry.values) {
      mappedSchemas.push(
        buildMappedDiscriminatorSchema(refSchema, discriminator, value)
      )
    }
  }

  return { schemas: mappedSchemas, hasUnmapped }
}

function buildZodDiscriminatedUnion(
  schemas: any[],
  discriminator: string,
  options: SchemaOptions,
  nameMap?: Map<string, string>,
  schemaRegistry?: Record<string, unknown>,
  currentSchemaName?: string,
  mapping?: Map<string, DiscriminatorMappingEntry>
): string {
  const { schemas: mappedSchemas, hasUnmapped } = applyDiscriminatorMapping(
    schemas,
    discriminator,
    mapping ?? new Map(),
    schemaRegistry
  )
  const unionParts = mappedSchemas.map((part) =>
    getZodTypeFromSchema(
      part,
      options,
      nameMap,
      schemaRegistry,
      currentSchemaName
    )
  )

  if (unionParts.length === 0) return "z.unknown()"
  if (unionParts.length === 1) return unionParts[0] ?? "z.unknown()"
  if (hasUnmapped) {
    return `z.union([${unionParts.join(", ")}])`
  }
  return `z.discriminatedUnion(${JSON.stringify(discriminator)}, [${unionParts.join(", ")}])`
}

/**
 * Converts an OpenAPI schema to a Zod type expression.
 * Recursively handles nested schemas, references, and all OpenAPI schema types.
 */
export function getZodTypeFromSchema(
  schema: any,
  options: SchemaOptions,
  nameMap?: Map<string, string>,
  schemaRegistry?: Record<string, unknown>,
  currentSchemaName?: string,
  ownName?: string
): string {
  if (schema.$ref) {
    const refName = extractRefName(schema.$ref)
    const resolvedName = nameMap?.get(refName) || refName
    if (
      currentSchemaName &&
      (resolvedName === currentSchemaName ||
        schemaReferencesName(
          schemaRegistry?.[refName],
          currentSchemaName,
          schemaRegistry,
          nameMap
        ))
    ) {
      // Add explicit type annotation to prevent 'any' type inference with circular refs
      return `z.lazy((): z.ZodTypeAny => ${resolvedName})`
    }
    return resolvedName
  }

  if (schema.const !== undefined && isPrimitiveConstValue(schema.const)) {
    return `z.literal(${JSON.stringify(schema.const)})`
  }

  if (schema.enum) {
    if (schema.enum.length === 1) {
      return `z.literal(${JSON.stringify(schema.enum[0])})`
    }
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `z.enum([${enumValues}])`
  }

  if (schema.not) {
    const notSchema = schema.not
    const baseSchema = { ...schema }
    delete baseSchema.not
    const baseType = hasMeaningfulSchemaKeys(baseSchema)
      ? getZodTypeFromSchema(
          baseSchema,
          options,
          nameMap,
          schemaRegistry,
          currentSchemaName
        )
      : "z.any()"
    if (notSchema?.type === "string" && notSchema.maxLength === 0) {
      return `${baseType}.refine((value) => typeof value !== "string" || value.length > 0, { message: "Value must not be empty" })`
    }
    const notType = getZodTypeFromSchema(
      notSchema,
      options,
      nameMap,
      schemaRegistry,
      currentSchemaName
    )
    return `${baseType}.refine((value) => !${notType}.safeParse(value).success, { message: "Value must not match schema" })`
  }

  // Handle allOf schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const allOfSchemas = buildAllOfSchemas(schema)
    const allOfParts = allOfSchemas.map((part: any) =>
      getZodTypeFromSchema(
        part,
        options,
        nameMap,
        schemaRegistry,
        currentSchemaName
      )
    )
    if (allOfParts.length === 0) return "z.object({})"
    if (allOfParts.length === 1) return allOfParts[0] ?? "z.object({})"
    const shouldMerge = allOfSchemas.every((part: any) =>
      isObjectSchema(part, schemaRegistry)
    )
    const joinMethod = shouldMerge ? "merge" : "and"
    const first = allOfParts[0]
    const rest = allOfParts
      .slice(1)
      .map((part: string) => `.${joinMethod}(${part})`)
      .join("")
    return `${first}${rest}`
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    if (schema.discriminator?.propertyName) {
      const mapping = buildDiscriminatorMapping(schema.discriminator)
      return buildZodDiscriminatedUnion(
        schema.oneOf,
        schema.discriminator.propertyName,
        options,
        nameMap,
        schemaRegistry,
        currentSchemaName,
        mapping
      )
    }
    return buildZodUnion(
      schema.oneOf,
      options,
      nameMap,
      schemaRegistry,
      currentSchemaName
    )
  }

  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    return buildZodUnion(
      schema.anyOf,
      options,
      nameMap,
      schemaRegistry,
      currentSchemaName
    )
  }

  // Check for object with properties (including those without explicit type)
  if (schema.type === "object" || schema.properties || schema.allOf) {
    return buildZodObject(
      schema,
      options,
      nameMap,
      schemaRegistry,
      currentSchemaName
    )
  }

  switch (schema.type) {
    case "string":
      return buildString(schema, options, ownName)
    case "boolean":
      return "z.boolean()"
    case "array": {
      const itemSchema = schema.items ?? { type: "unknown" }
      const itemType = getZodTypeFromSchema(
        itemSchema,
        options,
        nameMap,
        schemaRegistry,
        currentSchemaName
      )
      const enforceBounds =
        options.strictNumeric ||
        schema.minItems !== undefined ||
        schema.maxItems !== undefined ||
        schema.uniqueItems === true
      return applyStrictArrayBounds(
        schema,
        `z.array(${itemType})`,
        itemSchema,
        enforceBounds
      )
    }
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

function getDiscriminatorRequiredProperties(
  schemaRegistry: Record<string, unknown> | undefined,
  currentSchemaName: string | undefined
): Set<string> {
  if (!schemaRegistry || !currentSchemaName) return new Set()

  const requiredProperties = new Set<string>()
  for (const schema of Object.values(schemaRegistry)) {
    if (!schema || typeof schema !== "object") continue
    const discriminatorName = (schema as any).discriminator?.propertyName
    if (!discriminatorName || !Array.isArray((schema as any).oneOf)) continue

    const oneOfSchemas = (schema as any).oneOf as any[]
    const matchesOneOf = oneOfSchemas.some(
      (part) => part?.$ref && extractRefName(part.$ref) === currentSchemaName
    )

    const mappingValues = Object.values(
      (schema as any).discriminator?.mapping ?? {}
    )
    const matchesMapping = mappingValues.some(
      (value) =>
        typeof value === "string" && extractRefName(value) === currentSchemaName
    )

    if (matchesOneOf || matchesMapping) {
      requiredProperties.add(discriminatorName)
    }
  }

  return requiredProperties
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
  nameMap?: Map<string, string>,
  schemaRegistry?: Record<string, unknown>,
  currentSchemaName?: string
): string {
  const properties: string[] = []
  const discriminatorRequiredProperties = getDiscriminatorRequiredProperties(
    schemaRegistry,
    currentSchemaName
  )
  const requiredProps = new Set(schema.required ?? [])

  for (const [propName, propSchema] of Object.entries(
    schema.properties || {}
  )) {
    const isRequired =
      requiredProps.has(propName) ||
      discriminatorRequiredProperties.has(propName)
    const baseType = getZodTypeFromSchema(
      propSchema as any,
      options,
      nameMap,
      schemaRegistry,
      currentSchemaName
    )
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

  const baseObject =
    properties.length === 0
      ? "z.object({})"
      : `z.object({\n${properties.join("\n")}\n})`

  if (schema.additionalProperties === undefined) {
    return baseObject
  }

  if (schema.additionalProperties === false) {
    return `${baseObject}.strict()`
  }

  if (schema.additionalProperties === true) {
    return `${baseObject}.passthrough()`
  }

  const additionalType = getZodTypeFromSchema(
    schema.additionalProperties,
    options,
    nameMap,
    schemaRegistry,
    currentSchemaName
  )

  return `${baseObject}.catchall(${additionalType})`
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
export function buildString(
  schema: any,
  options: SchemaOptions,
  schemaName?: string
): string {
  // OpenAPI binary (multipart uploads) - keep runtime-safe across Node/Bun/Browser
  if (schema.format === "binary") {
    return `(typeof Blob === "undefined" ? z.unknown() : z.instanceof(Blob))`
  }

  if (options.strictDates) {
    switch (schema.format) {
      case "date-time": {
        const useOffset =
          options.dateTimeOffset === true ||
          (Array.isArray(options.dateTimeOffset) &&
            schemaName !== undefined &&
            options.dateTimeOffset.includes(schemaName))
        return useOffset
          ? "z.string().datetime({ offset: true })"
          : "z.string().datetime()"
      }
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
 * Skips applying default(null) for schemas that don't accept null values to prevent type errors.
 *
 * @param zodType - The Zod type expression to modify (as a string)
 * @param schema - The OpenAPI schema object that may contain a `default` value
 * @returns The original `zodType` with `.default(<value>)` appended if `schema.default` is defined and valid, otherwise the unmodified `zodType`
 */
function applyDefaultModifier(zodType: string, schema: any): string {
  if (!schema || schema.default === undefined) return zodType

  // Don't apply null default if the Zod type doesn't accept null values
  // A Zod type accepts null if it has .nullable() or .nullish() applied
  if (schema.default === null) {
    const acceptsNull =
      zodType.includes(".nullable()") ||
      zodType.includes(".nullish()") ||
      schema.type === "null" ||
      (Array.isArray(schema.type) && schema.type.includes("null"))
    if (!acceptsNull) {
      return zodType
    }
  }

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
