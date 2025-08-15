#!/usr/bin/env tsx

import * as fs from "fs"
import * as yaml from "js-yaml"

interface OpenAPISpec {
  openapi: string
  info: any
  paths: Record<string, Record<string, any>>
  components?: {
    schemas?: Record<string, any>
  }
}

interface PathParam {
  name: string
  type: string
}

interface Operation {
  operationId: string
  path: string
  method: string
  pathParams: PathParam[]
  requestType?: string
  responseType?: string
}

export class OpenAPIGenerator {
  private spec: OpenAPISpec
  private generatedTypes = new Set<string>()

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
      const sortedSchemas = this.topologicalSort(this.spec.components.schemas)

      for (const name of sortedSchemas) {
        const schema = this.spec.components.schemas[name]
        output.push(this.generateZodSchema(name, schema))
        output.push("")
        // Export inferred type
        output.push(`export type ${name} = z.infer<typeof ${name}>;`)
        output.push("")
      }
    }

    // Parse all operations
    const operations = this.parseOperations()

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
        output.push(`  request: ${op.requestType}.safeParse,`)
      }

      if (op.responseType) {
        output.push(`  response: ${op.responseType},`)
      }

      output.push("} as const;")
      output.push("")
    }

    return output.join("\n")
  }

  private parseOperations(): Operation[] {
    const operations: Operation[] = []

    for (const [path, pathItem] of Object.entries(this.spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!operation.operationId) continue

        const pathParams = this.extractPathParams(path)
        const requestType = this.getRequestType(operation)
        const responseType = this.getResponseType(operation)

        operations.push({
          operationId: operation.operationId,
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

  private extractPathParams(path: string): PathParam[] {
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

  private getRequestType(operation: any): string | undefined {
    const requestBody =
      operation.requestBody?.content?.["application/json"]?.schema
    if (!requestBody) return undefined

    if (requestBody.$ref) {
      return this.extractRefName(requestBody.$ref)
    }

    // Generate inline type if needed
    const typeName = `${this.capitalize(operation.operationId)}Request`
    return typeName
  }

  private getResponseType(operation: any): string | undefined {
    const response200 =
      operation.responses?.["200"]?.content?.["application/json"]?.schema
    if (!response200) return undefined

    if (response200.$ref) {
      return this.extractRefName(response200.$ref)
    }

    // Generate inline type if needed
    const typeName = `${this.capitalize(operation.operationId)}Response`
    return typeName
  }

  private generateZodSchema(name: string, schema: any): string {
    if (this.generatedTypes.has(name)) return ""
    this.generatedTypes.add(name)

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
        const zodType = this.getZodTypeFromSchema(propSchema as any)
        const finalType = isRequired ? zodType : `${zodType}.optional()`
        properties.push(`  ${propName}: ${finalType},`)
      }

      return `export const ${name} = z.object({\n${properties.join("\n")}\n});`
    }

    if (schema.type === "array") {
      const itemType = this.getZodTypeFromSchema(schema.items)
      return `export const ${name} = z.array(${itemType});`
    }

    return `export const ${name} = ${this.getZodTypeFromSchema(schema)};`
  }

  private getZodTypeFromSchema(schema: any): string {
    if (schema.$ref) {
      return this.extractRefName(schema.$ref)
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
        return `z.array(${this.getZodTypeFromSchema(schema.items)})`
      case "object":
        if (schema.properties) {
          const props = Object.entries(schema.properties)
            .map(([key, prop]) => {
              const isRequired = schema.required?.includes(key) ?? false
              const zodType = this.getZodTypeFromSchema(prop)
              const finalType = isRequired ? zodType : `${zodType}.optional()`
              return `${key}: ${finalType}`
            })
            .join(", ")
          return `z.object({ ${props} })`
        }
        return "z.record(z.any())"
      default:
        return "z.unknown()"
    }
  }

  private topologicalSort(schemas: Record<string, any>): string[] {
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const result: string[] = []

    const visit = (name: string): void => {
      if (visited.has(name)) return
      if (visiting.has(name)) {
        // Circular dependency detected, just add it anyway
        return
      }

      visiting.add(name)

      // Find dependencies of this schema
      const schema = schemas[name]
      const dependencies = this.extractDependencies(schema)

      // Visit dependencies first
      for (const dep of dependencies) {
        if (schemas[dep]) {
          visit(dep)
        }
      }

      visiting.delete(name)
      visited.add(name)
      result.push(name)
    }

    // Visit all schemas
    for (const name of Object.keys(schemas)) {
      visit(name)
    }

    return result
  }

  private extractDependencies(schema: any): string[] {
    const dependencies: string[] = []

    const traverse = (obj: any): void => {
      if (typeof obj !== "object" || obj === null) return

      if (obj.$ref && typeof obj.$ref === "string") {
        const refName = this.extractRefName(obj.$ref)
        dependencies.push(refName)
        return
      }

      if (Array.isArray(obj)) {
        obj.forEach(traverse)
      } else {
        Object.values(obj).forEach(traverse)
      }
    }

    traverse(schema)
    return [...new Set(dependencies)] // Remove duplicates
  }

  private extractRefName(ref: string): string {
    return ref.split("/").pop() || "Unknown"
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error("Usage: tsx generator.ts <input-file> <output-file>")
    console.error("  input-file: OpenAPI spec file (.json or .yaml)")
    console.error("  output-file: Generated TypeScript file")
    process.exit(1)
  }

  const inputFile = args[0]!
  const outputFile = args[1]!

  try {
    // Read and parse the OpenAPI spec
    const fileContent = fs.readFileSync(inputFile, "utf8")
    let spec: OpenAPISpec

    if (inputFile.endsWith(".yaml") || inputFile.endsWith(".yml")) {
      spec = yaml.load(fileContent) as OpenAPISpec
    } else {
      spec = JSON.parse(fileContent)
    }

    // Generate TypeScript
    const generator = new OpenAPIGenerator(spec)
    const output = generator.generate()

    // Write output
    fs.writeFileSync(outputFile, output)

    console.log(`✅ Generated TypeScript types in ${outputFile}`)
    console.log(`📄 Processed ${Object.keys(spec.paths).length} paths`)
  } catch (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
