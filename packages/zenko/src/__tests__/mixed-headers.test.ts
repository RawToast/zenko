import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { generate, type OpenAPISpec } from "../zenko"

describe("Mixed Headers", () => {
  test("generates complete TypeScript output", () => {
    const content = fs.readFileSync(
      "../zenko-core/src/resources/mixed-headers.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(content) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("mixed-headers-complete-output")
  })
})
