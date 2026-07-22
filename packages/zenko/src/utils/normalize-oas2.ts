import type { OpenAPISpec, SchemaVersion } from "../zenko"

const DEFAULT_MEDIA_TYPE = "application/json"
const DEFINITIONS_REF_PREFIX = "#/definitions/"
const COMPONENTS_SCHEMAS_REF_PREFIX = "#/components/schemas/"
const PARAMETERS_REF_PREFIX = "#/parameters/"
const RESPONSES_REF_PREFIX = "#/responses/"

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
])

/** OAS2 parameter fields that become `schema` properties in OAS3. */
const OAS2_SCHEMA_KEYS = [
  "type",
  "format",
  "enum",
  "items",
  "default",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "multipleOf",
  "additionalProperties",
] as const

type JsonObject = Record<string, unknown>

/**
 * Apply `schemaVersion` preprocessing: normalize Swagger 2.0 documents to an
 * OpenAPI 3-shaped spec when needed. Leaves OAS3 documents unchanged.
 */
export function normalizeSpecForSchemaVersion(
  spec: OpenAPISpec,
  schemaVersion: SchemaVersion = "auto"
): OpenAPISpec {
  if (resolveSchemaVersion(spec, schemaVersion) === "oas2") {
    return normalizeOas2ToOas3(spec)
  }
  return spec
}

export function resolveSchemaVersion(
  spec: OpenAPISpec,
  schemaVersion: SchemaVersion = "auto"
): "oas3" | "oas2" {
  if (schemaVersion !== "auto") return schemaVersion

  const { swagger } = spec
  if (swagger === "2.0" || swagger === 2) return "oas2"
  return "oas3"
}

/**
 * Convert a Swagger 2.0 document into an OpenAPI 3-shaped spec that the
 * rest of Zenko can consume. Assumes JSON (or the first consumes/produces
 * entry) for request/response bodies.
 */
export function normalizeOas2ToOas3(spec: OpenAPISpec): OpenAPISpec {
  const cloned = structuredClone(spec) as JsonObject
  const globalConsumes = asStringArray(cloned.consumes) ?? []
  const globalProduces = asStringArray(cloned.produces) ?? []
  const parameterDefinitions = asObject(cloned.parameters)
  const responseDefinitions = asObject(cloned.responses)

  const components = ensureObject(cloned, "components")
  components.schemas = {
    ...(cloned.definitions as JsonObject | undefined),
    ...(components.schemas as JsonObject | undefined),
  }
  components.securitySchemes = convertSecurityDefinitions(
    cloned.securityDefinitions,
    components.securitySchemes as JsonObject | undefined
  )

  if (isPlainObject(cloned.paths)) {
    for (const pathItem of Object.values(cloned.paths)) {
      if (!isPlainObject(pathItem)) continue
      normalizePathItem(
        pathItem,
        globalConsumes,
        globalProduces,
        parameterDefinitions,
        responseDefinitions
      )
    }
  }

  delete cloned.swagger
  delete cloned.definitions
  delete cloned.securityDefinitions
  delete cloned.parameters
  delete cloned.responses
  delete cloned.consumes
  delete cloned.produces
  cloned.openapi = cloned.openapi ?? "3.0.0"

  return rewriteDefinitionRefs(cloned) as OpenAPISpec
}

function normalizePathItem(
  pathItem: JsonObject,
  globalConsumes: string[],
  globalProduces: string[],
  parameterDefinitions: JsonObject,
  responseDefinitions: JsonObject
): void {
  const inheritedParameters = Array.isArray(pathItem.parameters)
    ? pathItem.parameters
    : []

  for (const [method, operation] of Object.entries(pathItem)) {
    if (!isHttpMethod(method) || !isPlainObject(operation)) continue
    const operationParameters = Array.isArray(operation.parameters)
      ? operation.parameters
      : []
    operation.parameters = mergeOas2Parameters(
      inheritedParameters,
      operationParameters,
      parameterDefinitions
    )
    normalizeOperation(
      operation,
      globalConsumes,
      globalProduces,
      responseDefinitions
    )
  }

  delete pathItem.parameters
}

function normalizeOperation(
  operation: JsonObject,
  globalConsumes: string[],
  globalProduces: string[],
  responseDefinitions: JsonObject
): void {
  const consumes = asStringArray(operation.consumes) ?? globalConsumes
  const produces = asStringArray(operation.produces) ?? globalProduces

  if (Array.isArray(operation.parameters)) {
    let bodyParam: JsonObject | undefined
    const formParams: JsonObject[] = []
    const remaining: unknown[] = []

    for (const raw of operation.parameters) {
      const param = liftOas2Parameter(raw)
      if (!isPlainObject(param)) {
        remaining.push(param)
        continue
      }
      if (param.in === "body") {
        // Last body parameter wins (Swagger allows at most one).
        bodyParam = param
        continue
      }
      if (param.in === "formData") {
        formParams.push(param)
        continue
      }
      remaining.push(param)
    }

    operation.parameters = remaining

    if (!operation.requestBody) {
      if (bodyParam) {
        const requestMediaType = pickRequestBodyMediaType(consumes, operation)
        operation.requestBody = {
          description: bodyParam.description,
          required: bodyParam.required ?? false,
          content: {
            [requestMediaType]: {
              schema: bodyParam.schema ?? {},
            },
          },
        }
      } else if (formParams.length > 0) {
        const formMediaType = pickFormDataMediaType(consumes, formParams)
        operation.requestBody = {
          required: formParams.some((p) => p.required),
          content: {
            [formMediaType]: {
              schema: formDataToSchema(formParams),
            },
          },
        }
      }
    }
  }

  delete operation.consumes
  delete operation.produces

  if (isPlainObject(operation.responses)) {
    const mediaType = pickMediaType(produces)
    for (const [status, rawResponse] of Object.entries(operation.responses)) {
      const response = resolveOas2Reference(
        rawResponse,
        responseDefinitions,
        RESPONSES_REF_PREFIX
      )
      if (!isPlainObject(response)) continue
      operation.responses[status] = response
      if (response.schema === undefined || response.content !== undefined) {
        continue
      }
      response.content = {
        [mediaType]: { schema: response.schema },
      }
      delete response.schema
    }
  }
}

function mergeOas2Parameters(
  inherited: unknown[],
  operation: unknown[],
  definitions: JsonObject
): unknown[] {
  const merged = new Map<string, unknown>()
  let unkeyedIndex = 0

  for (const raw of [...inherited, ...operation]) {
    const resolved = resolveOas2Reference(
      raw,
      definitions,
      PARAMETERS_REF_PREFIX
    )
    const parameter = liftOas2Parameter(resolved)
    const key =
      isPlainObject(parameter) &&
      typeof parameter.in === "string" &&
      typeof parameter.name === "string"
        ? `${String(parameter.in)}:${String(parameter.name)}`
        : `unkeyed:${unkeyedIndex++}`
    merged.set(key, parameter)
  }

  return [...merged.values()]
}

function resolveOas2Reference(
  value: unknown,
  definitions: JsonObject,
  prefix: string,
  seen = new Set<string>()
): unknown {
  if (!isPlainObject(value) || typeof value.$ref !== "string") return value
  if (!value.$ref.startsWith(prefix) || seen.has(value.$ref)) return value

  const name = value.$ref.slice(prefix.length)
  const resolved = definitions[name]
  if (resolved === undefined) {
    throw new Error(
      `Swagger 2.0 normalization: unresolved reference "${value.$ref}"`
    )
  }

  seen.add(value.$ref)
  const dereferenced = resolveOas2Reference(resolved, definitions, prefix, seen)
  return isPlainObject(dereferenced) ? { ...dereferenced } : dereferenced
}

/**
 * Lift Swagger 2.0 top-level type/enum/etc. onto `schema` for non-body params.
 */
function liftOas2Parameter(param: unknown): unknown {
  if (
    !isPlainObject(param) ||
    param.$ref ||
    param.in === "body" ||
    param.schema
  ) {
    return param
  }

  const next: JsonObject = { ...param }
  const schema: JsonObject = {}

  for (const key of OAS2_SCHEMA_KEYS) {
    if (next[key] !== undefined) {
      schema[key] = next[key]
      delete next[key]
    }
  }

  // OAS2 file uploads → OAS3 binary string
  if (schema.type === "file") {
    schema.type = "string"
    schema.format = "binary"
  }

  if (Object.keys(schema).length > 0) {
    next.schema = schema
  }

  return next
}

function formDataToSchema(formParams: JsonObject[]): JsonObject {
  const properties: JsonObject = {}
  const required: string[] = []

  for (const param of formParams) {
    if (typeof param.name !== "string") continue
    properties[param.name] = param.schema ?? { type: "string" }
    if (param.required) required.push(param.name)
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function rewriteDefinitionRefs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(rewriteDefinitionRefs)
  }
  if (!isPlainObject(value)) return value

  const result: JsonObject = {}
  for (const [key, nested] of Object.entries(value)) {
    if (
      key === "$ref" &&
      typeof nested === "string" &&
      nested.startsWith(DEFINITIONS_REF_PREFIX)
    ) {
      result[key] =
        COMPONENTS_SCHEMAS_REF_PREFIX +
        nested.slice(DEFINITIONS_REF_PREFIX.length)
    } else {
      result[key] = rewriteDefinitionRefs(nested)
    }
  }
  return result
}

function pickMediaType(types: string[]): string {
  if (types.length === 0) return DEFAULT_MEDIA_TYPE
  return types.find((t) => t.includes("json")) ?? types[0] ?? DEFAULT_MEDIA_TYPE
}

const FORM_URLENCODED = "application/x-www-form-urlencoded"
const MULTIPART_FORM_DATA = "multipart/form-data"
const SUPPORTED_REQUEST_MEDIA_TYPES = new Set([
  DEFAULT_MEDIA_TYPE,
  MULTIPART_FORM_DATA,
  FORM_URLENCODED,
])

function pickRequestBodyMediaType(
  consumes: string[],
  operation: JsonObject
): string {
  const picked = pickMediaType(consumes)
  if (SUPPORTED_REQUEST_MEDIA_TYPES.has(picked)) return picked

  const operationId =
    typeof operation.operationId === "string"
      ? operation.operationId
      : "unknown"
  console.warn(
    `Swagger 2.0 normalization: operation "${operationId}" consumes "${picked}" which Zenko cannot generate request types for; falling back to application/json`
  )
  return DEFAULT_MEDIA_TYPE
}

function pickFormDataMediaType(
  consumes: string[],
  formParams: JsonObject[]
): string {
  if (formParams.some(isFileFormParam)) return MULTIPART_FORM_DATA

  const formMediaTypes = consumes.filter(
    (type) => type === FORM_URLENCODED || type === MULTIPART_FORM_DATA
  )
  if (formMediaTypes.includes(FORM_URLENCODED)) return FORM_URLENCODED
  if (formMediaTypes.includes(MULTIPART_FORM_DATA)) return MULTIPART_FORM_DATA
  return FORM_URLENCODED
}

function isFileFormParam(param: JsonObject): boolean {
  return (
    param.type === "file" ||
    (isPlainObject(param.schema) &&
      param.schema.type === "string" &&
      param.schema.format === "binary")
  )
}

function convertSecurityDefinitions(
  oas2Definitions: unknown,
  existing: JsonObject | undefined
): JsonObject {
  const result: JsonObject = { ...existing }
  if (!isPlainObject(oas2Definitions)) return result

  for (const [name, scheme] of Object.entries(oas2Definitions)) {
    if (!isPlainObject(scheme)) continue
    result[name] = convertSecurityScheme(scheme)
  }

  return result
}

function convertSecurityScheme(scheme: JsonObject): JsonObject {
  if (scheme.type === "basic") {
    return {
      ...(scheme.description !== undefined
        ? { description: scheme.description }
        : {}),
      type: "http",
      scheme: "basic",
    }
  }

  if (scheme.type === "oauth2") {
    return {
      ...(scheme.description !== undefined
        ? { description: scheme.description }
        : {}),
      type: "oauth2",
      flows: convertOauth2Flows(scheme),
    }
  }

  return { ...scheme }
}

function convertOauth2Flows(scheme: JsonObject): JsonObject {
  const flow = typeof scheme.flow === "string" ? scheme.flow : undefined
  const scopes = isPlainObject(scheme.scopes) ? scheme.scopes : {}
  const flowDef: JsonObject = { scopes }

  if (scheme.authorizationUrl !== undefined) {
    flowDef.authorizationUrl = scheme.authorizationUrl
  }
  if (scheme.tokenUrl !== undefined) {
    flowDef.tokenUrl = scheme.tokenUrl
  }

  switch (flow) {
    case "implicit":
      return { implicit: flowDef }
    case "password":
      return { password: flowDef }
    case "application":
      return { clientCredentials: flowDef }
    case "accessCode":
      return { authorizationCode: flowDef }
    default:
      return {}
  }
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((v): v is string => typeof v === "string")
  return strings.length > 0 ? strings : undefined
}

function asObject(value: unknown): JsonObject {
  return isPlainObject(value) ? value : {}
}

function ensureObject(parent: JsonObject, key: string): JsonObject {
  const existing = parent[key]
  if (isPlainObject(existing)) return existing
  const created: JsonObject = {}
  parent[key] = created
  return created
}

function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isHttpMethod(method: string): boolean {
  return HTTP_METHODS.has(method.toLowerCase())
}
