import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { generate, type OpenAPISpec } from "../zenko"

describe("Inline Response Array", () => {
  test("generates complete TypeScript output", () => {
    const content = fs.readFileSync(
      "src/resources/inline-response-array.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(content) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("inline-response-array-complete-output")
  })
})
