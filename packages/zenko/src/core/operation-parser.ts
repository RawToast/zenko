import { extractRefName } from "../utils/topological-sort"
import { toCamelCase, capitalize } from "../utils/string-utils"
import { isErrorStatus, mapStatusToIdentifier } from "../utils/http-status"
import {
  findContentType,
  resolveParameter,
  CONTENT_TYPE_MAP,
} from "../utils/schema-utils"
import type { RequestMethod } from "../types"
import type {
  Operation,
  OperationErrorGroup,
  PathParam,
  QueryParam,
  RequestHeader,
} from "../types/operation"
import type { OpenAPISpec } from "../zenko"

export function parseOperations(
  spec: OpenAPISpec,
  nameMap?: Map<string, string>
): Operation[] {
  const operations: Operation[] = []

  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        const normalizedMethod = method.toLowerCase()
        if (!isRequestMethod(normalizedMethod)) continue
        if (!(operation as { operationId?: string }).operationId) continue

        const pathParams = extractPathParams(path)
        const requestType = getRequestType(operation, nameMap)
        const { successResponse, errors } = getResponseTypes(
          operation,
          (operation as { operationId: string }).operationId,
          nameMap
        )
        const resolvedParameters = collectParameters(pathItem, operation, spec)
        const requestHeaders = getRequestHeaders(resolvedParameters)
        const queryParams = getQueryParams(resolvedParameters)

        operations.push({
          operationId: (operation as { operationId: string }).operationId,
          path,
          method: normalizedMethod,
          pathParams,
          queryParams,
          requestType,
          responseType: successResponse,
          requestHeaders,
          errors,
        })
      }
    }
  }

  if (spec.webhooks) {
    for (const [webhookName, webhookItem] of Object.entries(spec.webhooks)) {
      for (const [method, operation] of Object.entries(webhookItem)) {
        const normalizedMethod = method.toLowerCase()
        if (!isRequestMethod(normalizedMethod)) continue
        if (!(operation as { operationId?: string }).operationId) continue

        const path = webhookName
        const pathParams = extractPathParams(path)
        const requestType = getRequestType(operation, nameMap)
        const { successResponse, errors } = getResponseTypes(
          operation,
          (operation as { operationId: string }).operationId,
          nameMap
        )
        const resolvedParameters = collectParameters(
          webhookItem,
          operation,
          spec
        )
        const requestHeaders = getRequestHeaders(resolvedParameters)
        const queryParams = getQueryParams(resolvedParameters)

        operations.push({
          operationId: (operation as { operationId: string }).operationId,
          path,
          method: normalizedMethod,
          pathParams,
          queryParams,
          requestType,
          responseType: successResponse,
          requestHeaders,
          errors,
        })
      }
    }
  }

  return operations
}

function collectParameters(
  pathItem: Record<string, unknown>,
  operation: unknown,
  spec: OpenAPISpec
): any[] {
  const parametersMap = new Map<string, any>()

  const addParameters = (params: unknown) => {
    if (!Array.isArray(params)) return

    for (const param of params) {
      const resolved = resolveParameter(param, spec)
      if (!resolved) continue
      const key = `${resolved.in}:${resolved.name}`
      parametersMap.set(key, resolved)
    }
  }

  addParameters((pathItem as any).parameters)
  addParameters((operation as any).parameters)

  return Array.from(parametersMap.values())
}

function extractPathParams(path: string): PathParam[] {
  const params: PathParam[] = []
  const matches = path.match(/{([^}]+)}/g)

  if (matches) {
    for (const match of matches) {
      const paramName = match.slice(1, -1)
      params.push({
        name: paramName,
        type: "string",
      })
    }
  }

  return params
}

function getRequestType(
  operation: any,
  nameMap?: Map<string, string>
): string | undefined {
  const requestBodySchema = getRequestBodySchema(operation)
  if (!requestBodySchema) return undefined

  if (requestBodySchema.$ref) {
    const refName = extractRefName(requestBodySchema.$ref)
    return nameMap?.get(refName) || refName
  }

  const typeName = `${capitalize(toCamelCase(operation.operationId))}Request`
  return typeName
}

function getRequestBodySchema(operation: any): any | undefined {
  const content: Record<string, any> | undefined =
    operation?.requestBody?.content
  if (!content || Object.keys(content).length === 0) return undefined

  const preferredTypes = [
    "application/json",
    "multipart/form-data",
    "application/x-www-form-urlencoded",
  ]

  for (const t of preferredTypes) {
    const schema = content[t]?.schema
    if (schema) return schema
  }

  return undefined
}

function getResponseTypes(
  operation: any,
  operationId: string,
  nameMap?: Map<string, string>
): {
  successResponse?: string
  errors?: OperationErrorGroup
} {
  const responses = operation.responses ?? {}
  const successCodes = new Map<string, string>()
  const errorEntries: Array<{ code: string; schema: any }> = []

  for (const [statusCode, response] of Object.entries(responses)) {
    const content = (response as any)?.content
    if (!content || Object.keys(content).length === 0) {
      if (statusCode === "204" || /^3\d\d$/.test(statusCode)) {
        successCodes.set(statusCode, "undefined")
      } else if (isErrorStatus(statusCode)) {
        errorEntries.push({
          code: statusCode,
          schema: "undefined",
        })
      }
      continue
    }

    const contentType = findContentType(content)
    const resolvedSchema = content[contentType]?.schema

    if (!resolvedSchema) {
      const inferredType = inferResponseType(contentType, statusCode)
      if (inferredType) {
        if (isErrorStatus(statusCode)) {
          errorEntries.push({
            code: statusCode,
            schema: inferredType,
          })
        } else if (/^2\d\d$/.test(statusCode)) {
          successCodes.set(statusCode, inferredType)
        }
      }
      continue
    }

    if (isErrorStatus(statusCode)) {
      errorEntries.push({ code: statusCode, schema: resolvedSchema })
      continue
    }

    if (/^2\d\d$/.test(statusCode)) {
      successCodes.set(statusCode, resolvedSchema)
    }
  }

  const successResponse = selectSuccessResponse(
    successCodes,
    operationId,
    nameMap
  )
  const errors = buildErrorGroups(errorEntries, operationId, nameMap)

  return { successResponse, errors }
}

function selectSuccessResponse(
  responses: Map<string, any>,
  operationId: string,
  nameMap?: Map<string, string>
): string | undefined {
  if (responses.size === 0) return undefined

  const preferredOrder = ["200", "201", "204"]
  for (const code of preferredOrder) {
    const schema = responses.get(code)
    if (schema) {
      if (typeof schema === "string") {
        return schema
      }
      return resolveResponseType(
        schema,
        `${capitalize(toCamelCase(operationId))}Response`,
        nameMap
      )
    }
  }

  const [, firstSchema] = responses.entries().next().value ?? []
  if (!firstSchema) return undefined

  if (typeof firstSchema === "string") {
    return firstSchema
  }

  return resolveResponseType(
    firstSchema,
    `${capitalize(toCamelCase(operationId))}Response`,
    nameMap
  )
}

function buildErrorGroups(
  errors: Array<{ code: string; schema: any }> = [],
  operationId: string,
  nameMap?: Map<string, string>
): OperationErrorGroup | undefined {
  if (!errors.length) return undefined

  const group: OperationErrorGroup = {}

  for (const { code, schema } of errors) {
    const identifier = mapStatusToIdentifier(code)
    const typeName = resolveResponseType(
      schema,
      `${capitalize(toCamelCase(operationId))}${capitalize(identifier)}`,
      nameMap
    )

    group[identifier] = typeName
  }

  return group
}

function resolveResponseType(
  schema: any,
  fallbackName: string,
  nameMap?: Map<string, string>
): string {
  if (typeof schema === "string") {
    return schema
  }
  if (schema.$ref) {
    const refName = extractRefName(schema.$ref)
    return nameMap?.get(refName) || refName
  }
  if (schema.type === "array" && schema.items?.$ref) {
    const itemRef = extractRefName(schema.items.$ref)
    const sanitizedItemRef = nameMap?.get(itemRef) || itemRef
    return `z.array(${sanitizedItemRef})`
  }
  if (schema.allOf && Array.isArray(schema.allOf)) {
    return fallbackName
  }
  return fallbackName
}

function getRequestHeaders(parameters: any[]): RequestHeader[] {
  const headers: RequestHeader[] = []

  for (const param of parameters ?? []) {
    if ((param as any).in === "header") {
      headers.push({
        name: (param as any).name,
        description: (param as any).description,
        schema: (param as any).schema,
        required: (param as any).required,
      })
    }
  }

  return headers
}

function getQueryParams(parameters: any[]): QueryParam[] {
  const queryParams: QueryParam[] = []

  for (const param of parameters ?? []) {
    if ((param as any).in === "query") {
      queryParams.push({
        name: (param as any).name,
        description: (param as any).description,
        schema: (param as any).schema,
        required: (param as any).required,
      })
    }
  }

  return queryParams
}

function isRequestMethod(method: string): method is RequestMethod {
  switch (method) {
    case "get":
    case "put":
    case "post":
    case "delete":
    case "options":
    case "head":
    case "patch":
    case "trace":
      return true
    default:
      return false
  }
}

function inferResponseType(
  contentType: string,
  statusCode: string
): string | undefined {
  if (statusCode === "204" || /^3\d\d$/.test(statusCode)) {
    return "undefined"
  }

  if (contentType in CONTENT_TYPE_MAP) {
    return CONTENT_TYPE_MAP[contentType]
  }

  return "unknown"
}
