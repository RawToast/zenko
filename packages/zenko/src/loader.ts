import * as path from "path"
import { pathToFileURL } from "url"
import type { GenerateOptions, OpenAPISpec, TypesConfig } from "@zenko/core"

const YAML_EXTENSIONS = new Set([".yaml", ".yml"])
const JSON_EXTENSIONS = new Set([".json"])

type LoaderOptions = {
  /**
   * Override strict date handling for inline document generation when the CLI
   * resolves configuration entries.
   */
  strictDates?: boolean
  /**
   * Override numeric strictness for inline document generation when the CLI
   * resolves configuration entries.
   */
  strictNumeric?: boolean
  /**
   * Per-entry types configuration overrides.
   */
  types?: TypesConfig
  /**
   * Optional list of operation identifiers to filter emitted artifacts.
   */
  operationIds?: string[]
}

export type SchemaConfigEntry = LoaderOptions & {
  input: string
  output: string
}

export type SchemaConfigFile = {
  schemas: SchemaConfigEntry[]
  types?: TypesConfig
}

async function readFileText(filePath: string): Promise<string> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    throw new Error(`File not found: ${filePath}`)
  }
  return await file.text()
}

export async function loadConfig(
  filePath: string
): Promise<SchemaConfigFile | unknown> {
  const extension = path.extname(filePath).toLowerCase()

  if (JSON_EXTENSIONS.has(extension)) {
    const content = await readFileText(filePath)
    return JSON.parse(content)
  }

  if (YAML_EXTENSIONS.has(extension)) {
    const content = await readFileText(filePath)
    return Bun.YAML.parse(content)
  }

  const fileUrl = pathToFileURL(filePath).href
  const module = await import(fileUrl)
  return module.default ?? module.config ?? module
}

export async function loadSpec(
  filePath: string
): Promise<OpenAPISpec & Record<string, unknown>> {
  const extension = path.extname(filePath).toLowerCase()
  const content = await readFileText(filePath)

  if (YAML_EXTENSIONS.has(extension)) {
    const parsed = Bun.YAML.parse(content)
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`YAML spec did not resolve to an object: ${filePath}`)
    }
    if (Array.isArray(parsed)) {
      throw new Error(
        `YAML spec produced multiple documents; provide a single document in ${filePath}`
      )
    }
    return parsed as OpenAPISpec & Record<string, unknown>
  }

  if (JSON_EXTENSIONS.has(extension)) {
    return JSON.parse(content) as OpenAPISpec & Record<string, unknown>
  }

  throw new Error(
    `Unsupported specification format for ${filePath}. Expected .yaml, .yml, or .json`
  )
}

export type ResolvedGenerationOptions = LoaderOptions & {
  resolvedInput: string
  resolvedOutput: string
}

export function normalizeGenerationOptions(
  entry: SchemaConfigEntry,
  baseDir: string,
  defaults: Pick<
    GenerateOptions,
    "strictDates" | "strictNumeric" | "operationIds"
  > & { types?: TypesConfig }
): ResolvedGenerationOptions {
  const resolvedInput = path.isAbsolute(entry.input)
    ? entry.input
    : path.join(baseDir, entry.input)

  const resolvedOutput = path.isAbsolute(entry.output)
    ? entry.output
    : path.join(baseDir, entry.output)

  return {
    resolvedInput,
    resolvedOutput,
    strictDates: entry.strictDates ?? defaults.strictDates,
    strictNumeric: entry.strictNumeric ?? defaults.strictNumeric,
    types: mergeTypesConfig(defaults.types, entry.types),
    operationIds: entry.operationIds ?? defaults.operationIds,
  }
}

function mergeTypesConfig(
  baseConfig: TypesConfig | undefined,
  entryConfig: TypesConfig | undefined
): TypesConfig | undefined {
  if (!baseConfig && !entryConfig) return undefined
  return {
    ...baseConfig,
    ...entryConfig,
  }
}
