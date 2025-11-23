import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("Inline Response Array", () => {
  test("generates complete TypeScript output", () => {
    const content = fs.readFileSync(
      "src/resources/inline-response-array.yaml",
      "utf8"
    )
    const specYaml = parseYaml(content)
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("inline-response-array-complete-output")
  })
})
