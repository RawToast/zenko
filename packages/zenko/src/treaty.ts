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

export type TreatySuccess<T> = {
  data: T
  error: null
  response: Response
  status: number
  headers: Headers
}

export type TreatyFailure = {
  data: null
  error: { status: number; body: unknown }
  response: Response
  status: number
  headers: Headers
}

export type TreatyResult<T> = TreatySuccess<T> | TreatyFailure

type RouteLeaf = {
  method: string
  path: string | (() => string) | ((params: Record<string, string>) => string)
}

/** Nested route tree: segments, `:param` keys, and HTTP method leaves (see `isLeaf`). */
export type RouteNode = Record<string, unknown>

function isLeaf(node: unknown): node is RouteLeaf {
  if (typeof node !== "object" || node === null) return false
  const n = node as Record<string, unknown>
  return (
    typeof n.method === "string" &&
    (typeof n.path === "function" || typeof n.path === "string")
  )
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  return `${base}${p}`
}

function resolvePath(
  path: RouteLeaf["path"],
  params: Record<string, string>
): string {
  if (typeof path === "string") return path
  if (path.length === 0) {
    return (path as () => string)()
  }
  return (path as (p: Record<string, string>) => string)(params)
}

function serializeQueryValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value)
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value)
  }
  return ""
}

function buildQueryString(query: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    const v = serializeQueryValue(value)
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
  }
  return parts.length ? `?${parts.join("&")}` : ""
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }
  const text = await response.text()
  return text === "" ? null : text
}

function createRouteProxy(options: {
  baseUrl: string
  node: RouteNode | RouteLeaf
  params: Record<string, string>
  fetchImpl: typeof fetch
}): unknown {
  const { baseUrl, node, params, fetchImpl } = options

  return new Proxy(() => {}, {
    get(_, prop: string | symbol) {
      if (typeof prop === "symbol") return undefined
      if (prop === "then") return undefined

      const child = (node as Record<string, unknown>)[prop] as unknown
      if (child === undefined) return undefined

      if (isLeaf(child)) {
        if (!HTTP_METHODS.has(prop)) return undefined
        return createLeafCaller({
          baseUrl,
          leaf: child,
          params,
          fetchImpl,
        })
      }

      return createRouteProxy({
        baseUrl,
        node: child as RouteNode,
        params,
        fetchImpl,
      })
    },

    apply(_, __, args: unknown[]) {
      const arg = args[0] as Record<string, string> | undefined
      if (!arg || typeof arg !== "object") {
        throw new TypeError("Expected a path parameter object")
      }

      const nodeRecord = node as Record<string, unknown>
      const dynamicKey = Object.keys(nodeRecord).find((k) => k.startsWith(":"))
      if (!dynamicKey) {
        throw new TypeError("No dynamic path segment here")
      }

      const child = nodeRecord[dynamicKey]
      if (child === undefined) {
        throw new TypeError(`Missing route segment ${dynamicKey}`)
      }

      const merged = { ...params, ...arg }

      if (isLeaf(child)) {
        throw new TypeError("Unexpected leaf under dynamic segment")
      }

      return createRouteProxy({
        baseUrl,
        node: child as RouteNode,
        params: merged,
        fetchImpl,
      })
    },
  })
}

function createLeafCaller(options: {
  baseUrl: string
  leaf: RouteLeaf
  params: Record<string, string>
  fetchImpl: typeof fetch
}) {
  const { baseUrl, leaf, params, fetchImpl } = options

  const method = leaf.method.toLowerCase()
  const upper = method.toUpperCase()
  const isGetOrHead = method === "get" || method === "head"

  return async (
    body?: unknown,
    init?: RequestInit & {
      query?: Record<string, unknown>
      headers?: Record<string, string>
    }
  ): Promise<TreatyResult<unknown>> => {
    const pathStr = resolvePath(leaf.path, params)
    let url = joinUrl(baseUrl, pathStr)

    const query = isGetOrHead
      ? (body as { query?: Record<string, unknown> } | undefined)?.query
      : init?.query
    if (query && typeof query === "object") {
      url += buildQueryString(query)
    }

    const headers: Record<string, string> = {
      ...(isGetOrHead
        ? (body as { headers?: Record<string, string> } | undefined)?.headers
        : init?.headers),
    }

    let requestBody: string | ArrayBuffer | undefined
    if (!isGetOrHead && body !== undefined) {
      headers["content-type"] = headers["content-type"] ?? "application/json"
      requestBody =
        typeof body === "string" || body instanceof ArrayBuffer
          ? body
          : JSON.stringify(body)
    }

    const response = await fetchImpl(url, {
      method: upper,
      headers:
        Object.keys(headers).length > 0 ? new Headers(headers) : undefined,
      body: isGetOrHead ? undefined : requestBody,
      ...init,
    })

    const resBody = await parseResponseBody(response)
    const ok = response.ok

    if (!ok) {
      return {
        data: null,
        error: { status: response.status, body: resBody },
        response,
        status: response.status,
        headers: response.headers,
      }
    }

    return {
      data: resBody,
      error: null,
      response,
      status: response.status,
      headers: response.headers,
    }
  }
}

export function createTreatyClient(config: {
  baseUrl: string
  routes: RouteNode
  fetch?: typeof fetch
}): any {
  const fetchImpl = config.fetch ?? globalThis.fetch
  return createRouteProxy({
    baseUrl: config.baseUrl,
    node: config.routes as RouteNode,
    params: {},
    fetchImpl,
  })
}
