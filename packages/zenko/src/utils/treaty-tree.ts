import { formatPropertyName } from "./property-name"

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "connect",
  "trace",
])

export type OperationMeta = {
  method: string
  path: string
}

/** Path template segments: `/{a}/{b}` → `[":a", ":b"]`; `"/"` → `[]` (root). */
export function pathTemplateToSegments(path: string): string[] {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith("{") && segment.endsWith("}")
        ? `:${segment.slice(1, -1)}`
        : segment
    )
}

/**
 * Nested record: static segments and `:param` keys; leaves are operation export names per HTTP method.
 */
export type TreatyRouteTree = Record<string, unknown>

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

/**
 * Merges operations into a single route tree. Same path prefix shares one object (e.g. `board` has `get` and `:row`).
 */
export function buildTreatyRouteTree(
  metadata: Record<string, OperationMeta>
): Result<TreatyRouteTree> {
  const root: TreatyRouteTree = {}

  for (const [operationExport, meta] of Object.entries(metadata)) {
    const segments = pathTemplateToSegments(meta.path)
    const method = meta.method.toLowerCase()
    if (!HTTP_METHODS.has(method)) {
      return {
        ok: false,
        error: new Error(
          `Unsupported method ${meta.method} for ${operationExport}`
        ),
      }
    }
    const insertResult = insertOperation(
      root,
      segments,
      method,
      operationExport
    )
    if (!insertResult.ok) {
      return insertResult
    }
  }

  return { ok: true, value: root }
}

export function insertOperation(
  tree: TreatyRouteTree,
  segments: string[],
  method: string,
  operationExport: string
): Result<void> {
  if (segments.length === 0) {
    const existing = tree
    const bucket: Record<string, unknown> =
      existing !== undefined &&
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {}
    if (bucket[method] !== undefined) {
      const duplicateMessage =
        `Duplicate ${method} on root ` + `for ${operationExport} vs `
      const existingOperation = JSON.stringify(bucket[method])
      return {
        ok: false,
        error: new Error(duplicateMessage + existingOperation),
      }
    }
    bucket[method] = operationExport
    for (const key of Object.keys(tree)) {
      delete (tree as Record<string, unknown>)[key]
    }
    Object.assign(tree, bucket)
    return { ok: true, value: undefined }
  }

  let cursor = tree
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!
    const isLast = i === segments.length - 1

    if (isLast) {
      const existing = cursor[segment]
      const bucket: Record<string, unknown> =
        existing !== undefined &&
        typeof existing === "object" &&
        existing !== null &&
        !Array.isArray(existing)
          ? { ...(existing as Record<string, unknown>) }
          : {}
      if (bucket[method] !== undefined) {
        const duplicateMessage =
          `Duplicate ${method} on ${segment} ` + `for ${operationExport} vs `
        const existingOperation = JSON.stringify(bucket[method])
        return {
          ok: false,
          error: new Error(duplicateMessage + existingOperation),
        }
      }
      bucket[method] = operationExport
      cursor[segment] = bucket
    } else {
      const next = cursor[segment]
      if (
        next !== undefined &&
        typeof next !== "object" &&
        next !== null &&
        !Array.isArray(next)
      ) {
        return {
          ok: false,
          error: new Error(
            `TreatyRouteTree conflict at segment ${JSON.stringify(segment)}: ` +
              `cannot add nested path for ${method} (${operationExport}); ` +
              `existing value is not an object: ${JSON.stringify(next)}`
          ),
        }
      }
      if (
        next === undefined ||
        typeof next !== "object" ||
        next === null ||
        Array.isArray(next)
      ) {
        cursor[segment] = {}
      }
      cursor = cursor[segment] as TreatyRouteTree
    }
  }

  return { ok: true, value: undefined }
}

/**
 * Emits a nested object literal for `treatyRoutes`; values are operation identifiers (no quotes).
 */
export function emitTreatyRouteTree(tree: TreatyRouteTree): string {
  return emitTree(tree, 1)
}

function emitTree(node: TreatyRouteTree, depth: number): string {
  const pad = "  ".repeat(depth)
  const lines: string[] = []
  for (const [key, val] of Object.entries(node)) {
    const prop = formatPropertyName(key)
    if (typeof val === "string") {
      lines.push(`${pad}${prop}: ${val},`)
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      lines.push(`${pad}${prop}: {`)
      lines.push(emitTree(val as TreatyRouteTree, depth + 1))
      lines.push(`${pad}},`)
    }
  }
  return lines.join("\n")
}
