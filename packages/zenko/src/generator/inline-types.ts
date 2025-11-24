import {
  collectInlineRequestTypes,
  collectInlineResponseTypes,
} from "../utils/collect-inline-types"
import { generateZodSchema } from "../core/schema-generator"
import type { SchemaOptions } from "../core/schema-generator"
import type { Operation } from "../types/operation"
import type { OpenAPISpec } from "../zenko"

export function generateRequestTypes(
  output: string[],
  operations: Operation[],
  spec: OpenAPISpec,
  nameMap: Map<string, string>,
  schemaOptions: SchemaOptions
) {
  const requestTypesToGenerate = collectInlineRequestTypes(operations, spec)

  if (requestTypesToGenerate.size > 0) {
    output.push("// Generated Request Types")
    output.push("")

    for (const [typeName, schema] of requestTypesToGenerate) {
      const generatedSchema = generateZodSchema(
        typeName,
        schema,
        new Set(),
        schemaOptions,
        nameMap
      )
      output.push(generatedSchema)
      output.push("")
      output.push(`export type ${typeName} = z.infer<typeof ${typeName}>;`)
      output.push("")
    }
  }
}

export function generateResponseTypes(
  output: string[],
  operations: Operation[],
  spec: OpenAPISpec,
  nameMap: Map<string, string>,
  schemaOptions: SchemaOptions
) {
  const responseTypesToGenerate = collectInlineResponseTypes(operations, spec)

  if (responseTypesToGenerate.size > 0) {
    output.push("// Generated Response Types")
    output.push("")

    for (const [typeName, schema] of responseTypesToGenerate) {
      const generatedSchema = generateZodSchema(
        typeName,
        schema,
        new Set(),
        schemaOptions,
        nameMap
      )
      output.push(generatedSchema)
      output.push("")
      output.push(`export type ${typeName} = z.infer<typeof ${typeName}>;`)
      output.push("")
    }
  }
}
