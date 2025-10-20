import { describe, test, expect } from "bun:test"
import fs from "fs"
import jsYaml from "js-yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe("tree-shaking with train-travel spec", () => {
  test("correctly tree-shakes imports for complex spec", () => {
    const content = fs.readFileSync("src/resources/train-travel.yaml", "utf8")
    const specYaml = jsYaml.load(content) as OpenAPISpec

    // Without tree-shaking
    const resultWithoutTreeShake = generate(specYaml, {
      types: { treeShake: false },
    })
    expect(resultWithoutTreeShake).toContain(
      'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "zenko";'
    )

    // With tree-shaking enabled
    const resultWithTreeShake = generate(specYaml, {
      types: { treeShake: true },
    })

    // The train-travel spec has path parameters and errors, but no required headers, so should include 2 types
    // PathFn is never included in package/file mode
    expect(resultWithTreeShake).toContain(
      'import type { OperationDefinition, OperationErrors } from "zenko";'
    )
    expect(resultWithTreeShake).not.toContain("PathFn")
    expect(resultWithTreeShake).not.toContain("HeaderFn")

    // Verify the import is only there once
    const importCount = (
      resultWithTreeShake.match(/import type.*from "zenko"/g) || []
    ).length
    expect(importCount).toBe(1)
  })
})
