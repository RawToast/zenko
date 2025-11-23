import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

const webhookOnlySpec: any = {
  openapi: "3.1.0",
  info: { title: "Webhook API", version: "1.0.0" },
  webhooks: {
    newPet: {
      post: {
        operationId: "newPet",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Pet" },
            },
          },
        },
        responses: {
          "200": {
            description: "Success",
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        required: ["id", "name"],
        properties: {
          id: { type: "integer", format: "int64" },
          name: { type: "string" },
          tag: { type: "string" },
        },
      },
    },
  },
}

describe("Webhook Example", () => {
  test("should process webhook operations", () => {
    const result = generate(webhookOnlySpec)

    // Should generate Pet schema
    expect(result).toContain("export const Pet =")
    expect(result).toContain("export type Pet =")

    // Should generate Pet schema with correct properties
    expect(result).toContain("id: z.number().int(),")

    // Should generate webhook operations
    expect(result).toContain("export const newPet:")
    expect(result).toContain("export const newPet: NewPetOperation =")
    expect(result).toContain('method: "post"')
    expect(result).toContain("request: Pet")
  })

  test("should generate complete TypeScript output for webhook-only spec", () => {
    const webhookContent = fs.readFileSync(
      "src/resources/webhook-example.yaml",
      "utf8"
    )
    const specYaml = parseYaml(webhookContent) as any
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("webhook-complete-output")
  })

  test("should handle mixed paths and webhooks", () => {
    const mixedSpec: any = {
      openapi: "3.1.0",
      info: { title: "Mixed API", version: "1.0.0" },
      paths: {
        "/pets": {
          get: {
            operationId: "listPets",
            responses: {
              "200": {
                description: "List of pets",
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Pet" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      webhooks: {
        newPet: {
          post: {
            operationId: "newPet",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Pet" },
                },
              },
            },
            responses: {
              "200": {
                description: "Success",
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Pet: {
            required: ["id", "name"],
            properties: {
              id: { type: "integer", format: "int64" },
              name: { type: "string" },
              tag: { type: "string" },
            },
          },
        },
      },
    }

    const result = generate(mixedSpec)

    // Should generate path operations
    expect(result).toContain("export const listPets: ListPetsOperation =")
    expect(result).toContain('method: "get"')

    // Should also generate webhook operations
    expect(result).toContain("export const newPet: NewPetOperation =")
    expect(result).toContain('method: "post"')

    expect(result).toMatchSnapshot("webhook-mixed-output")
  })
})
