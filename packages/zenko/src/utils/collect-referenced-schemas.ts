import { extractRefName, extractDependencies } from "./topological-sort"
import type { Operation } from "../types/operation"
import type { OpenAPISpec } from "../zenko"

/**
 * Finds the most appropriate content type from available options.
 * Prefers JSON first, then uses content-type mapping, otherwise takes first available.
 */
function findContentType(content: Record<string, any>): string {
  const contentTypes = Object.keys(content)

  // Prefer JSON
  if (contentTypes.includes("application/json")) {
    return "application/json"
  }

  // Use first content type that has a mapping
  const CONTENT_TYPE_MAP: Record<string, string> = {
    "application/json": "unknown",
    "text/csv": "string",
    "text/plain": "string",
    "application/octet-stream": "unknown",
    "application/pdf": "unknown",
  }

  for (const contentType of contentTypes) {
    if (contentType in CONTENT_TYPE_MAP) {
      return contentType
    }
  }

  // Default to first available
  return contentTypes[0] || ""
}

/**
 * Resolves a parameter reference to its actual definition.
 */
function resolveParameter(parameter: any, spec: OpenAPISpec) {
  if (!parameter) return undefined

  if (parameter.$ref) {
    const refName = extractRefName(parameter.$ref)
    const resolved = spec.components?.parameters?.[refName]
    if (!resolved) return undefined
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $ref, ...overrides } = parameter
    return {
      ...resolved,
      ...overrides,
    }
  }

  return parameter
}

/**
 * Collects all component schema names referenced by the given operations.
 * Traverses request/response types, parameters, headers, and errors, following $ref chains.
 *
 * @param operations - Processed operations to analyze
 * @param spec - The OpenAPI specification
 * @param nameMap - Mapping from original schema names to sanitized names
 * @returns Set of original schema names that are referenced
 */
export function collectReferencedSchemas(
  operations: Operation[],
  spec: OpenAPISpec,
  nameMap: Map<string, string>
): Set<string> {
  const referenced = new Set<string>()

  // Helper to extract schema name from a type reference string
  const extractSchemaName = (typeRef: string | undefined): string | null => {
    if (!typeRef) return null
    // Remove typeof wrapper if present
    const cleaned = typeRef.replace(/^typeof\s+/, "").trim()
    // Check if it's a direct schema reference (not a primitive or z.array)
    if (
      cleaned === "undefined" ||
      cleaned === "string" ||
      cleaned === "number" ||
      cleaned === "boolean" ||
      cleaned.startsWith("z.array") ||
      cleaned.startsWith("z.ZodArray")
    ) {
      return null
    }
    // Find the original name from nameMap (reverse lookup)
    for (const [original, sanitized] of nameMap.entries()) {
      if (sanitized === cleaned) {
        return original
      }
    }
    // If not found in nameMap, might be the original name itself
    if (nameMap.has(cleaned)) {
      return cleaned
    }
    return null
  }

  // Build operation lookup from raw spec
  const operationLookup = new Map<string, any>()
  for (const [, pathItem] of Object.entries(spec.paths || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as any
      if (op.operationId) {
        operationLookup.set(op.operationId, op)
      }
    }
  }
  for (const [, pathItem] of Object.entries(spec.webhooks || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as any
      if (op.operationId) {
        operationLookup.set(op.operationId, op)
      }
    }
  }

  // Collect from operations and raw spec
  for (const op of operations) {
    const rawOperation = operationLookup.get(op.operationId)
    if (!rawOperation) continue

    // Request body schema
    const requestBody =
      rawOperation.requestBody?.content?.["application/json"]?.schema
    if (requestBody?.$ref) {
      const refName = extractRefName(requestBody.$ref)
      referenced.add(refName)
    } else if (requestBody) {
      // Inline schema - extract dependencies
      const deps = extractDependencies(requestBody)
      for (const dep of deps) {
        if (spec.components?.schemas?.[dep]) {
          referenced.add(dep)
        }
      }
    }

    // Response schemas
    const responses = rawOperation.responses || {}
    for (const [, response] of Object.entries(responses)) {
      const content = (response as any)?.content
      if (!content) continue

      const contentType = findContentType(content)
      const responseSchema = content[contentType]?.schema
      if (responseSchema?.$ref) {
        const refName = extractRefName(responseSchema.$ref)
        referenced.add(refName)
      } else if (responseSchema) {
        // Inline schema - extract dependencies
        const deps = extractDependencies(responseSchema)
        for (const dep of deps) {
          if (spec.components?.schemas?.[dep]) {
            referenced.add(dep)
          }
        }
      }
    }

    // Query params (from processed operation)
    for (const param of op.queryParams) {
      if (param.schema?.$ref) {
        const refName = extractRefName(param.schema.$ref)
        referenced.add(refName)
      }
      // Also check array items
      if (param.schema?.items?.$ref) {
        const refName = extractRefName(param.schema.items.$ref)
        referenced.add(refName)
      }
    }

    // Request headers (from processed operation)
    for (const header of op.requestHeaders || []) {
      if (header.schema?.$ref) {
        const refName = extractRefName(header.schema.$ref)
        referenced.add(refName)
      }
      if (header.schema?.items?.$ref) {
        const refName = extractRefName(header.schema.items.$ref)
        referenced.add(refName)
      }
    }

    // Parameters from raw operation (path/query/header)
    const parameters = rawOperation.parameters || []
    for (const param of parameters) {
      const resolvedParam = resolveParameter(param, spec)
      if (resolvedParam?.schema?.$ref) {
        const refName = extractRefName(resolvedParam.schema.$ref)
        referenced.add(refName)
      }
      if (resolvedParam?.schema?.items?.$ref) {
        const refName = extractRefName(resolvedParam.schema.items.$ref)
        referenced.add(refName)
      }
    }
  }

  // Build closure: follow $ref chains in components/schemas
  const visited = new Set<string>()
  const toVisit = Array.from(referenced)

  while (toVisit.length > 0) {
    const schemaName = toVisit.pop()!
    if (visited.has(schemaName)) continue
    visited.add(schemaName)

    const schema = spec.components?.schemas?.[schemaName]
    if (!schema) continue

    // Extract dependencies from this schema
    const dependencies = extractDependencies(schema)
    for (const dep of dependencies) {
      if (spec.components?.schemas?.[dep] && !visited.has(dep)) {
        referenced.add(dep)
        toVisit.push(dep)
      }
    }
  }

  return referenced
}
