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

export type Operation = {
  operationId: string
  path: string
  method: RequestMethod
  pathParams: PathParam[]
  queryParams: QueryParam[]
  requestType?: string
  responseType?: string
  requestHeaders?: RequestHeader[]
  errors?: OperationErrorGroup
  security?: SecurityRequirement[]
}
