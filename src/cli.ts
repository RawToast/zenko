#!/usr/bin/env node

import * as fs from "fs"
import { load } from "js-yaml"
import { OpenAPIGenerator } from "./generator.js"

function main() {
  const args = process.argv.slice(2)

  if (args.includes("-h") || args.includes("--help") || args.length !== 2) {
    console.log("Usage: zenko <input-file> <output-file>")
    console.log(
      "  input-file:  OpenAPI specification file (.json, .yaml, .yml)"
    )
    console.log("  output-file: Output TypeScript file (.ts)")
    console.log("")
    console.log("Options:")
    console.log("  -h, --help    Show this help message")
    process.exit(args.includes("-h") || args.includes("--help") ? 0 : 1)
  }

  const inputFile = args[0]!
  const outputFile = args[1]!

  try {
    // Read and parse OpenAPI spec
    const fileContent = fs.readFileSync(inputFile, "utf8")
    let spec

    if (inputFile.endsWith(".yaml") || inputFile.endsWith(".yml")) {
      spec = load(fileContent)
    } else {
      spec = JSON.parse(fileContent)
    }

    // Generate TypeScript
    const generator = new OpenAPIGenerator(spec)
    const output = generator.generate()

    // Write output
    fs.writeFileSync(outputFile, output)

    console.log(`✅ Generated TypeScript types in ${outputFile}`)
    console.log(`📄 Processed ${Object.keys(spec.paths).length} paths`)
  } catch (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }
}

main()
