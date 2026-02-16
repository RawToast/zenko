#!/usr/bin/env node

import * as fs from "fs"
import * as path from "path"
import { pathToFileURL } from "url"
import {
  generateWithMetadata,
  type OpenAPISpec,
  type TypesConfig,
  type EnumConfig,
} from "./zenko.js"

type CliConfigEntry = {
  input: string
  output: string
  strictDates?: boolean
  strictNumeric?: boolean
  dateTimeOffset?: boolean | string[]
  types?: TypesConfig
  operationIds?: string[]
  openEnums?: boolean | string[] | EnumConfig
}

type CliConfigFile = {
  schemas: CliConfigEntry[]
  types?: TypesConfig
}

type ParsedArgs = {
  showHelp: boolean
  strictDates: boolean
  strictNumeric: boolean
  configPath?: string
  positional: string[]
}

async function main() {
  const args = process.argv.slice(2)
  const parsed = parseArgs(args)

  if (
    parsed.showHelp ||
    (!parsed.configPath && parsed.positional.length === 0)
  ) {
    printHelp()
    process.exit(parsed.showHelp ? 0 : 1)
    return
  }

  try {
    if (parsed.configPath) {
      await runFromConfig(parsed)
    } else {
      if (parsed.positional.length !== 2) {
        printHelp()
        process.exit(1)
        return
      }

      const [inputFile, outputFile] = parsed.positional
      if (!inputFile || !outputFile) {
        printHelp()
        process.exit(1)
        return
      }
      await generateSingle({
        inputFile,
        outputFile,
        strictDates: parsed.strictDates,
        strictNumeric: parsed.strictNumeric,
      })
    }
  } catch (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    showHelp: false,
    strictDates: false,
    strictNumeric: false,
    positional: [],
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!

    if (arg === "-h" || arg === "--help") {
      parsed.showHelp = true
      continue
    }

    if (arg === "--strict-dates") {
      parsed.strictDates = true
      continue
    }

    if (arg === "--strict-numeric") {
      parsed.strictNumeric = true
      continue
    }

    if (arg === "--config" || arg === "-c") {
      const next = args[index + 1]
      if (!next) {
        throw new Error("--config flag requires a file path")
      }
      parsed.configPath = next
      index += 1
      continue
    }

    parsed.positional.push(arg)
  }

  return parsed
}

function printHelp() {
  console.log("Usage:")
  console.log("  zenko <input-file> <output-file> [options]")
  console.log("  zenko --config <config-file> [options]")
  console.log("")
  console.log("Options:")
  console.log("  -h, --help          Show this help message")
  console.log(
    "  --strict-dates      Use ISO datetime parsing (can be set per config entry)"
  )
  console.log(
    "  --strict-numeric    Preserve numeric min/max bounds (can be set per config entry)"
  )
  console.log(
    "  -c, --config        Path to config file (JSON, YAML, or JS module)"
  )
  console.log("")
  console.log("Config file format:")
  console.log(
    '  {"types"?: { emit?, helpers?, helpersOutput?, optionalType?, treeShake? }, "schemas": [{ input, output, strictDates?, strictNumeric?, types? }] }'
  )
}

async function runFromConfig(parsed: ParsedArgs) {
  const configPath = parsed.configPath!
  const resolvedConfigPath = path.resolve(configPath)
  const config = await loadConfig(resolvedConfigPath)
  validateConfig(config)

  const baseDir = path.dirname(resolvedConfigPath)
  const baseTypesConfig = config.types

  for (const entry of config.schemas) {
    const inputFile = resolvePath(entry.input, baseDir)
    const outputFile = resolvePath(entry.output, baseDir)
    const typesConfig = resolveTypesConfig(baseTypesConfig, entry.types)
    await generateSingle({
      inputFile,
      outputFile,
      strictDates: entry.strictDates ?? parsed.strictDates,
      strictNumeric: entry.strictNumeric ?? parsed.strictNumeric,
      dateTimeOffset: entry.dateTimeOffset,
      typesConfig,
      operationIds: entry.operationIds,
      openEnums: entry.openEnums,
    })
  }
}

async function loadConfig(filePath: string): Promise<unknown> {
  const extension = path.extname(filePath).toLowerCase()

  if (extension === ".json") {
    const content = fs.readFileSync(filePath, "utf8")
    return JSON.parse(content)
  }

  if (extension === ".yaml" || extension === ".yml") {
    const content = fs.readFileSync(filePath, "utf8")
    return Bun.YAML.parse(content)
  }

  const fileUrl = pathToFileURL(filePath).href
  const module = await import(fileUrl)
  return module.default ?? module.config ?? module
}

function validateConfig(config: unknown): asserts config is CliConfigFile {
  if (!config || typeof config !== "object") {
    throw new Error("Config file must export an object")
  }

  if (!Array.isArray((config as CliConfigFile).schemas)) {
    throw new Error("Config file must contain a 'schemas' array")
  }

  for (const entry of (config as CliConfigFile).schemas) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each schema entry must be an object")
    }
    if (typeof entry.input !== "string" || typeof entry.output !== "string") {
      throw new Error("Each schema entry requires 'input' and 'output' paths")
    }
  }
}

function resolvePath(filePath: string, baseDir: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(baseDir, filePath)
}

function resolveTypesConfig(
  baseConfig: TypesConfig | undefined,
  entryConfig: TypesConfig | undefined
): TypesConfig | undefined {
  if (!baseConfig && !entryConfig) return undefined
  return {
    ...baseConfig,
    ...entryConfig,
  }
}

async function generateSingle(options: {
  inputFile: string
  outputFile: string
  strictDates: boolean
  strictNumeric: boolean
  dateTimeOffset?: boolean | string[]
  typesConfig?: TypesConfig
  operationIds?: string[]
  openEnums?: boolean | string[] | EnumConfig
}) {
  const {
    inputFile,
    outputFile,
    strictDates,
    strictNumeric,
    dateTimeOffset,
    typesConfig,
    operationIds,
    openEnums,
  } = options
  const resolvedInput = path.resolve(inputFile)
  const resolvedOutput = path.resolve(outputFile)

  const spec = readSpec(resolvedInput)
  const result = generateWithMetadata(spec, {
    strictDates,
    strictNumeric,
    dateTimeOffset,
    types: typesConfig,
    operationIds,
    openEnums,
  })

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true })
  fs.writeFileSync(resolvedOutput, result.output)

  console.log(`✅ Generated TypeScript types in ${resolvedOutput}`)
  console.log(`📄 Processed ${Object.keys(spec.paths || {}).length} paths`)
  if (spec.webhooks) {
    console.log(`🪝 Processed ${Object.keys(spec.webhooks).length} webhooks`)
  }

  // Write helper file if needed
  if (result.helperFile) {
    const helperPath = path.isAbsolute(result.helperFile.path)
      ? result.helperFile.path
      : path.resolve(path.dirname(resolvedOutput), result.helperFile.path)

    // Resolve both paths to absolute paths for comparison
    const absoluteResolvedOutput = path.resolve(resolvedOutput)
    const absoluteHelperPath = path.resolve(helperPath)

    // Check if helper file would overwrite the main output
    if (absoluteResolvedOutput === absoluteHelperPath) {
      console.warn(
        `⚠️  Skipping helper file generation: would overwrite main output at ${absoluteResolvedOutput}`
      )
      return
    }

    fs.mkdirSync(path.dirname(helperPath), { recursive: true })
    fs.writeFileSync(helperPath, result.helperFile.content, {
      encoding: "utf8",
    })

    console.log(`📦 Generated helper types in ${helperPath}`)
  }
}

function readSpec(filePath: string): OpenAPISpec {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`)
  }

  const content = fs.readFileSync(filePath, "utf8")

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return Bun.YAML.parse(content) as OpenAPISpec
  }

  return JSON.parse(content) as OpenAPISpec
}

main().catch((error) => {
  console.error("❌ Error:", error)
  process.exit(1)
})
