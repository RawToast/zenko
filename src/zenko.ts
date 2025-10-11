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
  void strictDates
  void strictNumeric

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
      output.push(generateZodSchema(name, schema, generatedTypes))
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

function generateZodSchema(
  name: string,
  schema: any,
  generatedTypes: Set<string>
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
      const zodType = getZodTypeFromSchema(propSchema as any)
      const finalType = isRequired ? zodType : `${zodType}.optional()`
      properties.push(`  ${formatPropertyName(propName)}: ${finalType},`)
    }

    return `export const ${name} = z.object({\n${properties.join("\n")}\n});`
  }

  if (schema.type === "array") {
    const itemType = getZodTypeFromSchema(schema.items)
    return `export const ${name} = z.array(${itemType});`
  }

  return `export const ${name} = ${getZodTypeFromSchema(schema)};`
}

function getZodTypeFromSchema(schema: any): string {
  if (schema.$ref) {
    return extractRefName(schema.$ref)
  }

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `z.enum([${enumValues}])`
  }

  switch (schema.type) {
    case "string":
      return "z.string()"
    case "number":
      return "z.number()"
    case "integer":
      return "z.number().int()"
    case "boolean":
      return "z.boolean()"
    case "array":
      return `z.array(${getZodTypeFromSchema(schema.items)})`
    case "object":
      if (schema.properties) {
        const props = Object.entries(schema.properties)
          .map(([key, prop]) => {
            const isRequired = schema.required?.includes(key) ?? false
            const zodType = getZodTypeFromSchema(prop)
            const finalType = isRequired ? zodType : `${zodType}.optional()`
            return `${formatPropertyName(key)}: ${finalType}`
          })
          .join(", ")
        return `z.object({ ${props} })`
      }
      return "z.record(z.unknown())"
    default:
      return "z.unknown()"
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
