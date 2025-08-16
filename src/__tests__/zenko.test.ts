import { describe, it, expect } from "bun:test"
import { OpenAPIGenerator, type OpenAPISpec } from "../zenko"
import * as fs from "fs"
import jsYaml from "js-yaml"

describe("OpenAPIGenerator", () => {
  it("can generate a valid schema given a spec", () => {
    const petstoreContent = fs.readFileSync(
      "src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(petstoreContent) as OpenAPISpec
    const generator = new OpenAPIGenerator(specYaml)
    const result = generator.generate()

    expect(result).toMatchSnapshot()
  })
})
