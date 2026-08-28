import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { petstoreYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("Selective Operations", () => {
  test("generates only selected operations and their referenced schemas", () => {
    const petstoreContent = fs.readFileSync(petstoreYamlPath, "utf8")
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
    const petstoreContent = fs.readFileSync(petstoreYamlPath, "utf8")
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
    const petstoreContent = fs.readFileSync(petstoreYamlPath, "utf8")
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
    const petstoreContent = fs.readFileSync(petstoreYamlPath, "utf8")
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

  test("matches original and emitted operationIds", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Dotted Ops", version: "1.0.0" },
      paths: {
        "/batch": {
          get: {
            operationId:
              "BlockScoutWeb.API.V2.TransactionController.zksync_batch",
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { id: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
        "/other": {
          get: {
            operationId: "otherOp",
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }

    const withDots = generate(spec, {
      operationIds: ["BlockScoutWeb.API.V2.TransactionController.zksync_batch"],
    })
    expect(withDots).toContain(
      "BlockScoutWebAPIV2TransactionControllerZksync_batch:"
    )
    expect(withDots).not.toContain("otherOp:")

    const emitted = generate(spec, {
      operationIds: ["BlockScoutWebAPIV2TransactionControllerZksync_batch"],
    })
    expect(emitted).toContain(
      "BlockScoutWebAPIV2TransactionControllerZksync_batch:"
    )
    expect(emitted).not.toContain("otherOp:")
  })

  test("prefers exact operationIds over colliding emitted names", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Colliding Ops", version: "1.0.0" },
      paths: {
        "/dotted": {
          get: {
            operationId: "Foo.Bar",
            responses: { "200": { description: "ok" } },
          },
        },
        "/plain": {
          get: {
            operationId: "FooBar",
            responses: { "200": { description: "ok" } },
          },
        },
      },
    }

    const dotted = generate(spec, { operationIds: ["Foo.Bar"] })
    expect(dotted).toContain('() => "/dotted"')
    expect(dotted).not.toContain('() => "/plain"')

    const plain = generate(spec, { operationIds: ["FooBar"] })
    expect(plain).toContain('() => "/plain"')
    expect(plain).not.toContain('() => "/dotted"')
  })

  test("rejects colliding emitted operation names", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Colliding Ops", version: "1.0.0" },
      paths: {
        "/dotted": {
          get: {
            operationId: "Foo.Bar",
            responses: { "200": { description: "ok" } },
          },
        },
        "/hyphenated": {
          get: {
            operationId: "Foo-Bar",
            responses: { "200": { description: "ok" } },
          },
        },
      },
    }

    expect(() => generate(spec)).toThrow(
      'Operation IDs "Foo.Bar" and "Foo-Bar" both generate the name "FooBar"'
    )

    expect(() => generate(spec, { operationIds: ["FooBar"] })).toThrow(
      'Operation ID alias "FooBar" is ambiguous between "Foo.Bar" and "Foo-Bar"'
    )
  })
})
