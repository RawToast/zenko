import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { dirname, resolve } from "path"
import { load } from "js-yaml"
import { generate } from "zenko"

function generateSchema(inputFile, outputFile, options) {
  try {
    // Resolve input and output paths
    const inputPath = resolve(`./resources/${inputFile}`)
    const outputPath = resolve(`./src/schema/${outputFile}`)
    const outputDir = dirname(outputPath)

    // Read the YAML file
    const specContent = readFileSync(inputPath, "utf8")

    // Validate input before processing
    if (!specContent || specContent.trim().length === 0) {
      throw new Error(`Spec file ${inputFile} is empty or could not be read`)
    }
    // load
    const spec = load(specContent)

    // Validate parsed spec
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      throw new Error(
        `Failed to parse YAML spec ${inputFile} or invalid spec format`
      )
    }

    // Generate TypeScript code
    const output = generate(spec, options)

    // Validate output
    if (!output || typeof output !== "string") {
      throw new Error(`Failed to generate TypeScript code for ${inputFile}`)
    }

    // Ensure output directory exists (mkdir -p behavior)
    mkdirSync(outputDir, { recursive: true })

    // Write to schema directory
    writeFileSync(outputPath, output)

    console.log(`✅ Generated ${outputFile} in src/schema/`)
    return true
  } catch (error) {
    console.error(
      `❌ Error during code generation for ${inputFile}:`,
      error.message
    )
    return false
  }
}

try {
  // Generate schemas for both specs
  const petstoreSuccess = generateSchema("petstore.yaml", "petstore.gen.ts")
  const trainTravelSuccess = generateSchema(
    "train-travel.yaml",
    "train-travel.gen.ts",
    {
      operationIds: ["get-stations"], // Include only ~10% of operations (1 of 8)
      types: {
        optionalType: "nullish",
      },
    }
  )
  const authApiSuccess = generateSchema("auth-api.yaml", "auth-api.gen.ts")

  if (!petstoreSuccess || !trainTravelSuccess || !authApiSuccess) {
    process.exit(1)
  }

  console.log("All schemas generated successfully!")
} catch (error) {
  console.error("❌ Error during code generation:", error.message)
  process.exit(1)
}
