import type { OpenAPISpec } from "../zenko"

type OpenAPIOperation = {
  operationId?: string
  requestBody?: { content?: Record<string, { schema?: any }> }
  responses?: Record<string, { content?: Record<string, { schema?: any }> }>
  parameters?: any[]
}

export type OperationLookupSpec = {
  paths?: OpenAPISpec["paths"]
  webhooks?: OpenAPISpec["webhooks"]
}

type OperationLookup = Map<string, OpenAPIOperation>

export function buildOperationLookup(
  spec: OperationLookupSpec
): OperationLookup {
  const lookup = new Map<string, OpenAPIOperation>()

  for (const [, pathItem] of Object.entries(spec.paths || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as OpenAPIOperation
      if (op.operationId) lookup.set(op.operationId, op)
    }
  }

  for (const [, pathItem] of Object.entries(spec.webhooks || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as OpenAPIOperation
      if (op.operationId) lookup.set(op.operationId, op)
    }
  }

  return lookup
}
