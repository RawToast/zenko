import { topologicalSort, extractRefName } from "./utils/topological-sort"
import { formatPropertyName, isValidJSIdentifier } from "./utils/property-name"
import {
  getStatusCategory,
  isErrorStatus,
  mapStatusToIdentifier,
} from "./utils/http-status"
import type { RequestMethod } from "./types"

export type OpenAPISpec = {
  openapi: string
  info: unknown
  paths: Record<string, Record<string, unknown>>
  components?: {
    schemas?: Record<string, unknown>
    parameters?: Record<string, unknown>
  }
}

export type TypesHelperMode = "package" | "inline" | "file"

export type TypesConfig = {
  emit?: boolean
  helpers?: TypesHelperMode
  helpersOutput?: string
}

export type GenerateOptions = {
  strictDates?: boolean
  strictNumeric?: boolean
  types?: TypesConfig
}

type PathParam = {
  name: string
  type: string
}

type QueryParam = {
  name: string
  description?: string
  schema?: any
  required?: boolean
}

type Operation = {
  operationId: string
  path: string
  method: RequestMethod
  pathParams: PathParam[]
  queryParams: QueryParam[]
  requestType?: string
  responseType?: string
  requestHeaders?: RequestHeader[]
  errors?: OperationErrorGroup
}
type OperationErrorGroup = {
  clientErrors?: OperationErrorMap
  serverErrors?: OperationErrorMap
  defaultErrors?: OperationErrorMap
  otherErrors?: OperationErrorMap
}
type OperationErrorMap = Record<string, string>

type RequestHeader = {
  name: string
  description?: string
  schema?: any
  required?: boolean
}

/**
 * Generate TypeScript source that contains Zod schemas, path/header helpers, and operation objects/types from an OpenAPI spec.
 *
 * @param spec - The OpenAPI specification to generate code from.
 * @param options - Generation options (e.g., strictDates, strictNumeric, types) that adjust emitted schemas and helper types.
 * @returns The complete generated TypeScript source as a single string.
 */
export function generate(
  spec: OpenAPISpec,
  options: GenerateOptions = {}
): string {
  const output: string[] = []
  const generatedTypes = new Set<string>()
  const { strictDates = false, strictNumeric = false } = options
  const typesConfig = normalizeTypesConfig(options.types)
  const schemaOptions: SchemaOptions = {
    strictDates,
    strictNumeric,
  }

  output.push('import { z } from "zod";')
  appendHelperTypesImport(output, typesConfig)
  output.push("")

  // Generate Zod schemas from components/schemas
  if (spec.components?.schemas) {
    output.push("// Generated Zod Schemas")
    output.push("")

    // Sort schemas by dependencies (topological sort)
    const sortedSchemas = topologicalSort(spec.components.schemas)

    for (const name of sortedSchemas) {
      const schema = spec.components.schemas[name]
      output.push(
        generateZodSchema(name, schema, generatedTypes, schemaOptions)
      )
      output.push("")
      // Export inferred type
      output.push(`export type ${name} = z.infer<typeof ${name}>;`)
      output.push("")
    }
  }

  // Parse all operations
  const operations = parseOperations(spec)

  // Generate path functions
  output.push("// Path Functions")
  output.push("export const paths = {")

  for (const op of operations) {
    const pathParamNames = op.pathParams.map((p) => p.name)
    const hasPathParams = pathParamNames.length > 0
    const hasQueryParams = op.queryParams.length > 0

    if (!hasPathParams && !hasQueryParams) {
      output.push(`  ${op.operationId}: () => "${op.path}",`)
      continue
    }

    const allParamNames = [
      ...pathParamNames,
      ...op.queryParams.map((p) => p.name),
    ]
    const signaturePieces: string[] = []
    for (const param of op.pathParams) {
      signaturePieces.push(`${param.name}: string`)
    }
    for (const param of op.queryParams) {
      signaturePieces.push(
        `${param.name}${param.required ? "" : "?"}: ${mapQueryType(param)}`
      )
    }
    const signatureParams = signaturePieces.join(", ")
    const needsDefaultObject =
      !hasPathParams &&
      hasQueryParams &&
      op.queryParams.every((param) => !param.required)
    const signatureArgs = allParamNames.length
      ? `{ ${allParamNames.join(", ")} }`
      : "{}"
    const signature = `${signatureArgs}: { ${signatureParams} }${
      needsDefaultObject ? " = {}" : ""
    }`

    const pathWithParams = op.path.replace(/{([^}]+)}/g, "${$1}")

    if (!hasQueryParams) {
      output.push(
        `  ${op.operationId}: (${signature}) => \`${pathWithParams}\`,`
      )
      continue
    }

    output.push(`  ${op.operationId}: (${signature}) => {`)

    output.push("    const params = new URLSearchParams()")
    for (const param of op.queryParams) {
      const propertyKey = formatPropertyName(param.name)
      const accessor = isValidJSIdentifier(param.name)
        ? param.name
        : propertyKey
      const schema = param.schema ?? {}

      if (schema?.type === "array") {
        const itemValueExpression = convertQueryParamValue(
          schema.items ?? {},
          "value"
        )

        if (param.required) {
          output.push(`    for (const value of ${accessor}) {`)
          output.push(
            `      params.append("${param.name}", ${itemValueExpression})`
          )
          output.push("    }")
        } else {
          output.push(`    if (${accessor} !== undefined) {`)
          output.push(`      for (const value of ${accessor}) {`)
          output.push(
            `        params.append("${param.name}", ${itemValueExpression})`
          )
          output.push("      }")
          output.push("    }")
        }

        continue
      }

      const valueExpression = convertQueryParamValue(schema, accessor)
      if (param.required) {
        output.push(`    params.set("${param.name}", ${valueExpression})`)
      } else {
        output.push(`    if (${accessor} !== undefined) {`)
        output.push(`      params.set("${param.name}", ${valueExpression})`)
        output.push("    }")
      }
    }

    output.push("    const _searchParams = params.toString()")
    output.push(
      `    return \`${pathWithParams}\${_searchParams ? \`?\${_searchParams}\` : ""}\``
    )
    output.push("  },")
  }

  output.push("} as const;")
  output.push("")

  // Generate header functions
  output.push("// Header Functions")
  output.push("export const headers = {")

  for (const op of operations) {
    if (!op.requestHeaders || op.requestHeaders.length === 0) {
      output.push(`  ${op.operationId}: () => ({}),`)
      continue
    }

    const typeEntries = op.requestHeaders
      .map(
        (header) =>
          `${formatPropertyName(header.name)}${header.required ? "" : "?"}: ${mapHeaderType(
            header
          )}`
      )
      .join(", ")

    const requiredHeaders = op.requestHeaders.filter(
      (header) => header.required
    )
    const optionalHeaders = op.requestHeaders.filter(
      (header) => !header.required
    )
    const hasRequired = requiredHeaders.length > 0
    const signature = hasRequired
      ? `(params: { ${typeEntries} })`
      : `(params: { ${typeEntries} } = {})`

    if (optionalHeaders.length === 0) {
      output.push(`  ${op.operationId}: ${signature} => ({`)

      for (const header of requiredHeaders) {
        const propertyKey = formatPropertyName(header.name)
        const accessor = isValidJSIdentifier(header.name)
          ? `params.${header.name}`
          : `params[${propertyKey}]`
        output.push(`    ${propertyKey}: ${accessor},`)
      }

      output.push("  }),")
      continue
    }

    if (!hasRequired && optionalHeaders.length === 1 && optionalHeaders[0]) {
      const header = optionalHeaders[0]
      const propertyKey = formatPropertyName(header.name)
      const accessor = isValidJSIdentifier(header.name)
        ? `params.${header.name}`
        : `params[${propertyKey}]`

      output.push(`  ${op.operationId}: ${signature} =>`)
      output.push(
        `    ${accessor} !== undefined ? { ${propertyKey}: ${accessor} } : {},`
      )
      continue
    }

    const valueTypes = Array.from(
      new Set(optionalHeaders.map((header) => mapHeaderType(header)))
    ).join(" | ")

    output.push(`  ${op.operationId}: ${signature} => {`)

    if (hasRequired) {
      output.push("    const headers = {")
      for (const header of requiredHeaders) {
        const propertyKey = formatPropertyName(header.name)
        const accessor = isValidJSIdentifier(header.name)
          ? `params.${header.name}`
          : `params[${propertyKey}]`
        output.push(`      ${propertyKey}: ${accessor},`)
      }
      output.push("    }")
    } else {
      output.push(`    const headers: Record<string, ${valueTypes}> = {}`)
    }

    for (const header of optionalHeaders) {
      const propertyKey = formatPropertyName(header.name)
      const accessor = isValidJSIdentifier(header.name)
        ? `params.${header.name}`
        : `params[${propertyKey}]`
      const assignment = isValidJSIdentifier(header.name)
        ? `headers.${header.name}`
        : `headers[${propertyKey}]`

      output.push(`    if (${accessor} !== undefined) {`)
      output.push(`      ${assignment} = ${accessor}`)
      output.push("    }")
    }

    output.push("    return headers")
    output.push("  },")
  }

  output.push("} as const;")
  output.push("")

  // Generate operation objects
  output.push("// Operation Objects")
  for (const op of operations) {
    output.push(`export const ${op.operationId} = {`)
    output.push(`  method: "${op.method}",`)
    output.push(`  path: paths.${op.operationId},`)

    appendOperationField(output, "request", op.requestType)
    appendOperationField(output, "response", op.responseType)

    if (op.requestHeaders && op.requestHeaders.length > 0) {
      output.push(`  headers: headers.${op.operationId},`)
    }

    if (op.errors && hasAnyErrors(op.errors)) {
      output.push("  errors: {")
      appendErrorGroup(output, "clientErrors", op.errors.clientErrors)
      appendErrorGroup(output, "serverErrors", op.errors.serverErrors)
      appendErrorGroup(output, "defaultErrors", op.errors.defaultErrors)
      appendErrorGroup(output, "otherErrors", op.errors.otherErrors)
      output.push("  },")
    }

    output.push("} as const;")
    output.push("")
  }

  generateOperationTypes(output, operations, typesConfig)

  return output.join("\n")
}

function appendOperationField(
  buffer: string[],
  key: string,
  value?: string
): void {
  if (!value) return
  buffer.push(`  ${key}: ${value},`)
}

function appendErrorGroup(
  buffer: string[],
  label: string,
  errors?: OperationErrorMap
): void {
  if (!errors || Object.keys(errors).length === 0) return
  buffer.push(`    ${label}: {`)
  for (const [name, typeName] of Object.entries(errors)) {
    buffer.push(`      ${formatPropertyName(name)}: ${typeName},`)
  }
  buffer.push("    },")
}

/**
 * Determines whether any error bucket in an operation error group contains entries.
 *
 * @param group - The operation error group to inspect (client, server, default, other buckets)
 * @returns `true` if at least one bucket has one or more entries, `false` otherwise.
 */
function hasAnyErrors(group: OperationErrorGroup): boolean {
  return [
    group.clientErrors,
    group.serverErrors,
    group.defaultErrors,
    group.otherErrors,
  ].some((bucket) => bucket && Object.keys(bucket).length > 0)
}

/**
 * Determines whether a given string is one of the supported HTTP request methods.
 *
 * @param method - The HTTP method name to check (expected in lowercase).
 * @returns `true` if `method` is one of `"get"`, `"put"`, `"post"`, `"delete"`, `"options"`, `"head"`, `"patch"`, or `"trace"`, `false` otherwise.
 */
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

/**
 * Collects operation metadata from an OpenAPI spec for operations that declare an `operationId` and use a supported HTTP method.
 *
 * @param spec - The OpenAPI specification to parse.
 * @returns An array of Operation objects describing each discovered operation (operationId, path, lowercase `method`, path and query parameters, request/response type names, request headers, and categorized errors).
 */
function parseOperations(spec: OpenAPISpec): Operation[] {
  const operations: Operation[] = []

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      const normalizedMethod = method.toLowerCase()
      if (!isRequestMethod(normalizedMethod)) continue
      if (!(operation as any).operationId) continue

      const pathParams = extractPathParams(path)
      const requestType = getRequestType(operation)
      const { successResponse, errors } = getResponseTypes(
        operation,
        (operation as any).operationId
      )
      const resolvedParameters = collectParameters(pathItem, operation, spec)
      const requestHeaders = getRequestHeaders(resolvedParameters)
      const queryParams = getQueryParams(resolvedParameters)

      operations.push({
        operationId: (operation as any).operationId,
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

  return operations
}

function normalizeTypesConfig(
  config: TypesConfig | undefined
): NormalizedTypesConfig {
  return {
    emit: config?.emit ?? true,
    helpers: config?.helpers ?? "package",
    helpersOutput: config?.helpersOutput ?? "./zenko-types",
  }
}

type NormalizedTypesConfig = {
  emit: boolean
  helpers: TypesHelperMode
  helpersOutput: string
}

/**
 * Appends helper type import or inline type declarations to the output buffer according to the types configuration.
 *
 * @param buffer - The output string buffer to which import lines or inline type declarations will be appended.
 * @param config - Normalized types configuration that controls whether to emit helpers and which helper mode to use (`package`, `file`, or `inline`). When `config.emit` is false no content is appended.
 */
function appendHelperTypesImport(
  buffer: string[],
  config: NormalizedTypesConfig
) {
  if (!config.emit) return

  switch (config.helpers) {
    case "package":
      buffer.push(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors, OperationError } from "zenko";'
      )
      return
    case "file":
      buffer.push(
        `import type { PathFn, HeaderFn, OperationDefinition, OperationErrors, OperationError } from "${config.helpersOutput}";`
      )
      return
    case "inline":
      buffer.push(
        "type PathFn<TArgs extends unknown[] = []> = (...args: TArgs) => string;"
      )
      buffer.push(
        'type RequestMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";'
      )
      buffer.push(
        "type HeaderFn<TArgs extends unknown[] = [], TResult = Record<string, unknown> | Record<string, never>> = (...args: TArgs) => TResult;"
      )
      buffer.push(
        "type OperationErrors<TClient = unknown, TServer = unknown, TDefault = unknown, TOther = unknown> = {"
      )
      buffer.push("  clientErrors?: TClient;")
      buffer.push("  serverErrors?: TServer;")
      buffer.push("  defaultErrors?: TDefault;")
      buffer.push("  otherErrors?: TOther;")
      buffer.push("};")
      buffer.push("type ValuesOf<T> = T extends object ? T[keyof T] : never;")
      buffer.push(
        "type OperationError<T> = T extends OperationErrors<infer TClient, infer TServer, infer TDefault, infer TOther> ? ValuesOf<TClient> | ValuesOf<TServer> | ValuesOf<TDefault> | ValuesOf<TOther> : T extends { clientErrors?: infer TClient; serverErrors?: infer TServer; defaultErrors?: infer TDefault; otherErrors?: infer TOther } ? ValuesOf<TClient> | ValuesOf<TServer> | ValuesOf<TDefault> | ValuesOf<TOther> : never;"
      )
      buffer.push(
        "type OperationDefinition<TMethod extends RequestMethod, TPath extends (...args: any[]) => string, TRequest = undefined, TResponse = undefined, THeaders extends HeaderFn | undefined = undefined, TErrors extends OperationErrors | undefined = undefined> = {"
      )
      buffer.push("  method: TMethod;")
      buffer.push("  path: TPath;")
      buffer.push("  request?: TRequest;")
      buffer.push("  response?: TResponse;")
      buffer.push("  headers?: THeaders;")
      buffer.push("  errors?: TErrors;")
      buffer.push("};")
      return
  }
}

/**
 * Appends TypeScript operation type definitions to the output buffer.
 *
 * For each operation, emits an `export type <OperationId>Operation = OperationDefinition<...>` declaration
 * (including the HTTP method literal, path fn, request/response types, headers type, and errors type)
 * into the provided `buffer` when `config.emit` is true.
 *
 * @param buffer - Mutable array of output lines to append the generated type declarations to
 * @param operations - Array of operations to generate operation-type exports for
 * @param config - Normalized types configuration; generation is skipped when `config.emit` is false
 */
function generateOperationTypes(
  buffer: string[],
  operations: Operation[],
  config: NormalizedTypesConfig
) {
  if (!config.emit) return

  buffer.push("// Operation Types")

  for (const op of operations) {
    const headerType = op.requestHeaders?.length
      ? `typeof headers.${op.operationId}`
      : "undefined"
    const requestType = wrapTypeReference(op.requestType)
    const responseType = wrapTypeReference(op.responseType)
    const errorsType = buildOperationErrorsType(op.errors)

    buffer.push(
      `export type ${capitalize(op.operationId)}Operation = OperationDefinition<`
    )
    buffer.push(`  "${op.method}",`)
    buffer.push(`  typeof paths.${op.operationId},`)
    buffer.push(`  ${requestType},`)
    buffer.push(`  ${responseType},`)
    buffer.push(`  ${headerType},`)
    buffer.push(`  ${errorsType}`)
    buffer.push(`>;`)
    buffer.push("")
  }
}

function buildOperationErrorsType(errors?: OperationErrorGroup): string {
  if (!errors || !hasAnyErrors(errors)) {
    return "OperationErrors"
  }

  const client = buildErrorBucket(errors.clientErrors)
  const server = buildErrorBucket(errors.serverErrors)
  const fallback = buildErrorBucket(errors.defaultErrors)
  const other = buildErrorBucket(errors.otherErrors)

  return `OperationErrors<${client}, ${server}, ${fallback}, ${other}>`
}

function buildErrorBucket(bucket?: OperationErrorMap): string {
  if (!bucket || Object.keys(bucket).length === 0) {
    return "unknown"
  }

  const entries = Object.entries(bucket)
  const accessibleEntries = entries.map(([name, type]) => {
    const propertyKey = formatPropertyName(name)
    const valueType = wrapErrorValueType(type)
    return `${propertyKey}: ${valueType}`
  })

  return `{ ${accessibleEntries.join("; ")} }`
}

const TYPE_KEYWORDS = new Set([
  "any",
  "unknown",
  "never",
  "void",
  "null",
  "undefined",
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
])

function wrapTypeReference(typeName?: string): string {
  if (!typeName) return "undefined"
  if (typeName === "undefined") return "undefined"
  if (TYPE_KEYWORDS.has(typeName)) return typeName
  if (typeName.startsWith("typeof ")) return typeName

  const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/
  if (identifierPattern.test(typeName)) {
    return `typeof ${typeName}`
  }

  return typeName
}

function wrapErrorValueType(typeName?: string): string {
  if (!typeName) return "unknown"
  if (TYPE_KEYWORDS.has(typeName)) return typeName
  if (typeName.startsWith("typeof ")) return typeName
  const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/
  if (identifierPattern.test(typeName)) {
    return `typeof ${typeName}`
  }
  return typeName
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

function resolveParameter(parameter: any, spec: OpenAPISpec) {
  if (!parameter) return undefined

  if (parameter.$ref) {
    const refName = extractRefName(parameter.$ref)
    const resolved = spec.components?.parameters?.[refName]
    if (!resolved) return undefined
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $ref, ...overrides } = parameter
    return {
      ...resolved,
      ...overrides,
    }
  }

  return parameter
}

function extractPathParams(path: string): PathParam[] {
  const params: PathParam[] = []
  const matches = path.match(/{([^}]+)}/g)

  if (matches) {
    for (const match of matches) {
      const paramName = match.slice(1, -1)
      params.push({
        name: paramName,
        type: "string", // OpenAPI path params are always strings
      })
    }
  }

  return params
}

function getRequestType(operation: any): string | undefined {
  const requestBody =
    operation.requestBody?.content?.["application/json"]?.schema
  if (!requestBody) return undefined

  if (requestBody.$ref) {
    return extractRefName(requestBody.$ref)
  }

  // Generate inline type if needed
  const typeName = `${capitalize(operation.operationId)}Request`
  return typeName
}

function getResponseTypes(
  operation: any,
  operationId: string
): { successResponse?: string; errors?: OperationErrorGroup } {
  const responses = operation.responses ?? {}
  const successCodes = new Map<string, string>()
  const errorEntries: Array<{ code: string; schema: any }> = []

  for (const [statusCode, response] of Object.entries(responses)) {
    const resolvedSchema = (response as any)?.content?.["application/json"]
      ?.schema
    if (!resolvedSchema) continue

    if (isErrorStatus(statusCode)) {
      errorEntries.push({ code: statusCode, schema: resolvedSchema })
      continue
    }

    if (/^2\d\d$/.test(statusCode) || statusCode === "default") {
      successCodes.set(statusCode, resolvedSchema)
    }
  }

  const successResponse = selectSuccessResponse(successCodes, operationId)
  const errors = buildErrorGroups(errorEntries, operationId)

  return { successResponse, errors }
}

function selectSuccessResponse(
  responses: Map<string, any>,
  operationId: string
): string | undefined {
  if (responses.size === 0) return undefined

  const preferredOrder = ["200", "201", "204"]
  for (const code of preferredOrder) {
    const schema = responses.get(code)
    if (schema) {
      return resolveResponseType(
        schema,
        `${capitalize(operationId)}Response${code}`
      )
    }
  }

  const [firstCode, firstSchema] = responses.entries().next().value ?? []
  if (!firstSchema) return undefined
  return resolveResponseType(
    firstSchema,
    `${capitalize(operationId)}Response${firstCode ?? "Default"}`
  )
}

function buildErrorGroups(
  errors: Array<{ code: string; schema: any }> = [],
  operationId: string
): OperationErrorGroup | undefined {
  if (!errors.length) return undefined

  const group: OperationErrorGroup = {}

  for (const { code, schema } of errors) {
    const category = getStatusCategory(code)
    const identifier = mapStatusToIdentifier(code)
    const typeName = resolveResponseType(
      schema,
      `${capitalize(operationId)}${capitalize(identifier)}`
    )

    switch (category) {
      case "client":
        group.clientErrors ??= {}
        group.clientErrors[identifier] = typeName
        break
      case "server":
        group.serverErrors ??= {}
        group.serverErrors[identifier] = typeName
        break
      case "default":
        group.defaultErrors ??= {}
        group.defaultErrors[identifier] = typeName
        break
      default:
        group.otherErrors ??= {}
        group.otherErrors[identifier] = typeName
        break
    }
  }

  return group
}

function resolveResponseType(schema: any, fallbackName: string): string {
  if (schema.$ref) {
    return extractRefName(schema.$ref)
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

function mapHeaderType(header: RequestHeader): string {
  const schemaType = header.schema?.type
  switch (schemaType) {
    case "integer":
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    default:
      return "string"
  }
}

function mapQueryType(param: QueryParam): string {
  return mapQuerySchemaType(param.schema)
}

function mapQuerySchemaType(schema: any): string {
  if (!schema) return "string"

  if (schema.type === "array") {
    const itemType = mapQuerySchemaType(schema.items)
    return `Array<${itemType}>`
  }

  switch (schema.type) {
    case "integer":
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    default:
      return "string"
  }
}

function convertQueryParamValue(schema: any, accessor: string): string {
  if (!schema) {
    return `String(${accessor})`
  }

  switch (schema.type) {
    case "integer":
    case "number":
      return `String(${accessor})`
    case "boolean":
      return `${accessor} ? "true" : "false"`
    default:
      return `String(${accessor})`
  }
}

type SchemaOptions = {
  strictDates: boolean
  strictNumeric: boolean
}

function generateZodSchema(
  name: string,
  schema: any,
  generatedTypes: Set<string>,
  options: SchemaOptions
): string {
  if (generatedTypes.has(name)) return ""
  generatedTypes.add(name)

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `export const ${name} = z.enum([${enumValues}]);`
  }

  if (schema.type === "object" || schema.properties) {
    return `export const ${name} = ${buildZodObject(schema, options)};`
  }

  if (schema.type === "array") {
    const itemSchema = schema.items ?? { type: "unknown" }
    const itemType = getZodTypeFromSchema(itemSchema, options)
    const builder = applyStrictArrayBounds(
      schema,
      `z.array(${itemType})`,
      itemSchema,
      options.strictNumeric
    )
    return `export const ${name} = ${builder};`
  }

  return `export const ${name} = ${getZodTypeFromSchema(schema, options)};`
}

function getZodTypeFromSchema(schema: any, options: SchemaOptions): string {
  if (schema.$ref) {
    return extractRefName(schema.$ref)
  }

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `z.enum([${enumValues}])`
  }

  if (schema.type === "object" || schema.properties) {
    return buildZodObject(schema, options)
  }

  switch (schema.type) {
    case "string":
      return buildString(schema, options)
    case "boolean":
      return "z.boolean()"
    case "array":
      return `z.array(${getZodTypeFromSchema(
        schema.items ?? { type: "unknown" },
        options
      )})`
    case "null":
      return "z.null()"
    case "number":
      return buildNumber(schema, options)
    case "integer":
      return buildInteger(schema, options)
    default:
      return "z.unknown()"
  }
}

function buildZodObject(schema: any, options: SchemaOptions): string {
  const properties: string[] = []

  for (const [propName, propSchema] of Object.entries(
    schema.properties || {}
  )) {
    const isRequired = schema.required?.includes(propName) ?? false
    const zodType = getZodTypeFromSchema(propSchema as any, options)
    const finalType = isRequired ? zodType : `${zodType}.optional()`
    properties.push(`  ${formatPropertyName(propName)}: ${finalType},`)
  }

  if (properties.length === 0) {
    return "z.object({})"
  }

  return `z.object({\n${properties.join("\n")}\n})`
}

function buildString(schema: any, options: SchemaOptions): string {
  if (options.strictDates) {
    switch (schema.format) {
      case "date-time":
        return "z.string().datetime()"
      case "date":
        return "z.string().date()"
      case "time":
        return "z.string().time()"
      case "duration":
        return "z.string().duration()"
    }
  }

  let builder = "z.string()"

  if (options.strictNumeric) {
    if (typeof schema.minLength === "number") {
      builder += `.min(${schema.minLength})`
    }

    if (typeof schema.maxLength === "number") {
      builder += `.max(${schema.maxLength})`
    }

    if (schema.pattern) {
      builder += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`
    }
  }

  switch (schema.format) {
    case "uuid":
      return `${builder}.uuid()`
    case "email":
      return `${builder}.email()`
    case "uri":
    case "url":
      return `${builder}.url()`
    case "ipv4":
      return `${builder}.ip({ version: "v4" })`
    case "ipv6":
      return `${builder}.ip({ version: "v6" })`
    default:
      return builder
  }
}

function buildNumber(schema: any, options: SchemaOptions): string {
  let builder = "z.number()"

  if (options.strictNumeric) {
    builder = applyNumericBounds(schema, builder)

    if (typeof schema.multipleOf === "number" && schema.multipleOf !== 0) {
      builder += `.refine((value) => Math.abs(value / ${schema.multipleOf} - Math.round(value / ${schema.multipleOf})) < Number.EPSILON, { message: "Must be a multiple of ${schema.multipleOf}" })`
    }
  }

  return builder
}

function buildInteger(schema: any, options: SchemaOptions): string {
  let builder = buildNumber(schema, options)
  builder += ".int()"
  return builder
}

function applyStrictArrayBounds(
  schema: any,
  builder: string,
  itemSchema: any,
  enforceBounds: boolean
): string {
  if (!enforceBounds) {
    return builder
  }

  if (typeof schema.minItems === "number") {
    builder += `.min(${schema.minItems})`
  }

  if (typeof schema.maxItems === "number") {
    builder += `.max(${schema.maxItems})`
  }

  if (schema.uniqueItems && isPrimitiveLike(itemSchema)) {
    builder +=
      '.refine((items) => new Set(items).size === items.length, { message: "Items must be unique" })'
  }

  return builder
}

function isPrimitiveLike(schema: any): boolean {
  if (schema?.$ref) return false

  const primitiveTypes = new Set(["string", "number", "integer", "boolean"])
  return primitiveTypes.has(schema?.type)
}

function applyNumericBounds(schema: any, builder: string): string {
  if (typeof schema.minimum === "number") {
    if (schema.exclusiveMinimum === true) {
      builder += `.gt(${schema.minimum})`
    } else {
      builder += `.min(${schema.minimum})`
    }
  } else if (typeof schema.exclusiveMinimum === "number") {
    builder += `.gt(${schema.exclusiveMinimum})`
  }

  if (typeof schema.maximum === "number") {
    if (schema.exclusiveMaximum === true) {
      builder += `.lt(${schema.maximum})`
    } else {
      builder += `.max(${schema.maximum})`
    }
  } else if (typeof schema.exclusiveMaximum === "number") {
    builder += `.lt(${schema.exclusiveMaximum})`
  }

  return builder
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
