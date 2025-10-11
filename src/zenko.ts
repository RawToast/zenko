import { topologicalSort, extractRefName } from "./utils/topological-sort"
import { formatPropertyName } from "./utils/property-name"

export type OpenAPISpec = {
  openapi: string
  info: unknown
  paths: Record<string, Record<string, unknown>>
  components?: {
    schemas?: Record<string, unknown>
  }
}

export type GenerateOptions = {
  strictDates?: boolean
  strictNumeric?: boolean
}

type PathParam = {
  name: string
  type: string
}

type Operation = {
  operationId: string
  path: string
  method: string
  pathParams: PathParam[]
  requestType?: string
  responseType?: string
}

export function generate(
  spec: OpenAPISpec,
  options: GenerateOptions = {}
): string {
  const output: string[] = []
  const generatedTypes = new Set<string>()
  const { strictDates = false, strictNumeric = false } = options
  const schemaOptions: SchemaOptions = {
    strictDates,
    strictNumeric,
  }

  output.push('import { z } from "zod";')
  output.push("")

  // Generate Zod schemas from components/schemas
  if (spec.components?.schemas) {
    output.push("// Generated Zod Schemas")
    output.push("")

    // Sort schemas by dependencies (topological sort)
    const sortedSchemas = topologicalSort(spec.components.schemas)

    for (const name of sortedSchemas) {
      const schema = spec.components.schemas[name]
      output.push(
        generateZodSchema(name, schema, generatedTypes, schemaOptions)
      )
      output.push("")
      // Export inferred type
      output.push(`export type ${name} = z.infer<typeof ${name}>;`)
      output.push("")
    }
  }

  // Parse all operations
  const operations = parseOperations(spec)

  // Generate path functions
  output.push("// Path Functions")
  output.push("export const paths = {")

  for (const op of operations) {
    if (op.pathParams.length === 0) {
      output.push(`  ${op.operationId}: () => "${op.path}",`)
    } else {
      const paramNames = op.pathParams.map((p) => p.name).join(", ")
      const paramTypes = op.pathParams
        .map((p) => `${p.name}: string`)
        .join(", ")
      const pathWithParams = op.path.replace(/{([^}]+)}/g, "${$1}")
      output.push(
        `  ${op.operationId}: ({ ${paramNames} }: { ${paramTypes} }) => \`${pathWithParams}\`,`
      )
    }
  }

  output.push("} as const;")
  output.push("")

  // Generate operation objects
  output.push("// Operation Objects")
  for (const op of operations) {
    output.push(`export const ${op.operationId} = {`)
    output.push(`  path: paths.${op.operationId},`)

    if (op.requestType) {
      output.push(`  request: ${op.requestType},`)
    }

    if (op.responseType) {
      output.push(`  response: ${op.responseType},`)
    }

    output.push("} as const;")
    output.push("")
  }

  return output.join("\n")
}

function parseOperations(spec: OpenAPISpec): Operation[] {
  const operations: Operation[] = []

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!(operation as any).operationId) continue

      const pathParams = extractPathParams(path)
      const requestType = getRequestType(operation)
      const responseType = getResponseType(operation)

      operations.push({
        operationId: (operation as any).operationId,
        path,
        method: method.toLowerCase(),
        pathParams,
        requestType,
        responseType,
      })
    }
  }

  return operations
}

function extractPathParams(path: string): PathParam[] {
  const params: PathParam[] = []
  const matches = path.match(/{([^}]+)}/g)

  if (matches) {
    for (const match of matches) {
      const paramName = match.slice(1, -1)
      params.push({
        name: paramName,
        type: "string", // OpenAPI path params are always strings
      })
    }
  }

  return params
}

function getRequestType(operation: any): string | undefined {
  const requestBody =
    operation.requestBody?.content?.["application/json"]?.schema
  if (!requestBody) return undefined

  if (requestBody.$ref) {
    return extractRefName(requestBody.$ref)
  }

  // Generate inline type if needed
  const typeName = `${capitalize(operation.operationId)}Request`
  return typeName
}

function getResponseType(operation: any): string | undefined {
  const response200 =
    operation.responses?.["200"]?.content?.["application/json"]?.schema
  if (!response200) return undefined

  if (response200.$ref) {
    return extractRefName(response200.$ref)
  }

  // Generate inline type if needed
  const typeName = `${capitalize(operation.operationId)}Response`
  return typeName
}

type SchemaOptions = {
  strictDates: boolean
  strictNumeric: boolean
}

function generateZodSchema(
  name: string,
  schema: any,
  generatedTypes: Set<string>,
  options: SchemaOptions
): string {
  if (generatedTypes.has(name)) return ""
  generatedTypes.add(name)

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `export const ${name} = z.enum([${enumValues}]);`
  }

  if (schema.type === "object" || schema.properties) {
    const properties: string[] = []

    for (const [propName, propSchema] of Object.entries(
      schema.properties || {}
    )) {
      const isRequired = schema.required?.includes(propName) ?? false
      const zodType = getZodTypeFromSchema(propSchema as any, options)
      const finalType = isRequired ? zodType : `${zodType}.optional()`
      properties.push(`  ${formatPropertyName(propName)}: ${finalType},`)
    }

    return `export const ${name} = z.object({\n${properties.join("\n")}\n});`
  }

  if (schema.type === "array") {
    const itemSchema = schema.items ?? { type: "unknown" }
    const itemType = getZodTypeFromSchema(itemSchema, options)
    const builder = applyStrictArrayBounds(
      schema,
      `z.array(${itemType})`,
      itemSchema,
      options.strictNumeric
    )
    return `export const ${name} = ${builder};`
  }

  return `export const ${name} = ${getZodTypeFromSchema(schema, options)};`
}

function getZodTypeFromSchema(schema: any, options: SchemaOptions): string {
  if (schema.$ref) {
    return extractRefName(schema.$ref)
  }

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `z.enum([${enumValues}])`
  }

  switch (schema.type) {
    case "string":
      return buildString(schema, options)
    case "boolean":
      return "z.boolean()"
    case "array":
      return `z.array(${getZodTypeFromSchema(
        schema.items ?? { type: "unknown" },
        options
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

function buildString(schema: any, options: SchemaOptions): string {
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

function buildNumber(schema: any, options: SchemaOptions): string {
  let builder = "z.number()"

  if (options.strictNumeric) {
    builder = applyNumericBounds(schema, builder)

    if (typeof schema.multipleOf === "number" && schema.multipleOf !== 0) {
      builder += `.refine((value) => Math.abs(value / ${schema.multipleOf} - Math.round(value / ${schema.multipleOf})) < Number.EPSILON, { message: "Must be a multiple of ${schema.multipleOf}" })`
    }
  }

  return builder
}

function buildInteger(schema: any, options: SchemaOptions): string {
  let builder = buildNumber(schema, options)
  builder += ".int()"
  return builder
}

function applyStrictArrayBounds(
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

function isPrimitiveLike(schema: any): boolean {
  if (schema?.$ref) return false

  const primitiveTypes = new Set(["string", "number", "integer", "boolean"])
  return primitiveTypes.has(schema?.type)
}

function applyNumericBounds(schema: any, builder: string): string {
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

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
