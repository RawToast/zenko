import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("Selective Operations", () => {
  test("generates only selected operations and their referenced schemas", () => {
    const petstoreContent = fs.readFileSync(
      "src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = parseYaml(petstoreContent)
    const result = generate(specYaml, {
      operationIds: ["listPets", "showPetById"],
    })

    expect(result).toMatchSnapshot("selective-operations-petstore")

    // Should include listPets and showPetById
    expect(result).toContain("listPets:")
    expect(result).toContain("showPetById:")

    // Should NOT include createPets
    expect(result).not.toContain("createPets:")

    // Should include Pet schema (referenced by showPetById response)
    expect(result).toContain("export const Pet =")
    expect(result).toContain("export type Pet =")

    // Should include Pets schema (referenced by listPets response)
    expect(result).toContain("export const Pets =")
    expect(result).toContain("export type Pets =")

    // Should include Error schema (referenced by both operations' error responses)
    expect(result).toContain("export const Error =")
    expect(result).toContain("export type Error =")
  })

  test("generates only single operation when one operationId provided", () => {
    const petstoreContent = fs.readFileSync(
      "src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = parseYaml(petstoreContent)
    const result = generate(specYaml, {
      operationIds: ["listPets"],
    })

    // Should include listPets
    expect(result).toContain("listPets:")

    // Should NOT include other operations
    expect(result).not.toContain("createPets:")
    expect(result).not.toContain("showPetById:")

    // Should include Pets (referenced by listPets)
    expect(result).toContain("export const Pets =")

    // Should include Pet (referenced by Pets array items)
    expect(result).toContain("export const Pet =")

    // Should include Error (referenced by listPets error response)
    expect(result).toContain("export const Error =")
  })

  test("generates all operations when operationIds is empty", () => {
    const petstoreContent = fs.readFileSync(
      "src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = parseYaml(petstoreContent)
    const result = generate(specYaml, {
      operationIds: [],
    })

    // Should include all operations
    expect(result).toContain("listPets:")
    expect(result).toContain("createPets:")
    expect(result).toContain("showPetById:")

    // Should include all schemas
    expect(result).toContain("export const Pet =")
    expect(result).toContain("export const Pets =")
    expect(result).toContain("export const Error =")
  })

  test("generates all operations when operationIds is undefined", () => {
    const petstoreContent = fs.readFileSync(
      "src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = parseYaml(petstoreContent)
    const result = generate(specYaml)

    // Should include all operations
    expect(result).toContain("listPets:")
    expect(result).toContain("createPets:")
    expect(result).toContain("showPetById:")

    // Should include all schemas
    expect(result).toContain("export const Pet =")
    expect(result).toContain("export const Pets =")
    expect(result).toContain("export const Error =")
  })
})
