import { toCamelCase, capitalize } from "./string-utils"
import type { Operation } from "../types/operation"

/**
 * Minimal OpenAPI types for the properties we access
 */
type OpenAPIOperation = {
  operationId?: string
  requestBody?: {
    content?: Record<string, { schema?: OpenAPISchema }>
  }
  responses?: Record<
    string,
    { content?: Record<string, { schema?: OpenAPISchema }> }
  >
}

type OpenAPISchema = {
  $ref?: string
  allOf?: OpenAPISchema[]
  oneOf?: OpenAPISchema[]
  anyOf?: OpenAPISchema[]
  [key: string]: any // Allow arbitrary properties
}

type OpenAPIPathItem = {
  [method: string]: OpenAPIOperation | unknown
}

type OpenAPISpec = {
  paths?: Record<string, OpenAPIPathItem | Record<string, unknown>>
  webhooks?: Record<string, OpenAPIPathItem | Record<string, unknown>>
}

/**
 * Collects all inline request types that need to be generated.
 *
 * @param operations - Processed operations with metadata
 * @param spec - Raw OpenAPI specification
 * @returns Map of type names to their schemas
 */
export function collectInlineRequestTypes(
  operations: Operation[],
  spec: OpenAPISpec
): Map<string, any> {
  const requestTypesToGenerate = new Map<string, any>()

  // Build a lookup map of operationId -> operation for O(1) access
  const operationLookup = new Map<string, OpenAPIOperation>()

  // Process paths
  for (const [, pathItem] of Object.entries(spec.paths || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as OpenAPIOperation
      if (op.operationId) {
        operationLookup.set(op.operationId, op)
      }
    }
  }

  // Process webhooks
  for (const [, pathItem] of Object.entries(spec.webhooks || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as OpenAPIOperation
      if (op.operationId) {
        operationLookup.set(op.operationId, op)
      }
    }
  }

  for (const op of operations) {
    const operation = operationLookup.get(op.operationId)
    if (!operation) continue

    const requestBody = operation.requestBody
    if (requestBody && requestBody.content) {
      const content = requestBody.content
      const jsonContent = content["application/json"]

      if (jsonContent && jsonContent.schema) {
        const schema = jsonContent.schema
        const typeName = `${capitalize(toCamelCase(op.operationId))}Request`

        // Generate if it's not a simple $ref (those are already handled)
        // This includes allOf, oneOf, anyOf, and complex inline schemas
        if (!schema.$ref || schema.allOf || schema.oneOf || schema.anyOf) {
          requestTypesToGenerate.set(typeName, schema)
        }
      }
    }
  }

  return requestTypesToGenerate
}

/**
 * Collects all inline response types that need to be generated.
 *
 * @param operations - Processed operations with metadata
 * @param spec - Raw OpenAPI specification
 * @returns Map of type names to their schemas
 */
export function collectInlineResponseTypes(
  operations: Operation[],
  spec: OpenAPISpec
): Map<string, any> {
  const responseTypesToGenerate = new Map<string, any>()

  // Build a lookup map of operationId -> operation for O(1) access
  const operationLookup = new Map<string, OpenAPIOperation>()

  // Process paths
  for (const [, pathItem] of Object.entries(spec.paths || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as OpenAPIOperation
      if (op.operationId) {
        operationLookup.set(op.operationId, op)
      }
    }
  }

  // Process webhooks
  for (const [, pathItem] of Object.entries(spec.webhooks || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as OpenAPIOperation
      if (op.operationId) {
        operationLookup.set(op.operationId, op)
      }
    }
  }

  for (const op of operations) {
    const operation = operationLookup.get(op.operationId)
    if (!operation) continue

    const responses = operation.responses || {}
    for (const [statusCode, response] of Object.entries(responses)) {
      if (/^2\d\d$/.test(statusCode) && (response as any).content) {
        const content = (response as any).content
        const jsonContent = content["application/json"]

        if (jsonContent && jsonContent.schema) {
          const schema = jsonContent.schema
          const typeName = `${capitalize(toCamelCase(op.operationId))}Response`

          // Generate if it's not a simple $ref (those are already handled)
          // This includes allOf, oneOf, anyOf, and complex inline schemas
          if (!schema.$ref || schema.allOf || schema.oneOf || schema.anyOf) {
            responseTypesToGenerate.set(typeName, schema)
          }
        }
      }
    }
  }

  return responseTypesToGenerate
}
