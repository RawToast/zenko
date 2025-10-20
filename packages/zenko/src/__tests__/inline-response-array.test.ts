import { describe, test, expect } from "bun:test"
import jsYaml from "js-yaml"
import { generate, type OpenAPISpec } from "../zenko"
import { inlineResponseArray } from "@zenko/resources"

describe("Inline Response Array", () => {
  test("generates complete TypeScript output", () => {
    const specYaml = jsYaml.load(inlineResponseArray) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("inline-response-array-complete-output")
  })
})
