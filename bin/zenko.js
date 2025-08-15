#!/usr/bin/env node

// Simple CLI entry point - just call main() directly
import * as fs from "fs"
import * as yaml from "js-yaml"

// Import the main logic from zwagger-zod.ts
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error("Usage: zwagger <input-file> <output-file>")
    console.error("  input-file: OpenAPI spec file (.json or .yaml)")
    console.error("  output-file: Generated TypeScript file")
    process.exit(1)
  }

  const [inputFile, outputFile] = args

  if (!inputFile || !outputFile) {
    console.error("Usage: zwagger <input-file> <output-file>")
    console.error("  input-file: OpenAPI spec file (.json or .yaml)")
    console.error("  output-file: Generated TypeScript file")
    process.exit(1)
  }

  try {
    // Import and use the OpenAPIGenerator class
    const { OpenAPIGenerator } = await import("../src/zenko.ts")

    // Read and parse the OpenAPI spec
    const fileContent = fs.readFileSync(inputFile, "utf8")
    let spec

    if (inputFile.endsWith(".yaml") || inputFile.endsWith(".yml")) {
      spec = yaml.load(fileContent)
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
