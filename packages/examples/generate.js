import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { dirname, relative, resolve } from "path"
import {
  authApiYamlPath,
  enumDemoYamlPath,
  petstoreYamlPath,
  tictactoeYamlPath,
  trainTravelYamlPath,
  fireblocksV2YamlPath,
} from "@zenko/specs"
import { generate, generateTreatyModule } from "zenko"

const specInputPaths = {
  "auth-api.yaml": authApiYamlPath,
  "enum-demo.yaml": enumDemoYamlPath,
  "petstore.yaml": petstoreYamlPath,
  "tictactoe.yaml": tictactoeYamlPath,
  "train-travel.yaml": trainTravelYamlPath,
  "fireblocks-v2.yaml": fireblocksV2YamlPath,
}

function generateSchema(inputFile, outputFile, options) {
  try {
    // Resolve input and output paths
    const inputPath =
      specInputPaths[inputFile] ?? resolve(`./resources/${inputFile}`)
    const outputPath = resolve(`./src/schema/${outputFile}`)
    const outputDir = dirname(outputPath)

    // Read the YAML file
    const specContent = readFileSync(inputPath, "utf8")

    // Validate input before processing
    if (!specContent || specContent.trim().length === 0) {
      throw new Error(`Spec file ${inputFile} is empty or could not be read`)
    }
    // load
    const spec = Bun.YAML.parse(specContent)

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

async function generateTrainTravelTreatyModule() {
  try {
    const genPath = resolve("./src/schema/train-travel.gen.ts")
    const treatyPath = resolve("./src/schema/train-travel.treaty.gen.ts")
    const outDir = dirname(treatyPath)
    let importPath = relative(outDir, genPath).replace(/\\/g, "/")
    if (!importPath.startsWith(".")) {
      importPath = `./${importPath}`
    }
    importPath = importPath.replace(/\.tsx?$/, "")
    const output = await generateTreatyModule({
      inputFile: genPath,
      importPath,
    })
    writeFileSync(treatyPath, output)
    console.log("✅ Generated train-travel.treaty.gen.ts in src/schema/")
    return true
  } catch (error) {
    console.error(
      "❌ Error during treaty generation for train-travel:",
      error.message
    )
    return false
  }
}

;(async () => {
  try {
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
    const tictactoeSuccess = generateSchema(
      "tictactoe.yaml",
      "tictactoe.gen.ts"
    )
    const enumDemoSuccess = generateSchema(
      "enum-demo.yaml",
      "enum-demo.gen.ts",
      {
        openEnums: ["ProductStatus"], // Make ProductStatus open, Category remains closed
      }
    )

    const fireblocksSuccess = generateSchema(
      "fireblocks-v2.yaml",
      "fireblocks-v2.gen.ts",
      {
        types: {
          operationTypeSuffix: "Ops",
        },
      }
    )
    if (
      !petstoreSuccess ||
      !trainTravelSuccess ||
      !authApiSuccess ||
      !tictactoeSuccess ||
      !enumDemoSuccess ||
      !fireblocksSuccess
    ) {
      process.exit(1)
    }

    const trainTravelTreatySuccess = await generateTrainTravelTreatyModule()
    if (!trainTravelTreatySuccess) {
      process.exit(1)
    }

    console.log("All schemas generated successfully!")
  } catch (error) {
    console.error("❌ Error during code generation:", error.message)
    process.exit(1)
  }
})()
