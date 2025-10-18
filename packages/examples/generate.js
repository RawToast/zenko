import { readFileSync, writeFileSync } from "fs"
import { load } from "js-yaml"
import { generate } from "zenko"

// Read the petstore YAML file
const specContent = readFileSync("./resources/petstore.yaml", "utf8")
const spec = load(specContent)

// Generate TypeScript code
const output = generate(spec)

// Write to schema directory
writeFileSync("./src/schema/petstore.gen.ts", output)

console.log("✅ Generated petstore.gen.ts in src/schema/")
