// Note: fs and yaml imports removed as they're not used in the generator
// They are used in the CLI file instead
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

export class OpenAPIGenerator {
  private spec: OpenAPISpec

  constructor(spec: OpenAPISpec) {
    this.spec = spec
  }

  generate(): string {
    const output: string[] = []

    output.push('import { z } from "zod";')
    output.push("")

    // Generate Zod schemas from components/schemas
    if (this.spec.components?.schemas) {
      output.push("// Generated Zod Schemas")
      output.push("")

      // Sort schemas by dependencies (topological sort)
      const schemaNames = Object.keys(this.spec.components.schemas)
      const dependencies = new Map<string, string[]>()

      for (const schemaName of schemaNames) {
        const schema = this.spec.components.schemas[schemaName]
        dependencies.set(schemaName, this.extractDependencies(schema))
      }

      const sortedSchemas = topologicalSort(dependencies)

      for (const schemaName of sortedSchemas) {
        const schema = this.spec.components.schemas[schemaName]
        output.push(this.generateZodSchema(schemaName, schema))
        output.push("")
      }
    }

    // Generate path functions
    output.push("// Generated Path Functions")
    output.push("")

    const operations = this.extractOperations()

    for (const operation of operations) {
      output.push(this.generatePathFunction(operation))
      output.push("")
    }

    // Generate operations object
    output.push("// Generated Operations Object")
    output.push("export const operations = {")
    for (const operation of operations) {
      const responseType = operation.responseType || "unknown"
      const requestType = operation.requestType || "z.object({})"

      output.push(`  "${operation.operationId}": {`)
      output.push(`    path: "${operation.path}",`)
      output.push(`    method: "${operation.method.toUpperCase()}",`)
      output.push(`    response: ${responseType},`)
      output.push(`    request: ${requestType},`)
      output.push("  },")
    }
    output.push("}")

    return output.join("\n")
  }

  private extractDependencies(schema: any): string[] {
    const deps: string[] = []

    if (typeof schema !== "object" || !schema) return deps

    // Handle $ref
    if (schema.$ref) {
      const refName = extractRefName(schema.$ref)
      deps.push(refName)
      return deps
    }

    // Handle array items
    if (schema.type === "array" && schema.items) {
      deps.push(...this.extractDependencies(schema.items))
    }

    // Handle object properties
    if (schema.type === "object" && schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        deps.push(...this.extractDependencies(prop))
      }
    }

    // Handle allOf, oneOf, anyOf
    for (const key of ["allOf", "oneOf", "anyOf"]) {
      if (schema[key] && Array.isArray(schema[key])) {
        for (const subSchema of schema[key]) {
          deps.push(...this.extractDependencies(subSchema))
        }
      }
    }

    return Array.from(new Set(deps))
  }

  private generateZodSchema(name: string, schema: any): string {
    const zodType = this.convertToZodType(schema)
    return `export const ${name} = ${zodType};`
  }

  private convertToZodType(schema: any): string {
    if (!schema || typeof schema !== "object") {
      return "z.unknown()"
    }

    // Handle $ref
    if (schema.$ref) {
      const refName = extractRefName(schema.$ref)
      return refName
    }

    // Handle allOf (intersection)
    if (schema.allOf && Array.isArray(schema.allOf)) {
      const types = schema.allOf.map((s: any) => this.convertToZodType(s))
      return types.length > 1
        ? `z.intersection(${types[0]}, ${types.slice(1).join(", ")})`
        : types[0] || "z.object({})"
    }

    // Handle oneOf/anyOf (union)
    if (
      (schema.oneOf || schema.anyOf) &&
      Array.isArray(schema.oneOf || schema.anyOf)
    ) {
      const unionSchemas = schema.oneOf || schema.anyOf
      const types = unionSchemas.map((s: any) => this.convertToZodType(s))
      return types.length > 1
        ? `z.union([${types.join(", ")}])`
        : types[0] || "z.unknown()"
    }

    switch (schema.type) {
      case "string":
        if (schema.enum && Array.isArray(schema.enum)) {
          const enumValues = schema.enum
            .map((val: any) => `"${val}"`)
            .join(", ")
          return `z.enum([${enumValues}])`
        }
        if (schema.format === "date-time") return "z.string().datetime()"
        if (schema.format === "date") return "z.string().date()"
        if (schema.format === "email") return "z.string().email()"
        if (schema.format === "uri") return "z.string().url()"
        return "z.string()"

      case "number":
      case "integer":
        let zodNum =
          schema.type === "integer" ? "z.number().int()" : "z.number()"
        if (typeof schema.minimum === "number") {
          zodNum += `.min(${schema.minimum})`
        }
        if (typeof schema.maximum === "number") {
          zodNum += `.max(${schema.maximum})`
        }
        return zodNum

      case "boolean":
        return "z.boolean()"

      case "array":
        const itemType = schema.items
          ? this.convertToZodType(schema.items)
          : "z.unknown()"
        let arrayType = `z.array(${itemType})`
        if (typeof schema.minItems === "number") {
          arrayType += `.min(${schema.minItems})`
        }
        if (typeof schema.maxItems === "number") {
          arrayType += `.max(${schema.maxItems})`
        }
        return arrayType

      case "object":
        if (!schema.properties) {
          return "z.object({})"
        }

        const properties: string[] = []
        const required = new Set(schema.required || [])

        for (const [propName, propSchema] of Object.entries(
          schema.properties
        )) {
          const zodType = this.convertToZodType(propSchema)
          const isRequired = required.has(propName)
          const finalType = isRequired ? zodType : `${zodType}.optional()`
          const formattedName = formatPropertyName(propName)
          properties.push(`${formattedName}: ${finalType}`)
        }

        return `z.object({\n  ${properties.join(",\n  ")}\n})`

      default:
        return "z.unknown()"
    }
  }

  private extractOperations(): Operation[] {
    const operations: Operation[] = []

    for (const [path, pathItem] of Object.entries(this.spec.paths)) {
      for (const [method, operation] of Object.entries(
        pathItem as Record<string, any>
      )) {
        if (typeof operation === "object" && operation.operationId) {
          const pathParams = this.extractPathParams(path, operation)

          let requestType: string | undefined
          let responseType: string | undefined

          // Extract request type from requestBody
          if (operation.requestBody?.content?.["application/json"]?.schema) {
            const requestSchema =
              operation.requestBody.content["application/json"].schema
            requestType = this.convertToZodType(requestSchema)
          }

          // Extract response type (200 response)
          if (
            operation.responses?.["200"]?.content?.["application/json"]?.schema
          ) {
            const responseSchema =
              operation.responses["200"].content["application/json"].schema
            responseType = this.convertToZodType(responseSchema)
          }

          operations.push({
            operationId: operation.operationId,
            path,
            method,
            pathParams,
            requestType,
            responseType,
          })
        }
      }
    }

    return operations
  }

  private extractPathParams(path: string, operation: any): PathParam[] {
    const pathParams: PathParam[] = []
    const pathParamRegex = /\{([^}]+)\}/g
    let match

    while ((match = pathParamRegex.exec(path)) !== null) {
      const paramName = match[1]

      if (!paramName) continue

      // Look for parameter definition in operation
      const paramDef = operation.parameters?.find(
        (p: any) => p.name === paramName && p.in === "path"
      )

      pathParams.push({
        name: paramName,
        type: this.mapOpenAPITypeToTypeScript(
          paramDef?.schema?.type || "string"
        ),
      })
    }

    return pathParams
  }

  private mapOpenAPITypeToTypeScript(type: string): string {
    switch (type) {
      case "integer":
      case "number":
        return "number"
      case "boolean":
        return "boolean"
      case "string":
      default:
        return "string"
    }
  }

  private generatePathFunction(operation: Operation): string {
    const { operationId, path, pathParams } = operation

    // Generate function parameters
    const params: string[] = []
    if (pathParams.length > 0) {
      const pathParamType = pathParams
        .map((p) => `${p.name}: ${p.type}`)
        .join("; ")
      params.push(`pathParams: { ${pathParamType} }`)
    }

    // Generate the path template with parameter substitution
    let pathTemplate = path
    for (const param of pathParams) {
      pathTemplate = pathTemplate.replace(
        `{${param.name}}`,
        `\${pathParams.${param.name}}`
      )
    }

    const functionName = operationId
    const paramList = params.join(", ")

    return `export function ${functionName}(${paramList}): string {
  return \`${pathTemplate}\`;
}`
  }
}
