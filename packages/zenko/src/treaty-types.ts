/** Nested route tree: segments, `:param` keys, and HTTP method leaves (see `isLeaf` in treaty runtime). */
export type RouteNode = Record<string, unknown>

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
