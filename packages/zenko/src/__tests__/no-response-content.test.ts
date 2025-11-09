import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { generate, type OpenAPISpec } from "../zenko"

describe("No Response Content", () => {
  test("generates complete TypeScript output", () => {
    const content = fs.readFileSync(
      "../zenko-core/src/resources/no-response-content.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(content) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("no-response-content-complete-output")
  })
})
