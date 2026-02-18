import { topologicalSort } from "./utils/topological-sort"
import { formatPropertyName, isValidJSIdentifier } from "./utils/property-name"
import { toCamelCase, capitalize } from "./utils/string-utils"
import { analyzeZenkoUsage, generateZenkoImport } from "./utils/tree-shaking"
import { collectReferencedSchemas } from "./utils/collect-referenced-schemas"
import {
  type SchemaOptions,
  generateZodSchema,
  applyOptionalModifier,
} from "./core/schema-generator"
import { parseOperations } from "./core/operation-parser"
import {
  generateRequestTypes,
  generateResponseTypes,
} from "./generator/inline-types"
import type {
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
  security?: Record<string, string[]>[]
  components?: {
    schemas?: Record<string, unknown>
    parameters?: Record<string, unknown>
    securitySchemes?: Record<string, unknown>
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

export type EnumConfig = {
  open?: boolean | string[]
  unknownPrefix?: string
}

export type GenerateOptions = {
  strictDates?: boolean
  strictNumeric?: boolean
  dateTimeOffset?: boolean | string[]
  types?: TypesConfig
  operationIds?: string[]
  openEnums?: boolean | string[] | EnumConfig
}

export type GenerateResult = {
  output: string
  helperFile?: {
    path: string
    content: string
  }
}

/**
 * Resolves enum configuration from various input formats to normalized form.
 *
 * @param openEnums - Enum configuration: boolean, string array, or EnumConfig object
 * @returns Normalized enum configuration with open flag and prefix
 */
function resolveEnumConfig(openEnums?: boolean | string[] | EnumConfig): {
  open: boolean | string[]
  prefix: string
} {
  if (openEnums === undefined) return { open: false, prefix: "Unknown:" }
  if (typeof openEnums === "boolean")
    return { open: openEnums, prefix: "Unknown:" }
  if (Array.isArray(openEnums)) return { open: openEnums, prefix: "Unknown:" }
  return {
    open: openEnums.open ?? false,
    prefix: openEnums.unknownPrefix ?? "Unknown:",
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
  const {
    strictDates = false,
    strictNumeric = false,
    dateTimeOffset = true,
    operationIds,
    openEnums = false,
  } = options
  const typesConfig = normalizeTypesConfig(options.types)
  const enumConfig = resolveEnumConfig(openEnums)
  const schemaOptions: SchemaOptions = {
    strictDates,
    strictNumeric,
    dateTimeOffset,
    optionalType: typesConfig.optionalType,
    openEnums: enumConfig.open,
    openEnumPrefix: enumConfig.prefix,
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
    const schemasToGenerate =
      operationIds && operationIds.length > 0
        ? new Set(collectReferencedSchemas(operations, spec))
        : new Set(Object.keys(spec.components.schemas))

    // Sort schemas by dependencies (topological sort)
    const sortedSchemas = topologicalSort(spec.components.schemas).filter(
      (name) => schemasToGenerate.has(name)
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
          nameMap,
          spec.components.schemas
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

  // Generate security schemes
  if (
    spec.components?.securitySchemes &&
    Object.keys(spec.components.securitySchemes).length > 0
  ) {
    output.push("// Security Schemes")
    output.push("export const securitySchemes = {")

    for (const [name, scheme] of Object.entries(
      spec.components.securitySchemes
    )) {
      const s = scheme as Record<string, unknown>
      output.push(`  ${formatPropertyName(name)}: {`)
      output.push(`    type: ${JSON.stringify(s.type)},`)

      if (s.type === "http") {
        output.push(
          `    scheme: ${JSON.stringify(String(s.scheme).toLowerCase())},`
        )
        if (s.bearerFormat) {
          output.push(`    bearerFormat: ${JSON.stringify(s.bearerFormat)},`)
        }
      } else if (s.type === "apiKey") {
        output.push(`    name: ${JSON.stringify(s.name)},`)
        output.push(`    in: ${JSON.stringify(s.in)},`)
      } else if (s.type === "oauth2") {
        output.push(`    flows: ${JSON.stringify(s.flows)},`)
      } else if (s.type === "openIdConnect") {
        output.push(
          `    openIdConnectUrl: ${JSON.stringify(s.openIdConnectUrl)},`
        )
      }

      output.push("  },")
    }

    output.push("} as const;")
    output.push("")
  }

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

    if (op.security !== undefined) {
      if (op.security.length === 0) {
        output.push("  security: [],")
      } else {
        const securityEntries = op.security.map((req) => {
          const entries = Object.entries(req)
            .map(([scheme, scopes]) => {
              return `${formatPropertyName(scheme)}: ${JSON.stringify(scopes)}`
            })
            .join(", ")
          return `{ ${entries} }`
        })
        output.push(`  security: [${securityEntries.join(", ")}],`)
      }
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
        "type SecurityRequirement = Readonly<Record<string, readonly string[]>>;"
      )
      buffer.push(
        "type OperationDefinition<TMethod extends RequestMethod, TPath extends (...args: any[]) => string, TRequest = undefined, TResponse = undefined, THeaders extends AnyHeaderFn | undefined = undefined, TErrors extends OperationErrors | undefined = undefined, TSecurity extends readonly SecurityRequirement[] | undefined = undefined> = {"
      )
      buffer.push("  method: TMethod")
      buffer.push("  path: TPath")
      buffer.push("  request?: TRequest")
      buffer.push("  response?: TResponse")
      buffer.push("  headers?: THeaders")
      buffer.push("  errors?: TErrors")
      buffer.push("  security?: TSecurity")
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

    // Build security type - use inline literal to avoid self-referential typeof
    const securityType = (() => {
      if (op.security === undefined) return "undefined"
      if (op.security.length === 0) return "readonly []"

      const entries = op.security.map((req) => {
        const props = Object.entries(req)
          .map(
            ([scheme, scopes]) =>
              `readonly ${formatPropertyName(scheme)}: readonly ${JSON.stringify(scopes)}`
          )
          .join("; ")
        return `{ ${props} }`
      })
      return `readonly [${entries.join(", ")}]`
    })()

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
    buffer.push(`  ${errorsType},`)
    buffer.push(`  ${securityType}`)
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
