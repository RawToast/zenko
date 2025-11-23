import { extractRefName } from "./topological-sort"
import type { OpenAPISpec } from "../zenko"

/**
 * Content-type priority mapping for response type inference.
 */
export const CONTENT_TYPE_MAP: Record<string, string> = {
  "application/json": "unknown", // Will use schema when available
  "text/csv": "string",
  "text/plain": "string",
  // Binary/ambiguous types default to unknown for cross-platform compatibility
  "application/octet-stream": "unknown",
  "application/pdf": "unknown",
}

/**
 * Finds the most appropriate content type from available options.
 * Prefers JSON first, then uses content-type mapping, otherwise takes first available.
 *
 * @param content - Record of content types to their schemas
 * @returns The selected content type string
 */
export function findContentType(content: Record<string, any>): string {
  const contentTypes = Object.keys(content)

  // Prefer JSON
  if (contentTypes.includes("application/json")) {
    return "application/json"
  }

  // Use first content type that has a mapping
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
 * If the parameter has a $ref, looks it up in components.parameters and merges any overrides.
 *
 * @param parameter - The parameter object (may contain $ref)
 * @param spec - The OpenAPI specification
 * @returns The resolved parameter or undefined if not found
 */
export function resolveParameter(parameter: any, spec: OpenAPISpec) {
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
