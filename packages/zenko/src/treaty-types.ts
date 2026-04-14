/** Nested route tree: segments, `:param` keys, and HTTP method leaves (see route proxy in treaty runtime). */
export type RouteNode = Record<string, unknown>

export type TreatySuccess<TStatus extends number, TData> = {
  kind: "success"
  status: TStatus
  data: TData
  response: Response
  headers: Headers
}

/** Non-OK HTTP response (OpenAPI-mapped or raw error body). */
export type TreatyErrorResult<TSpecStatus extends string | number, TError> = {
  kind: "error"
  specStatus: TSpecStatus
  status: number
  error: TError
  response: Response
  headers: Headers
}

export type TreatyUnexpectedSubtype = "transport" | "parse" | "other"

/** Network failure, body validation/decoding failure, or other unexpected outcomes. */
export type TreatyUnexpectedError =
  | {
      kind: "unexpectedError"
      subtype: "transport"
      error: Error
    }
  | {
      kind: "unexpectedError"
      subtype: "parse"
      status: number
      /** JSON `SyntaxError`, `ZodError`, or other failure while decoding the body. */
      error: Error
      rawBody: string
      response: Response
      headers: Headers
    }
  | {
      kind: "unexpectedError"
      subtype: "other"
      error: unknown
    }

/** Discriminated union returned by treaty clients (`kind` narrows outcomes). */
export type TreatyResult<TData = unknown> =
  | TreatySuccess<number, TData>
  | TreatyErrorResult<string | number, unknown>
  | TreatyUnexpectedError

/** @alias {@link TreatyResult} */
export type TreatyAnyResult<TData = unknown> = TreatyResult<TData>

function unwrapErrorDetail(value: unknown): string {
  if (value === undefined || value === null) return "unknown"
  if (value instanceof Error) return `${value.name}: ${value.message}`
  switch (typeof value) {
    case "string":
      return value
    case "number":
    case "boolean":
      return String(value)
    case "bigint":
      return `${value}n`
    case "symbol":
      return value.toString()
    case "function":
      return `[function ${value.name || "anonymous"}]`
    case "object":
      try {
        return JSON.stringify(value)
      } catch {
        return "[object]"
      }
    default:
      return "unknown"
  }
}

export function unwrap<T>(result: TreatyResult<T>): T {
  if (result.kind === "success") return result.data

  if (result.kind === "error") {
    throw new Error(
      `Treaty unwrap failed: kind=error; status=${result.status}; specStatus=${String(result.specStatus)}`
    )
  }
  }

  if (result.subtype === "transport") {
    throw new Error(
      `Treaty unwrap failed: kind=unexpectedError; subtype=transport; error=${unwrapErrorDetail(result.error)}`
    )
  }
  if (result.subtype === "parse") {
    throw new Error(
      `Treaty unwrap failed: kind=unexpectedError; subtype=parse; status=${result.status}; error=${unwrapErrorDetail(result.error)}`
    )
  }
  throw new Error(
    `Treaty unwrap failed: kind=unexpectedError; subtype=other; error=${unwrapErrorDetail(result.error)}`
  )
}
