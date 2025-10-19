import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { dirname, resolve } from "path"
import { load } from "js-yaml"
import { generate } from "zenko"

try {
  // Resolve input and output paths
  const inputPath = resolve("./resources/petstore.yaml")
  const outputPath = resolve("./src/schema/petstore.gen.ts")
  const outputDir = dirname(outputPath)

  // Read the petstore YAML file
  const specContent = readFileSync(inputPath, "utf8")

  // Validate input before processing
  if (!specContent || specContent.trim().length === 0) {
    throw new Error("Spec file is empty or could not be read")
  }

  const spec = load(specContent)

  // Validate parsed spec
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("Failed to parse YAML spec or invalid spec format")
  }

  // Generate TypeScript code
  const output = generate(spec)

  // Validate output
  if (!output || typeof output !== "string") {
    throw new Error("Failed to generate TypeScript code")
  }

  // Ensure output directory exists (mkdir -p behavior)
  mkdirSync(outputDir, { recursive: true })

  // Write to schema directory
  writeFileSync(outputPath, output)

  console.log("✅ Generated petstore.gen.ts in src/schema/")
} catch (error) {
  console.error("❌ Error during code generation:", error.message)
  process.exit(1)
}
