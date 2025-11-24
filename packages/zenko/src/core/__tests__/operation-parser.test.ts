import { describe, expect, it } from "bun:test"
import type { OpenAPISpec } from "../../zenko"
import { parseOperations } from "../operation-parser"

describe("parseOperations", () => {
  it("collects request metadata, parameters, and error buckets", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {
        "/pets/{petId}": {
          get: {
            operationId: "getPet",
            parameters: [
              {
                in: "query",
                name: "includeVaccinations",
                schema: { type: "boolean" },
              },
              {
                in: "header",
                name: "x-trace-id",
                schema: { type: "string" },
                required: true,
              },
            ],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Pet" },
                  },
                },
              },
              "404": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { message: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }
    const nameMap = new Map([
      ["Pet", "pet"],
      ["Error", "error"],
    ])

    const operations = parseOperations(spec, nameMap)
    expect(operations).toHaveLength(1)

    const [operation] = operations
    expect(operation?.method).toBe("get")
    expect(operation?.path).toBe("/pets/{petId}")
    expect(operation?.pathParams).toEqual([{ name: "petId", type: "string" }])
    expect(operation?.queryParams).toEqual([
      {
        name: "includeVaccinations",
        description: undefined,
        schema: { type: "boolean" },
        required: undefined,
      },
    ])
    expect(operation?.requestHeaders).toEqual([
      {
        name: "x-trace-id",
        description: undefined,
        schema: { type: "string" },
        required: true,
      },
    ])
    expect(operation?.requestType).toBeUndefined()
    expect(operation?.responseType).toBe("pet")
    expect(operation?.errors).toEqual({
      notFound: "GetPetNotFound",
    })
  })

  it("handles webhook operations and inferred response literals", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: {},
      paths: {
        "/logs": {
          post: {
            operationId: "createLog",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { status: { type: "string" } },
                  },
                },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Log" },
                  },
                },
              },
              "302": {
                description: "redirects elsewhere",
                content: {},
              } as any,
            },
          },
        },
      },
      webhooks: {
        onPetStatus: {
          post: {
            operationId: "petStatus",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PetStatus" },
                },
              },
            },
            responses: {
              "204": {
                description: "no body",
              },
              "500": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Error" },
                  },
                },
              },
            },
          },
        },
      },
    }

    const nameMap = new Map([
      ["Log", "log"],
      ["PetStatus", "petStatus"],
      ["Error", "error"],
    ])

    const operations = parseOperations(spec, nameMap)
    expect(operations).toHaveLength(2)

    const [pathOp, webhookOp] = operations
    expect(pathOp?.responseType).toBe("log")
    expect(pathOp?.errors).toBeUndefined()

    expect(webhookOp?.path).toBe("onPetStatus")
    expect(webhookOp?.requestType).toBe("PetStatus")
    expect(webhookOp?.responseType).toBe("undefined")
    expect(webhookOp?.errors).toEqual({
      internalServerError: "error",
    })
  })
})
