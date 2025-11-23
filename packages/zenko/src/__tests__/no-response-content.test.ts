import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("No Response Content", () => {
  test("generates complete TypeScript output", () => {
    const content = fs.readFileSync(
      "src/resources/no-response-content.yaml",
      "utf8"
    )
    const specYaml = parseYaml(content)
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("no-response-content-complete-output")
  })
})
