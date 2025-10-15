import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import jsYaml from "js-yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe("Mixed Headers", () => {
  test("generates complete TypeScript output", () => {
    const content = fs.readFileSync("src/resources/mixed-headers.yaml", "utf8")
    const specYaml = jsYaml.load(content) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("mixed-headers-complete-output")
  })
})
