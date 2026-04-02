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

/** Path template segments: `/{a}/{b}` → `[":a", ":b"]` */
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

/**
 * Merges operations into a single route tree. Same path prefix shares one object (e.g. `board` has `get` and `:row`).
 */
export function buildTreatyRouteTree(
  metadata: Record<string, OperationMeta>
): TreatyRouteTree {
  const root: TreatyRouteTree = {}

  for (const [operationExport, meta] of Object.entries(metadata)) {
    const segments = pathTemplateToSegments(meta.path)
    const method = meta.method.toLowerCase()
    if (!HTTP_METHODS.has(method)) {
      throw new Error(
        `Unsupported method ${meta.method} for ${operationExport}`
      )
    }
    insertOperation(root, segments, method, operationExport)
  }

  return root
}

function insertOperation(
  tree: TreatyRouteTree,
  segments: string[],
  method: string,
  operationExport: string
): void {
  if (segments.length === 0) {
    throw new Error(`Empty path for ${operationExport}`)
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
        throw new Error(
          `Duplicate ${method} on ${segment} for ${operationExport} vs ${JSON.stringify(bucket[method])}`
        )
      }
      bucket[method] = operationExport
      cursor[segment] = bucket
    } else {
      const next = cursor[segment]
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
