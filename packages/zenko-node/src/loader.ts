import { readFile } from "node:fs/promises"
import * as path from "path"
import { pathToFileURL } from "url"
import { load } from "js-yaml"
import type { GenerateOptions, TypesConfig, OpenAPISpec } from "@zenko/core"

const YAML_EXTENSIONS = new Set([".yaml", ".yml"])
const JSON_EXTENSIONS = new Set([".json"])

type LoaderOptions = {
  strictDates?: boolean
  strictNumeric?: boolean
  types?: TypesConfig
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
  try {
    return await readFile(filePath, "utf8")
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      throw new Error(`File not found: ${filePath}`)
    }
    throw error
  }
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
    return load(content)
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
    const parsed = load(content)
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`YAML spec did not resolve to an object: ${filePath}`)
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
