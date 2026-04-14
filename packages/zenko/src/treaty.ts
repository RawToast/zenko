import type { ZodType } from "zod"

import type {
  AnyOperationDefinition,
  TreatyOperationsClient,
  TreatyOperationMeta,
  TreatyRequest,
  TreatyRouteTreeClient,
  TreatyRoutesConstraint,
} from "./treaty-infer"
import type { TreatyResult } from "./treaty-types"
import { type RouteNode as RouteNodeExport, unwrap } from "./treaty-types"

export type {
  RouteNode,
  TreatyErrorResult,
  TreatyResult,
  TreatySuccess,
  TreatyUnexpectedError,
  TreatyUnexpectedSubtype,
} from "./treaty-types"
export { unwrap }
export const orThrow = unwrap
export type {
  LeafCall,
  TreatyOperationsClient,
  TreatyOperationMeta,
  TreatyRequest,
  TreatyClient,
  TreatyRouteTreeClient,
  TreatyRoutesConstraint,
  TreatyResultFor,
} from "./treaty-infer"

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

type AnyOp = AnyOperationDefinition

export type TreatyClientOptions = {
  fetch?: typeof fetch
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  return `${base}${p}`
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

async function readRawBody(response: Response): Promise<string> {
  try {
    return await response.clone().text()
  } catch {
    return ""
  }
}

function mergePathInput(
  req: TreatyRequest<Record<string, unknown>, unknown> | undefined
): Record<string, unknown> {
  const params = req?.params ?? {}
  const query = req?.query ?? {}
  return { ...params, ...query }
}

function resolveErrorKey(
  meta: TreatyOperationMeta,
  status: number
): string | undefined {
  const keys = meta.errorStatusKeys
  if (!keys) return undefined
  const code = String(status)
  if (keys[code]) return keys[code]
  if (keys.default !== undefined) return keys.default
  return undefined
}

function pickSpecStatus(
  meta: TreatyOperationMeta,
  status: number
): number | "default" | "unlisted" {
  const er = meta.errorResponses
  if (!er) return "unlisted"
  const code = String(status)
  if (code in er) return status
  if ("default" in er) return "default"
  return "unlisted"
}

async function executeOperation(options: {
  baseUrl: string
  op: AnyOp
  meta: TreatyOperationMeta
  req?: TreatyRequest<Record<string, unknown>, unknown>
  fetchImpl: typeof fetch
}): Promise<TreatyResult> {
  const { baseUrl, op, meta, req, fetchImpl } = options

  const method = meta.method.toLowerCase()
  if (!HTTP_METHODS.has(method)) {
    return {
      kind: "unexpectedError",
      subtype: "other",
      error: new Error(`Unsupported method ${method}`),
    }
  }

  const upper = method.toUpperCase()
  const isGetOrHead = method === "get" || method === "head"

  let pathStr: string
  try {
    const pathFn =
      typeof op.path === "function" ? op.path : () => String(op.path)
    const merged = mergePathInput(req)
    pathStr = (pathFn as (input?: Record<string, unknown>) => string)(merged)
  } catch (e) {
    return {
      kind: "unexpectedError",
      subtype: "other",
      error: e,
    }
  }

  const url = joinUrl(baseUrl, pathStr)

  const headerRecord: Record<string, string> = {
    ...(req?.headers && typeof req.headers === "object"
      ? (req.headers as Record<string, string>)
      : {}),
  }

  let requestBody: string | ArrayBuffer | Blob | FormData | undefined
  if (!isGetOrHead && req?.body !== undefined) {
    const body = req.body
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      requestBody = body
    } else if (typeof Blob !== "undefined" && body instanceof Blob) {
      requestBody = body
      if (body.type) {
        headerRecord["content-type"] = body.type
      }
    } else {
      headerRecord["content-type"] =
        headerRecord["content-type"] ?? "application/json"
      requestBody =
        typeof body === "string" || body instanceof ArrayBuffer
          ? body
          : JSON.stringify(body)
    }
  }

  const { init } = req ?? {}
  const safeInit: Omit<RequestInit, "method" | "body" | "headers"> = {
    ...init,
  }

  let response: Response
  try {
    response = await fetchImpl(url, {
      ...safeInit,
      method: upper,
      headers:
        Object.keys(headerRecord).length > 0
          ? new Headers(headerRecord)
          : undefined,
      body: isGetOrHead ? undefined : requestBody,
    })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    return { kind: "unexpectedError", subtype: "transport", error: err }
  }

  const status = response.status
  const rawBody = await readRawBody(response)

  if (response.ok) {
    return parseSuccessResponse(op, response, status, rawBody)
  }

  return parseHttpError(op, meta, response, status, rawBody)
}

function parseSuccessResponse(
  op: AnyOp,
  response: Response,
  status: number,
  rawBody: string
): TreatyResult {
  const schema = op.response as ZodType | undefined
  if (!schema) {
    return {
      kind: "success",
      status,
      data: undefined as unknown,
      response,
      headers: response.headers,
    }
  }

  const contentType = response.headers.get("content-type") ?? ""
  let parsed: unknown
  if (contentType.includes("application/json")) {
    try {
      parsed = rawBody === "" ? null : JSON.parse(rawBody)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      return {
        kind: "unexpectedError",
        subtype: "parse",
        status,
        error: err,
        rawBody,
        response,
        headers: response.headers,
      }
    }
  } else {
    parsed = rawBody === "" ? null : rawBody
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    return {
      kind: "unexpectedError",
      subtype: "parse",
      status,
      error: result.error,
      rawBody,
      response,
      headers: response.headers,
    }
  }

  return {
    kind: "success",
    status,
    data: result.data,
    response,
    headers: response.headers,
  }
}

function parseHttpError(
  op: AnyOp,
  meta: TreatyOperationMeta,
  response: Response,
  status: number,
  rawBody: string
): TreatyResult {
  const specStatus = pickSpecStatus(meta, status)
  const errKey = resolveErrorKey(meta, status)
  const errSchema = (
    errKey && op.errors && op.errors[errKey] ? op.errors[errKey] : undefined
  ) as ZodType | undefined

  const contentType = response.headers.get("content-type") ?? ""
  let parsed: unknown
  if (contentType.includes("application/json")) {
    try {
      parsed = rawBody === "" ? null : JSON.parse(rawBody)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      return {
        kind: "unexpectedError",
        subtype: "parse",
        status,
        error: err,
        rawBody,
        response,
        headers: response.headers,
      }
    }
  } else {
    parsed = rawBody === "" ? null : rawBody
  }

  if (errSchema) {
    const result = errSchema.safeParse(parsed)
    if (!result.success) {
      return {
        kind: "unexpectedError",
        subtype: "parse",
        status,
        error: result.error,
        rawBody,
        response,
        headers: response.headers,
      }
    }
    return {
      kind: "error",
      specStatus,
      status,
      error: result.data,
      response,
      headers: response.headers,
    }
  }

  return {
    kind: "error",
    specStatus,
    status,
    error: parsed,
    response,
    headers: response.headers,
  }
}

/** Route-tree proxy (secondary API). */
function isLeaf(node: unknown): node is {
  method: string
  path: string | (() => string) | ((params: Record<string, string>) => string)
} {
  if (typeof node !== "object" || node === null) return false
  const n = node as Record<string, unknown>
  return (
    typeof n.method === "string" &&
    (typeof n.path === "function" || typeof n.path === "string")
  )
}

function resolvePath(
  path: string | (() => string) | ((params: Record<string, string>) => string),
  params: Record<string, string>
): string {
  if (typeof path === "string") return path
  if (path.length === 0) {
    return (path as () => string)()
  }
  return (path as (p: Record<string, string>) => string)(params)
}

function createRouteProxy(options: {
  baseUrl: string
  node: RouteNodeExport | RouteLeafInner
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
        node: child as RouteNodeExport,
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
        node: child as RouteNodeExport,
        params: merged,
        fetchImpl,
      })
    },
  })
}

type RouteLeafInner = {
  method: string
  path: string | (() => string) | ((params: Record<string, string>) => string)
}

function createLeafCaller(options: {
  baseUrl: string
  leaf: RouteLeafInner
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
  ): Promise<TreatyResult> => {
    let pathStr: string
    try {
      pathStr = resolvePath(leaf.path, params)
    } catch (e) {
      return {
        kind: "unexpectedError",
        subtype: "other",
        error: e,
      }
    }
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

    let requestBody: string | ArrayBuffer | Blob | FormData | undefined
    if (!isGetOrHead && body !== undefined) {
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        requestBody = body
        delete headers["content-type"]
      } else if (typeof Blob !== "undefined" && body instanceof Blob) {
        requestBody = body
        if (body.type) {
          headers["content-type"] = body.type
        }
      } else {
        headers["content-type"] = headers["content-type"] ?? "application/json"
        requestBody =
          typeof body === "string" || body instanceof ArrayBuffer
            ? body
            : JSON.stringify(body)
      }
    }

    const { method: _, body: __, ...safeInit } = init ?? {}

    let response: Response
    try {
      response = await fetchImpl(url, {
        ...safeInit,
        method: upper,
        headers:
          Object.keys(headers).length > 0 ? new Headers(headers) : undefined,
        body: isGetOrHead ? undefined : requestBody,
      })
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      return { kind: "unexpectedError", subtype: "transport", error: err }
    }

    const rawBody = await readRawBody(response)
    const contentType = response.headers.get("content-type") ?? ""
    let parsed: unknown
    if (contentType.includes("application/json")) {
      try {
        parsed = rawBody === "" ? null : JSON.parse(rawBody)
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        return {
          kind: "unexpectedError",
          subtype: "parse",
          status: response.status,
          error: err,
          rawBody,
          response,
          headers: response.headers,
        }
      }
    } else {
      parsed = rawBody === "" ? null : rawBody
    }

    if (!response.ok) {
      return {
        kind: "error",
        specStatus: "unlisted",
        status: response.status,
        error: parsed,
        response,
        headers: response.headers,
      }
    }

    return {
      kind: "success",
      status: response.status,
      data: parsed,
      response,
      headers: response.headers,
    }
  }
}

function createRouteTreeClient<const R extends TreatyRoutesConstraint>(config: {
  baseUrl: string
  routes: R
  fetch?: typeof fetch
}): TreatyRouteTreeClient<R> {
  const fetchImpl = config.fetch ?? globalThis.fetch
  return createRouteProxy({
    baseUrl: config.baseUrl,
    node: config.routes as RouteNodeExport,
    params: {},
    fetchImpl,
  }) as TreatyRouteTreeClient<R>
}

export function createTreatyClient<
  const T extends Record<string, AnyOp>,
  const TMeta extends Record<keyof T & string, TreatyOperationMeta>,
>(config: {
  baseUrl: string
  operations: T
  operationMetadata: TMeta
  options?: TreatyClientOptions
}): TreatyOperationsClient<T, TMeta>

export function createTreatyClient<
  const R extends TreatyRoutesConstraint,
>(config: {
  baseUrl: string
  routes: R
  fetch?: typeof fetch
}): TreatyRouteTreeClient<R>

export function createTreatyClient(
  config:
    | {
        baseUrl: string
        operations: Record<string, AnyOp>
        operationMetadata: Record<string, TreatyOperationMeta>
        options?: TreatyClientOptions
      }
    | {
        baseUrl: string
        routes: TreatyRoutesConstraint
        fetch?: typeof fetch
      }
): any {
  if ("operations" in config) {
    return createTreatyOperationClient(
      config as {
        baseUrl: string
        operations: Record<string, AnyOp>
        operationMetadata: Record<string, TreatyOperationMeta>
        options?: TreatyClientOptions
      }
    )
  }
  return createRouteTreeClient(
    config as {
      baseUrl: string
      routes: TreatyRoutesConstraint
      fetch?: typeof fetch
    }
  )
}

function createTreatyOperationClient<
  const T extends Record<string, AnyOp>,
  const TMeta extends Record<keyof T & string, TreatyOperationMeta>,
>(config: {
  baseUrl: string
  operations: T
  operationMetadata: TMeta
  options?: TreatyClientOptions
}): TreatyOperationsClient<T, TMeta> {
  const fetchImpl = config.options?.fetch ?? globalThis.fetch
  const out = {} as Record<string, unknown>

  for (const key of Object.keys(config.operations)) {
    const op = config.operations[key]!
    const meta = config.operationMetadata[key]
    if (!meta) {
      throw new Error(`Missing operationMetadata for "${key}"`)
    }

    out[key] = (req?: TreatyRequest<Record<string, unknown>, unknown>) =>
      executeOperation({
        baseUrl: config.baseUrl,
        op,
        meta,
        req,
        fetchImpl,
      })
  }

  return out as TreatyOperationsClient<T, TMeta>
}
