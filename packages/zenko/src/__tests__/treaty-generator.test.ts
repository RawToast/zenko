import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { tictactoeYamlPath } from "@zenko/specs"
import { parseOperations } from "../core/operation-parser"
import type { OpenAPISpec } from "../zenko"
import { toCamelCase } from "../utils/string-utils"
import type { OperationMeta } from "../utils/treaty-tree"
import { parseYaml } from "../utils/yaml"
import { generateTreatyModuleFromMetadata } from "../treaty-generator"

function metadataFromSpec(spec: OpenAPISpec): Record<string, OperationMeta> {
  const nameMap = new Map<string, string>()
  if (spec.components?.schemas) {
    for (const name of Object.keys(spec.components.schemas)) {
      nameMap.set(name, toCamelCase(name))
    }
  }

  const metadata: Record<string, OperationMeta> = {}
  for (const op of parseOperations(spec, nameMap)) {
    metadata[toCamelCase(op.operationId)] = {
      method: op.method,
      path: op.path,
      ...(op.successResponses ? { successResponses: op.successResponses } : {}),
      ...(op.errorResponses ? { errorResponses: op.errorResponses } : {}),
      ...(op.errorStatusKeys ? { errorStatusKeys: op.errorStatusKeys } : {}),
    }
  }
  return metadata
}

describe("generateTreatyModuleFromMetadata", () => {
  test("emits treaty module with nested routes for tictactoe", () => {
    const yaml = fs.readFileSync(tictactoeYamlPath, "utf8")
    const spec = parseYaml(yaml) as OpenAPISpec
    const metadata = metadataFromSpec(spec)

    const output = generateTreatyModuleFromMetadata(metadata, {
      importPath: "./tictactoe.gen",
    })

    expect(output).toContain("import {")
    expect(output).toContain("createTreatyClient")
    expect(output).toContain("export const operations = {")
    expect(output).toContain("export const operationMetadata =")
    expect(output).toContain("export const treatyRoutes = {")
    expect(output).toContain("export function createClient(")
    expect(output).toContain("getBoard")
    expect(output).toContain("getSquare")
    expect(output).toContain("putSquare")
    expect(output).toContain("board: {")
    expect(output).toContain("getSquare,")
    expect(output).toContain("putSquare,")
  })
})
