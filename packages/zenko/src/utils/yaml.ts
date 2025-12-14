import * as fs from "fs"
import type { OpenAPISpec } from "../zenko"

/**
 * Parse YAML content into an OpenAPI specification
 * @param content - The YAML content to parse
 * @returns The OpenAPI specification
 */
export function parseYaml(content: string): OpenAPISpec {
  return Bun.YAML.parse(content) as OpenAPISpec
}

/**
 * Load and parse an OpenAPI spec from a YAML file
 * @param filePath - The path to the YAML file to load
 * @returns The OpenAPI specification
 */
export function loadOpenAPISpec(filePath: string): OpenAPISpec {
  const content = fs.readFileSync(filePath, "utf8")
  return parseYaml(content)
}
