import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { mixedHeadersYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("Mixed Headers", () => {
  test("generates complete TypeScript output", () => {
    const content = fs.readFileSync(mixedHeadersYamlPath, "utf8")
    const specYaml = parseYaml(content)
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("mixed-headers-complete-output")
  })
})
