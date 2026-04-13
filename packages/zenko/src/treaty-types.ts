/** Nested route tree: segments, `:param` keys, and HTTP method leaves (see route proxy in treaty runtime). */
export type RouteNode = Record<string, unknown>

export type TreatySuccess<TStatus extends number, TData> = {
  kind: "success"
  status: TStatus
  data: TData
  response: Response
  headers: Headers
}

export type TreatyHttpError<TSpecStatus extends string | number, TError> = {
  kind: "http"
  specStatus: TSpecStatus
  status: number
  error: TError
  response: Response
  headers: Headers
}

export type TreatyTransportError = {
  kind: "transport"
  error: Error
}

export type TreatyParseError = {
  kind: "parse"
  status: number
  /** JSON `SyntaxError`, `ZodError`, or other failure while decoding the body. */
  error: Error
  rawBody: string
  response: Response
  headers: Headers
}

export type TreatyUnknownError = {
  kind: "unknown"
  error: unknown
}

/** Discriminated union returned by treaty clients (`kind` narrows outcomes). */
export type TreatyResult<TData = unknown> =
  | TreatySuccess<number, TData>
  | TreatyHttpError<string | number, unknown>
  | TreatyTransportError
  | TreatyParseError
  | TreatyUnknownError

/** @alias {@link TreatyResult} */
export type TreatyAnyResult<TData = unknown> = TreatyResult<TData>

export function unwrap<T>(result: TreatyResult<T>): T {
  if (result.kind === "success") return result.data
  throw new Error(`Treaty unwrap failed: ${result.kind}`)
}
