import * as fs from "fs"
import jsYaml from "js-yaml"
import type { OpenAPISpec } from "../zenko"

const YAML_OPTIONS = { schema: jsYaml.JSON_SCHEMA }

/**
 * Parse YAML content into an OpenAPI specification
 * Always uses JSON_SCHEMA to ensure consistent parsing
 * @param content - The YAML content to parse
 * @returns The OpenAPI specification
 */
export function parseYaml(content: string): OpenAPISpec {
  return jsYaml.load(content, YAML_OPTIONS) as OpenAPISpec
}

/**
 * Load and parse an OpenAPI spec from a YAML file
 * Always uses JSON_SCHEMA to ensure consistent parsing
 * @param filePath - The path to the YAML file to load
 * @returns The OpenAPI specification
 */
export function loadOpenAPISpec(filePath: string): OpenAPISpec {
  const content = fs.readFileSync(filePath, "utf8")
  return parseYaml(content)
}
