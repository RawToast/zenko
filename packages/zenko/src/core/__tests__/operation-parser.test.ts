import * as fs from "fs"
import { describe, expect, it } from "bun:test"
import { tictactoeYamlPath } from "@zenko/specs"
import type { OpenAPISpec } from "../../zenko"
import { toCamelCase } from "../../utils/string-utils"
import { parseYaml } from "../../utils/yaml"
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
    expect(operation?.successResponses).toEqual({ "200": "pet" })
    expect(operation?.errorResponses).toEqual({ "404": "GetPetNotFound" })
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
    expect(pathOp?.successResponses).toEqual({
      "201": "log",
      "302": "undefined",
    })
    expect(pathOp?.errors).toBeUndefined()

    expect(webhookOp?.path).toBe("onPetStatus")
    expect(webhookOp?.requestType).toBe("petStatus")
    expect(webhookOp?.responseType).toBe("undefined")
    expect(webhookOp?.successResponses).toEqual({ "204": "undefined" })
    expect(webhookOp?.errorResponses).toEqual({ "500": "error" })
    expect(webhookOp?.errors).toEqual({
      internalServerError: "error",
    })
  })

  it("preserves success and error response status maps for tictactoe getSquare", () => {
    const yaml = fs.readFileSync(tictactoeYamlPath, "utf8")
    const spec = parseYaml(yaml) as OpenAPISpec
    const nameMap = new Map<string, string>()
    if (spec.components?.schemas) {
      for (const name of Object.keys(spec.components.schemas)) {
        nameMap.set(name, toCamelCase(name))
      }
    }

    const operations = parseOperations(spec, nameMap)
    const getSquare = operations.find((op) => op.operationId === "get-square")

    expect(getSquare).toMatchObject({
      operationId: "get-square",
      path: "/board/{row}/{column}",
      method: "get",
      successResponses: { "200": "mark" },
      errorResponses: { "400": "errorMessage" },
    })
  })
})
