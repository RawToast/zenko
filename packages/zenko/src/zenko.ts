import { topologicalSort, extractRefName } from "./utils/topological-sort"
import { formatPropertyName, isValidJSIdentifier } from "./utils/property-name"
import { toCamelCase, capitalize } from "./utils/string-utils"
import { isErrorStatus, mapStatusToIdentifier } from "./utils/http-status"
import { analyzeZenkoUsage, generateZenkoImport } from "./utils/tree-shaking"
import {
  collectInlineRequestTypes,
  collectInlineResponseTypes,
} from "./utils/collect-inline-types"
import { collectReferencedSchemas } from "./utils/collect-referenced-schemas"
import type { RequestMethod } from "./types"
import type {
  PathParam,
  QueryParam,
  RequestHeader,
  Operation,
  OperationErrorGroup,
  OperationErrorMap,
} from "./types/operation"
import { generateHelperFile } from "./utils/generate-helper-file"

export type OpenAPISpec = {
  openapi: string
  info: unknown
  paths: Record<string, Record<string, unknown>>
  webhooks?: Record<string, Record<string, unknown>>
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
  treeShake?: boolean
  optionalType?: "optional" | "nullable" | "nullish"
}

export type GenerateOptions = {
  strictDates?: boolean
  strictNumeric?: boolean
  types?: TypesConfig
  operationIds?: string[]
}

export type GenerateResult = {
  output: string
  helperFile?: {
    path: string
    content: string
  }
}

/**
 * Generate TypeScript source with additional metadata about helper files.
 *
 * @param spec - The OpenAPI specification to generate code from.
 * @param options - Generation options (e.g., strictDates, strictNumeric, types) that adjust emitted schemas and helper types.
 * @returns Object containing the generated output and optional helper file information.
 */
export function generateWithMetadata(
  spec: OpenAPISpec,
  options: GenerateOptions = {}
): GenerateResult {
  const output: string[] = []
  const generatedTypes = new Set<string>()
  const { strictDates = false, strictNumeric = false, operationIds } = options
  const typesConfig = normalizeTypesConfig(options.types)
  const schemaOptions: SchemaOptions = {
    strictDates,
    strictNumeric,
    optionalType: typesConfig.optionalType,
  }

  output.push('import { z } from "zod";')

  // Create mapping from original names to sanitized names
  const nameMap = new Map<string, string>()
  if (spec.components?.schemas) {
    for (const name of Object.keys(spec.components.schemas)) {
      nameMap.set(name, toCamelCase(name))
    }
  }

  // Parse all operations early for tree-shaking
  let operations = parseOperations(spec, nameMap)

  // Filter operations if operationIds is provided
  if (operationIds && operationIds.length > 0) {
    const selectedIds = new Set(operationIds)
    operations = operations.filter((op) => selectedIds.has(op.operationId))
  }

  // Generate helper types import right after Zod import
  appendHelperTypesImport(output, typesConfig, operations)
  output.push("")

  // Generate Zod schemas from components/schemas
  if (spec.components?.schemas) {
    output.push("// Generated Zod Schemas")
    output.push("")

    // Determine which schemas to generate
    let schemasToGenerate: string[]
    if (operationIds && operationIds.length > 0) {
      // Only generate schemas referenced by selected operations
      const referencedSchemas = collectReferencedSchemas(operations, spec)
      schemasToGenerate = Array.from(referencedSchemas)
    } else {
      // Generate all schemas
      schemasToGenerate = Object.keys(spec.components.schemas)
    }

    // Sort schemas by dependencies (topological sort)
    const sortedSchemas = topologicalSort(spec.components.schemas).filter(
      (name) => schemasToGenerate.includes(name)
    )

    for (const name of sortedSchemas) {
      const schema = spec.components.schemas[name]
      const sanitizedName = nameMap.get(name)!
      output.push(
        generateZodSchema(
          sanitizedName,
          schema,
          generatedTypes,
          schemaOptions,
          nameMap
        )
      )
      output.push("")
      // Export inferred type
      output.push(
        `export type ${sanitizedName} = z.infer<typeof ${sanitizedName}>;`
      )
      output.push("")
    }
  }

  // Generate path functions
  output.push("// Path Functions")
  output.push("export const paths = {")

  for (const op of operations) {
    const pathParamNames = op.pathParams.map((p) => p.name)
    const hasPathParams = pathParamNames.length > 0
    const hasQueryParams = op.queryParams.length > 0
    const camelCaseOperationId = toCamelCase(op.operationId)

    if (!hasPathParams && !hasQueryParams) {
      output.push(
        `  ${formatPropertyName(camelCaseOperationId)}: () => "${op.path}",`
      )
      continue
    }

    const alias = (n: string) => {
      if (isValidJSIdentifier(n)) return n
      let aliased = toCamelCase(n)
      // If still not valid (e.g., starts with number), prefix with underscore
      if (!isValidJSIdentifier(aliased)) {
        aliased = `_${aliased}`
      }
      return aliased
    }
    const destructPieces: string[] = []
    const typePieces: string[] = []
    for (const param of op.pathParams) {
      destructPieces.push(
        isValidJSIdentifier(param.name)
          ? param.name
          : `${formatPropertyName(param.name)}: ${alias(param.name)}`
      )
      typePieces.push(`${formatPropertyName(param.name)}: string`)
    }
    for (const param of op.queryParams) {
      destructPieces.push(
        isValidJSIdentifier(param.name)
          ? param.name
          : `${formatPropertyName(param.name)}: ${alias(param.name)}`
      )
      typePieces.push(
        `${formatPropertyName(param.name)}${param.required ? "" : "?"}: ${mapQueryType(param)}`
      )
    }
    const needsDefaultObject =
      !hasPathParams &&
      hasQueryParams &&
      op.queryParams.every((param) => !param.required)
    const signatureArgs = destructPieces.length
      ? `{ ${destructPieces.join(", ")} }`
      : "{}"
    const signature = `${signatureArgs}: { ${typePieces.join(", ")} }${
      needsDefaultObject ? " = {}" : ""
    }`

    const pathWithParams = op.path.replace(
      /{([^}]+)}/g,
      (_m, n) => `\${${alias(n)}}`
    )

    if (!hasQueryParams) {
      output.push(
        `  ${formatPropertyName(camelCaseOperationId)}: (${signature}) => \`${pathWithParams}\`,`
      )
      continue
    }

    output.push(
      `  ${formatPropertyName(camelCaseOperationId)}: (${signature}) => {`
    )

    output.push("    const params = new URLSearchParams()")
    for (const param of op.queryParams) {
      const accessor = isValidJSIdentifier(param.name)
        ? param.name
        : alias(toCamelCase(param.name))
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

  // Generate header schemas
  output.push("// Header Schemas")
  output.push("export const headerSchemas = {")

  for (const op of operations) {
    const camelCaseOperationId = toCamelCase(op.operationId)
    if (!op.requestHeaders || op.requestHeaders.length === 0) {
      output.push(
        `  ${formatPropertyName(camelCaseOperationId)}: z.object({}),`
      )
      continue
    }

    const schemaFields = op.requestHeaders
      .map((header) => {
        const zodType = mapHeaderToZodType(header)
        const finalType = header.required
          ? zodType
          : applyOptionalModifier(zodType, schemaOptions.optionalType)
        return `    ${formatPropertyName(header.name)}: ${finalType},`
      })
      .join("\n")

    output.push(`  ${formatPropertyName(camelCaseOperationId)}: z.object({`)
    output.push(schemaFields)
    output.push("  }),")
  }

  output.push("} as const;")
  output.push("")

  // Generate header functions using Zod schemas
  output.push("// Header Functions")
  output.push("export const headers = {")

  for (const op of operations) {
    const camelCaseOperationId = toCamelCase(op.operationId)
    if (!op.requestHeaders || op.requestHeaders.length === 0) {
      output.push(
        `  ${formatPropertyName(camelCaseOperationId)}: () => ${
          isValidJSIdentifier(camelCaseOperationId)
            ? `headerSchemas.${camelCaseOperationId}`
            : `headerSchemas[${formatPropertyName(camelCaseOperationId)}]`
        }.parse({}),`
      )
      continue
    }

    output.push(
      `  ${formatPropertyName(camelCaseOperationId)}: (params: z.input<${
        isValidJSIdentifier(camelCaseOperationId)
          ? `typeof headerSchemas.${camelCaseOperationId}`
          : `(typeof headerSchemas)[${formatPropertyName(camelCaseOperationId)}]`
      }>) => {`
    )
    output.push(
      `    return ${
        isValidJSIdentifier(camelCaseOperationId)
          ? `headerSchemas.${camelCaseOperationId}`
          : `headerSchemas[${formatPropertyName(camelCaseOperationId)}]`
      }.parse(params)`
    )
    output.push("  },")
  }

  output.push("} as const;")
  output.push("")

  // Generate request and response types before operation types
  generateRequestTypes(output, operations, spec, nameMap, schemaOptions)
  generateResponseTypes(output, operations, spec, nameMap, schemaOptions)

  // Generate operation types first (needed for type annotations)
  generateOperationTypes(output, operations, typesConfig)

  // Generate operation objects
  output.push("// Operation Objects")
  for (const op of operations) {
    const camelCaseOperationId = toCamelCase(op.operationId)
    const typeAnnotation = typesConfig.emit
      ? `: ${capitalize(camelCaseOperationId)}Operation`
      : ""
    output.push(`export const ${camelCaseOperationId}${typeAnnotation} = {`)
    output.push(`  method: "${op.method}",`)
    output.push(`  path: paths.${camelCaseOperationId},`)

    appendOperationField(output, "request", op.requestType)
    appendOperationField(output, "response", op.responseType)

    if (op.requestHeaders && op.requestHeaders.length > 0) {
      output.push(`  headers: headers.${camelCaseOperationId},`)
    }

    if (op.errors && hasAnyErrors(op.errors)) {
      appendErrorGroup(output, "errors", op.errors)
    }

    output.push("} as const;")
    output.push("")
  }

  const result: GenerateResult = {
    output: output.join("\n"),
  }

  // If using file-based helpers, include helper file information
  if (
    typesConfig.emit &&
    typesConfig.helpers === "file" &&
    typesConfig.helpersOutput
  ) {
    result.helperFile = {
      path: typesConfig.helpersOutput,
      content: generateHelperFile(),
    }
  }

  return result
}

/**
 * Generates TypeScript type definitions for inline request schemas.
 *
 * @param output - Array to which generated TypeScript code will be appended.
 * @param operations - Processed operations with metadata.
 * @param spec - The OpenAPI specification object.
 * @param nameMap - Mapping from original schema names to sanitized names.
 * @param schemaOptions - Options for schema generation.
 */
function generateRequestTypes(
  output: string[],
  operations: Operation[],
  spec: OpenAPISpec,
  nameMap: Map<string, string>,
  schemaOptions: SchemaOptions
) {
  const requestTypesToGenerate = collectInlineRequestTypes(operations, spec)

  // Generate the request type definitions
  if (requestTypesToGenerate.size > 0) {
    output.push("// Generated Request Types")
    output.push("")

    for (const [typeName, schema] of requestTypesToGenerate) {
      const generatedSchema = generateZodSchema(
        typeName,
        schema,
        new Set(),
        schemaOptions,
        nameMap
      )
      output.push(generatedSchema)
      output.push("")
      output.push(`export type ${typeName} = z.infer<typeof ${typeName}>;`)
      output.push("")
    }
  }
}

/**
 * Generates TypeScript type definitions for inline response schemas.
 *
 * @param output - Array to which generated TypeScript code will be appended.
 * @param operations - Processed operations with metadata.
 * @param spec - The OpenAPI specification object.
 * @param nameMap - Mapping from original schema names to sanitized names.
 * @param schemaOptions - Options for schema generation.
 */
function generateResponseTypes(
  output: string[],
  operations: Operation[],
  spec: OpenAPISpec,
  nameMap: Map<string, string>,
  schemaOptions: SchemaOptions
) {
  const responseTypesToGenerate = collectInlineResponseTypes(operations, spec)

  // Generate the response type definitions
  if (responseTypesToGenerate.size > 0) {
    output.push("// Generated Response Types")
    output.push("")

    for (const [typeName, schema] of responseTypesToGenerate) {
      const generatedSchema = generateZodSchema(
        typeName,
        schema,
        new Set(),
        schemaOptions,
        nameMap
      )
      output.push(generatedSchema)
      output.push("")
      output.push(`export type ${typeName} = z.infer<typeof ${typeName}>;`)
      output.push("")
    }
  }
}

/**
 * Generates TypeScript client code from an OpenAPI specification.
 *
 * @param spec - The OpenAPI specification object.
 * @param options - Configuration options controlling code generation behavior.
 * @returns Generated TypeScript code as a string.
 */
export function generate(
  spec: OpenAPISpec,
  options: GenerateOptions = {}
): string {
  return generateWithMetadata(spec, options).output
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
  return Boolean(group && Object.keys(group).length > 0)
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
 * Content-type priority mapping for response type inference.
 */
const CONTENT_TYPE_MAP: Record<string, string> = {
  "application/json": "unknown", // Will use schema when available
  "text/csv": "string",
  "text/plain": "string",
  // Binary/ambiguous types default to unknown for cross-platform compatibility
  "application/octet-stream": "unknown",
  "application/pdf": "unknown",
}

/**
 * Finds the most appropriate content type from available options.
 * Prefers JSON first, then uses content-type mapping, otherwise takes first available.
 */
function findContentType(content: Record<string, any>): string {
  const contentTypes = Object.keys(content)

  // Prefer JSON
  if (contentTypes.includes("application/json")) {
    return "application/json"
  }

  // Use first content type that has a mapping
  for (const contentType of contentTypes) {
    if (contentType in CONTENT_TYPE_MAP) {
      return contentType
    }
  }

  // Default to first available
  return contentTypes[0] || ""
}

/**
 * Infers the TypeScript type for a response based on content type and status code.
 */
function inferResponseType(
  contentType: string,
  statusCode: string
): string | undefined {
  // Handle NoContent and redirects
  if (statusCode === "204" || /^3\d\d$/.test(statusCode)) {
    return "undefined"
  }

  // Use content-type mapping
  if (contentType in CONTENT_TYPE_MAP) {
    return CONTENT_TYPE_MAP[contentType]
  }

  // Default to unknown for unrecognized types
  return "unknown"
}

/**
 * Collects operation metadata from an OpenAPI spec for operations that declare an `operationId` and use a supported HTTP method.
 *
 * @param spec - The OpenAPI specification to parse.
 * @returns An array of Operation objects describing each discovered operation (operationId, path, lowercase `method`, path and query parameters, request/response type names, request headers, and categorized errors).
 */
function parseOperations(
  spec: OpenAPISpec,
  nameMap?: Map<string, string>
): Operation[] {
  const operations: Operation[] = []

  // Process regular paths
  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        const normalizedMethod = method.toLowerCase()
        if (!isRequestMethod(normalizedMethod)) continue
        if (!(operation as any).operationId) continue

        const pathParams = extractPathParams(path)
        const requestType = getRequestType(operation)
        const { successResponse, errors } = getResponseTypes(
          operation,
          (operation as any).operationId,
          nameMap
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
  }

  // Process webhooks
  if (spec.webhooks) {
    for (const [webhookName, webhookItem] of Object.entries(spec.webhooks)) {
      for (const [method, operation] of Object.entries(webhookItem)) {
        const normalizedMethod = method.toLowerCase()
        if (!isRequestMethod(normalizedMethod)) continue
        if (!(operation as any).operationId) continue

        // For webhooks, we use the webhook name as the path identifier
        const path = webhookName
        const pathParams = extractPathParams(path)
        const requestType = getRequestType(operation)
        const { successResponse, errors } = getResponseTypes(
          operation,
          (operation as any).operationId
        )
        const resolvedParameters = collectParameters(
          webhookItem,
          operation,
          spec
        )
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
    treeShake: config?.treeShake ?? true,
    optionalType: config?.optionalType ?? "optional",
  }
}

type NormalizedTypesConfig = {
  emit: boolean
  helpers: TypesHelperMode
  helpersOutput: string
  treeShake: boolean
  optionalType: "optional" | "nullable" | "nullish"
}

/**
 * Appends helper type import or inline type declarations to the output buffer according to the types configuration.
 *
 * @param buffer - The output string buffer to which import lines or inline type declarations will be appended.
 * @param config - Normalized types configuration that controls whether to emit helpers and which helper mode to use (`package`, `file`, or `inline`). When `config.emit` is false no content is appended.
 */
function appendHelperTypesImport(
  buffer: string[],
  config: NormalizedTypesConfig,
  operations: Operation[]
) {
  if (!config.emit) return

  switch (config.helpers) {
    case "package":
      if (config.treeShake) {
        const usage = analyzeZenkoUsage(operations)
        const importStatement = generateZenkoImport(usage, "package")
        if (importStatement) {
          buffer.push(importStatement)
        }
      } else {
        buffer.push(
          'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "zenko";'
        )
      }
      return
    case "file":
      if (config.treeShake) {
        const usage = analyzeZenkoUsage(operations)
        const importStatement = generateZenkoImport(
          usage,
          "file",
          config.helpersOutput
        )
        if (importStatement) {
          buffer.push(importStatement)
        }
      } else {
        buffer.push(
          `import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "${config.helpersOutput}";`
        )
      }
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
        "type AnyHeaderFn = HeaderFn<any, unknown> | (() => unknown);"
      )
      buffer.push(
        "type OperationErrors<TError = unknown> = TError extends Record<string, unknown> ? TError : Record<string, TError>;"
      )
      buffer.push(
        "type OperationDefinition<TMethod extends RequestMethod, TPath extends (...args: any[]) => string, TRequest = undefined, TResponse = undefined, THeaders extends AnyHeaderFn | undefined = undefined, TErrors extends OperationErrors | undefined = undefined> = {"
      )
      buffer.push("  method: TMethod")
      buffer.push("  path: TPath")
      buffer.push("  request?: TRequest")
      buffer.push("  response?: TResponse")
      buffer.push("  headers?: THeaders")
      buffer.push("  errors?: TErrors")
      buffer.push("}")
      buffer.push("")
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
    const camelCaseOperationId = toCamelCase(op.operationId)
    const headerType = op.requestHeaders?.length
      ? isValidJSIdentifier(camelCaseOperationId)
        ? `typeof headers.${camelCaseOperationId}`
        : `(typeof headers)[${formatPropertyName(camelCaseOperationId)}]`
      : "undefined"
    const requestType = wrapTypeReference(op.requestType)
    const responseType = wrapTypeReference(op.responseType)
    const errorsType = buildOperationErrorsType(op.errors)

    buffer.push(
      `export type ${capitalize(camelCaseOperationId)}Operation = OperationDefinition<`
    )
    buffer.push(`  "${op.method}",`)
    buffer.push(
      `  ${isValidJSIdentifier(camelCaseOperationId) ? `typeof paths.${camelCaseOperationId}` : `(typeof paths)[${formatPropertyName(camelCaseOperationId)}]`},`
    )
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

  const errorBucket = buildErrorBucket(errors)

  return `OperationErrors<${errorBucket}>`
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
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function wrapTypeReference(typeName?: string): string {
  if (!typeName) return "undefined"
  const normalized = typeName.trim()
  if (normalized === "undefined") return "undefined"
  if (TYPE_KEYWORDS.has(normalized)) return normalized
  if (normalized.startsWith("typeof ")) return normalized

  const arrayMatch = normalized.match(/^z\.array\((.+)\)$/)
  if (arrayMatch) {
    return `z.ZodArray<${wrapTypeReference(arrayMatch[1])}>`
  }

  if (IDENTIFIER_PATTERN.test(normalized)) {
    return `typeof ${normalized}`
  }

  return normalized
}

function wrapErrorValueType(typeName?: string): string {
  if (!typeName) return "unknown"
  const normalized = typeName.trim()
  if (TYPE_KEYWORDS.has(normalized)) return normalized
  if (normalized.startsWith("typeof ")) return normalized

  const arrayMatch = normalized.match(/^z\.array\((.+)\)$/)
  if (arrayMatch) {
    return `z.ZodArray<${wrapErrorValueType(arrayMatch[1])}>`
  }

  if (IDENTIFIER_PATTERN.test(normalized)) {
    return `typeof ${normalized}`
  }
  return normalized
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
  const typeName = `${capitalize(toCamelCase(operation.operationId))}Request`
  return typeName
}

/**
 * Resolves success and error response typings for an operation.
 *
 * @param operation - The OpenAPI operation node to inspect.
 * @param operationId - The operation identifier used for synthesized names.
 * @returns The preferred success response type and categorized error groups.
 */
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
    // Handle content types
    const content = (response as any)?.content
    if (!content || Object.keys(content).length === 0) {
      // No content - handle based on status code
      if (statusCode === "204" || /^3\d\d$/.test(statusCode)) {
        successCodes.set(statusCode, "undefined")
      } else if (isErrorStatus(statusCode)) {
        // Include error responses even without content
        errorEntries.push({
          code: statusCode,
          schema: "undefined",
        })
      }
      continue
    }

    // Find the appropriate content type
    const contentType = findContentType(content)
    const resolvedSchema = content[contentType]?.schema

    if (!resolvedSchema) {
      // No schema - infer from content type
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

/**
 * Picks the most representative success response type from available candidates.
 *
 * Prefers 200/201/204 responses, falling back to the first declared status code.
 * When a schema is provided as a literal type string the literal is returned
 * directly; otherwise a synthetic type name is generated via `resolveResponseType`.
 *
 * @param responses - Map of status codes to resolved schemas or inferred literals.
 * @param operationId - Operation identifier used to construct synthetic names.
 * @returns The chosen TypeScript type name, or `undefined` when no success response exists.
 */
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
        // Direct type (e.g., "undefined", "string", "unknown")
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

/**
 * Buckets error responses by status-class and maps them to concrete type names.
 *
 * @param errors - Collection of HTTP status codes paired with schemas or literals.
 * @param operationId - Operation identifier used when synthesizing fallback names.
 * @returns Structured error groups keyed by client/server/default/other categories.
 */
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

/**
 * Resolves the emitted TypeScript identifier for a response schema.
 *
 * @param schema - Schema object or inferred literal type returned by inference.
 * @param fallbackName - Synthetic name to use when the schema lacks a `$ref`.
 * @returns Reference name, literal type, or the provided fallback.
 */
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
  // Handle array schemas with $ref items
  if (schema.type === "array" && schema.items?.$ref) {
    const itemRef = extractRefName(schema.items.$ref)
    const sanitizedItemRef = nameMap?.get(itemRef) || itemRef
    return `z.array(${sanitizedItemRef})`
  }
  // Handle allOf schemas - create synthetic type
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

function mapHeaderToZodType(header: RequestHeader): string {
  const schema = header.schema ?? {}
  const schemaType = schema.type
  switch (schemaType) {
    case "integer":
    case "number":
      // Accept numeric header values provided as strings
      return "z.coerce.number()"
    case "boolean":
      // Accept boolean header values provided as strings
      return "z.coerce.boolean()"
    case "array": {
      const items = schema.items ?? { type: "string" }
      const itemType =
        items.type === "integer" || items.type === "number"
          ? "z.coerce.number()"
          : items.type === "boolean"
            ? "z.coerce.boolean()"
            : "z.string()"
      return `z.array(${itemType})`
    }
    default:
      return "z.string()"
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
  optionalType: "optional" | "nullable" | "nullish"
}

/**
 * Applies the appropriate optional modifier to a Zod type based on the optionalType option.
 */
function applyOptionalModifier(
  zodType: string,
  optionalType: "optional" | "nullable" | "nullish"
): string {
  switch (optionalType) {
    case "optional":
      return `${zodType}.optional()`
    case "nullable":
      return `${zodType}.nullable()`
    case "nullish":
      return `${zodType}.nullish()`
  }
}

function generateZodSchema(
  name: string,
  schema: any,
  generatedTypes: Set<string>,
  options: SchemaOptions,
  nameMap?: Map<string, string>
): string {
  if (generatedTypes.has(name)) return ""
  generatedTypes.add(name)

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `export const ${name} = z.enum([${enumValues}]);`
  }

  // Handle allOf schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const allOfParts = schema.allOf.map((part: any) =>
      getZodTypeFromSchema(part, options, nameMap)
    )
    if (allOfParts.length === 0) return `export const ${name} = z.object({});`
    if (allOfParts.length === 1)
      return `export const ${name} = ${allOfParts[0]};`
    const first = allOfParts[0]
    const rest = allOfParts
      .slice(1)
      .map((part: string) => `.and(${part})`)
      .join("")
    return `export const ${name} = ${first}${rest};`
  }

  if (schema.type === "object" || schema.properties) {
    return `export const ${name} = ${buildZodObject(schema, options, nameMap)};`
  }

  if (schema.type === "array") {
    const itemSchema = schema.items ?? { type: "unknown" }
    const itemType = getZodTypeFromSchema(itemSchema, options, nameMap)
    const builder = applyStrictArrayBounds(
      schema,
      `z.array(${itemType})`,
      itemSchema,
      options.strictNumeric
    )
    return `export const ${name} = ${builder};`
  }

  return `export const ${name} = ${getZodTypeFromSchema(schema, options, nameMap)};`
}

function getZodTypeFromSchema(
  schema: any,
  options: SchemaOptions,
  nameMap?: Map<string, string>
): string {
  if (schema.$ref) {
    const refName = extractRefName(schema.$ref)
    return nameMap?.get(refName) || refName
  }

  if (schema.enum) {
    const enumValues = schema.enum.map((v: string) => `"${v}"`).join(", ")
    return `z.enum([${enumValues}])`
  }

  // Handle allOf schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const allOfParts = schema.allOf.map((part: any) =>
      getZodTypeFromSchema(part, options, nameMap)
    )
    if (allOfParts.length === 0) return "z.object({})"
    if (allOfParts.length === 1) return allOfParts[0]
    const first = allOfParts[0]
    const rest = allOfParts
      .slice(1)
      .map((part: string) => `.and(${part})`)
      .join("")
    return `${first}${rest}`
  }

  // Check for object with properties (including those without explicit type)
  if (
    schema.type === "object" ||
    schema.properties ||
    schema.allOf ||
    schema.oneOf ||
    schema.anyOf
  ) {
    return buildZodObject(schema, options, nameMap)
  }

  switch (schema.type) {
    case "string":
      return buildString(schema, options)
    case "boolean":
      return "z.boolean()"
    case "array":
      return `z.array(${getZodTypeFromSchema(
        schema.items ?? { type: "unknown" },
        options,
        nameMap
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

function buildZodObject(
  schema: any,
  options: SchemaOptions,
  nameMap?: Map<string, string>
): string {
  const properties: string[] = []

  for (const [propName, propSchema] of Object.entries(
    schema.properties || {}
  )) {
    const isRequired = schema.required?.includes(propName) ?? false
    const zodType = getZodTypeFromSchema(propSchema as any, options, nameMap)
    const finalType = isRequired
      ? zodType
      : applyOptionalModifier(zodType, options.optionalType)
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
