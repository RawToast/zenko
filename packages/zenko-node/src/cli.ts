#!/usr/bin/env node

import * as path from "path"
import { mkdir, writeFile } from "node:fs/promises"
import { generateFromDocument, type TypesConfig } from "@zenko/core"
import {
  loadConfig,
  loadSpec,
  normalizeGenerationOptions,
  type SchemaConfigFile,
} from "./loader"

type ParsedArgs = {
  showHelp: boolean
  strictDates: boolean
  strictNumeric: boolean
  configPath?: string
  positional: string[]
}

async function main() {
  try {
    const args = process.argv.slice(2)
    const parsed = parseArgs(args)

    if (parsed.showHelp) {
      printHelp()
      return
    }

    if (parsed.configPath) {
      await runFromConfig(parsed)
      return
    }

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
      resolvedInput: path.resolve(inputFile),
      resolvedOutput: path.resolve(outputFile),
      strictDates: parsed.strictDates,
      strictNumeric: parsed.strictNumeric,
    })
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
  console.log("  zenko-node <input-file> <output-file> [options]")
  console.log("  zenko-node --config <config-file> [options]")
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
    '  {"types"?: { emit?, helpers?, helpersOutput?, optionalType?, treeShake? }, "schemas": [{ input, output, strictDates?, strictNumeric?, types?, operationIds? }] }'
  )
}

async function runFromConfig(parsed: ParsedArgs) {
  const configPath = parsed.configPath!
  const resolvedConfigPath = path.resolve(configPath)
  const configDocument = await loadConfig(resolvedConfigPath)
  validateConfig(configDocument)
  const config = configDocument as SchemaConfigFile

  const baseDir = path.dirname(resolvedConfigPath)
  const defaults = {
    strictDates: parsed.strictDates,
    strictNumeric: parsed.strictNumeric,
    types: config.types,
    operationIds: undefined as string[] | undefined,
  }

  for (const entry of config.schemas) {
    const options = normalizeGenerationOptions(entry, baseDir, defaults)
    await generateSingle(options)
  }
}

function validateConfig(config: unknown): asserts config is SchemaConfigFile {
  if (!config || typeof config !== "object") {
    throw new Error("Config file must export an object")
  }

  if (!Array.isArray((config as SchemaConfigFile).schemas)) {
    throw new Error("Config file must contain a 'schemas' array")
  }

  for (const entry of (config as SchemaConfigFile).schemas) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each schema entry must be an object")
    }
    if (typeof entry.input !== "string" || typeof entry.output !== "string") {
      throw new Error("Each schema entry requires 'input' and 'output' paths")
    }
  }
}

async function generateSingle(options: {
  resolvedInput: string
  resolvedOutput: string
  strictDates?: boolean
  strictNumeric?: boolean
  types?: TypesConfig
  operationIds?: string[]
}) {
  const {
    resolvedInput,
    resolvedOutput,
    strictDates = false,
    strictNumeric = false,
    types,
    operationIds,
  } = options

  const spec = await loadSpec(resolvedInput)
  const result = generateFromDocument(spec, {
    strictDates,
    strictNumeric,
    types,
    operationIds,
  })

  await mkdir(path.dirname(resolvedOutput), { recursive: true })
  await writeFile(resolvedOutput, result.output, "utf8")

  console.log(`✅ Generated TypeScript types in ${resolvedOutput}`)
  console.log(`📄 Processed ${Object.keys(spec.paths || {}).length} paths`)
  if (spec.webhooks) {
    console.log(`🪝 Processed ${Object.keys(spec.webhooks).length} webhooks`)
  }

  if (result.helperFile) {
    const helperPath = path.isAbsolute(result.helperFile.path)
      ? result.helperFile.path
      : path.resolve(path.dirname(resolvedOutput), result.helperFile.path)

    const absoluteResolvedOutput = path.resolve(resolvedOutput)
    const absoluteHelperPath = path.resolve(helperPath)

    if (absoluteResolvedOutput === absoluteHelperPath) {
      console.warn(
        `⚠️  Skipping helper file generation: would overwrite main output at ${absoluteResolvedOutput}`
      )
      return
    }

    await mkdir(path.dirname(helperPath), { recursive: true })
    await writeFile(helperPath, result.helperFile.content, "utf8")

    console.log(`📦 Generated helper types in ${helperPath}`)
  }
}

main().catch((error) => {
  console.error("❌ Error:", error)
  process.exit(1)
})
