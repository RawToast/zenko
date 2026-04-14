import type { RequestMethod, SecurityRequirement } from "../types"

export type PathParam = {
  name: string
  type: string
}

export type QueryParam = {
  name: string
  description?: string
  schema?: any
  required?: boolean
}

export type RequestHeader = {
  name: string
  description?: string
  schema?: any
  required?: boolean
}

export type { SecurityRequirement }

export type OperationErrorMap = Record<string, string>

export type OperationErrorGroup = OperationErrorMap

/** Maps HTTP status code string to resolved response type name (Zod schema symbol). */
export type OperationResponseMap = Record<string, string>

export type Operation = {
  operationId: string
  path: string
  method: RequestMethod
  pathParams: PathParam[]
  queryParams: QueryParam[]
  requestType?: string
  responseType?: string
  /** Per-status success response types (2xx, 204, 3xx with empty body). */
  successResponses?: OperationResponseMap
  /** Per-status error response types (4xx/5xx). */
  errorResponses?: OperationResponseMap
  /**
   * Maps OpenAPI response keys (`"404"`, `"default"`, …) to identifiers used in
   * `errors` (e.g. `"notFound"`, `"defaultError"`) for treaty runtime parsing.
   */
  errorStatusKeys?: Record<string, string>
  requestHeaders?: RequestHeader[]
  errors?: OperationErrorGroup
  security?: SecurityRequirement[]
}
