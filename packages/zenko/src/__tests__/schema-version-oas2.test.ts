import { describe, test, expect } from "bun:test"

import { blockscoutYamlPath } from "@zenko/specs"

import { generate, type OpenAPISpec } from "../zenko"
import {
  normalizeOas2ToOas3,
  normalizeSpecForSchemaVersion,
  resolveSchemaVersion,
} from "../utils/normalize-oas2"
import { loadOpenAPISpec } from "../utils/yaml"

describe("resolveSchemaVersion", () => {
  const swagger2 = { swagger: "2.0", info: {}, paths: {} } as OpenAPISpec
  const openapi3 = { openapi: "3.0.0", info: {}, paths: {} } as OpenAPISpec

  test("auto detects swagger 2.0", () => {
    expect(resolveSchemaVersion(swagger2, "auto")).toBe("oas2")
  })

  test("auto treats openapi as oas3", () => {
    expect(resolveSchemaVersion(openapi3, "auto")).toBe("oas3")
  })

  test("explicit oas2/oas3 override auto", () => {
    expect(resolveSchemaVersion(openapi3, "oas2")).toBe("oas2")
    expect(resolveSchemaVersion(swagger2, "oas3")).toBe("oas3")
  })

  test("normalizeSpecForSchemaVersion only rewrites oas2", () => {
    const asOas2 = normalizeSpecForSchemaVersion(swagger2, "auto")
    expect(asOas2.openapi).toBe("3.0.0")
    expect(asOas2.swagger).toBeUndefined()

    const leftAlone = normalizeSpecForSchemaVersion(openapi3, "auto")
    expect(leftAlone).toBe(openapi3)
  })
})

describe("normalizeOas2ToOas3", () => {
  test("moves definitions and response schemas into OAS3 shape", () => {
    const input: OpenAPISpec = {
      swagger: "2.0",
      info: { title: "Demo", version: "1.0.0" },
      consumes: ["application/json"],
      produces: ["application/json"],
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            parameters: [
              {
                name: "body",
                in: "body",
                required: true,
                schema: { $ref: "#/definitions/Pet" },
              },
              {
                name: "limit",
                in: "query",
                type: "integer",
                required: false,
              },
            ],
            responses: {
              "200": {
                description: "ok",
                schema: { $ref: "#/definitions/Pet" },
              },
              default: {
                description: "error",
                schema: { $ref: "#/definitions/Error" },
              },
            },
          },
        },
      },
      definitions: {
        Pet: {
          type: "object",
          properties: { name: { type: "string" } },
        },
        Error: {
          type: "object",
          properties: { message: { type: "string" } },
        },
      },
      securityDefinitions: {
        ApiKeyAuth: { type: "apiKey", name: "x-api-key", in: "header" },
      },
    }

    const normalized = normalizeOas2ToOas3(input)

    expect(normalized.openapi).toBe("3.0.0")
    expect(normalized.swagger).toBeUndefined()
    expect(normalized.definitions).toBeUndefined()
    expect(normalized.components?.schemas?.Pet).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
    })
    expect(normalized.components?.securitySchemes?.ApiKeyAuth).toEqual({
      type: "apiKey",
      name: "x-api-key",
      in: "header",
    })

    const operation = (normalized.paths["/pets"] as any).post
    expect(operation.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/Pet",
    })
    expect(operation.parameters).toEqual([
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer" },
      },
    ])
    expect(
      operation.responses["200"].content["application/json"].schema
    ).toEqual({
      $ref: "#/components/schemas/Pet",
    })
    expect(
      operation.responses.default.content["application/json"].schema
    ).toEqual({
      $ref: "#/components/schemas/Error",
    })

    // Original input must not be mutated
    expect(input.definitions).toBeDefined()
    expect(input.swagger).toBe("2.0")
  })

  test("converts formData parameters into multipart requestBody", () => {
    const normalized = normalizeOas2ToOas3({
      swagger: "2.0",
      info: {},
      paths: {
        "/upload": {
          post: {
            operationId: "upload",
            parameters: [
              {
                name: "file",
                in: "formData",
                type: "file",
                required: true,
              },
              {
                name: "note",
                in: "formData",
                type: "string",
              },
            ],
            responses: { "204": { description: "ok" } },
          },
        },
      },
    })

    const operation = (normalized.paths["/upload"] as any).post
    expect(operation.requestBody.content["multipart/form-data"].schema).toEqual(
      {
        type: "object",
        properties: {
          file: { type: "string", format: "binary" },
          note: { type: "string" },
        },
        required: ["file"],
      }
    )
    expect(operation.parameters).toEqual([])
  })

  test("uses application/x-www-form-urlencoded when consumes specifies it", () => {
    const normalized = normalizeOas2ToOas3({
      swagger: "2.0",
      info: {},
      consumes: ["application/x-www-form-urlencoded"],
      paths: {
        "/login": {
          post: {
            operationId: "login",
            parameters: [
              {
                name: "username",
                in: "formData",
                type: "string",
                required: true,
              },
              {
                name: "password",
                in: "formData",
                type: "string",
                required: true,
              },
            ],
            responses: { "204": { description: "ok" } },
          },
        },
      },
    })

    const operation = (normalized.paths["/login"] as any).post
    expect(
      operation.requestBody.content["application/x-www-form-urlencoded"].schema
    ).toEqual({
      type: "object",
      properties: {
        username: { type: "string" },
        password: { type: "string" },
      },
      required: ["username", "password"],
    })
    expect(operation.requestBody.content["multipart/form-data"]).toBeUndefined()
  })

  test("operation consumes override global form encoding", () => {
    const normalized = normalizeOas2ToOas3({
      swagger: "2.0",
      info: {},
      consumes: ["multipart/form-data"],
      paths: {
        "/contact": {
          post: {
            operationId: "submitContact",
            consumes: ["application/x-www-form-urlencoded"],
            parameters: [
              {
                name: "email",
                in: "formData",
                type: "string",
                required: true,
              },
            ],
            responses: { "204": { description: "ok" } },
          },
        },
      },
    })

    const operation = (normalized.paths["/contact"] as any).post
    expect(
      operation.requestBody.content["application/x-www-form-urlencoded"].schema
    ).toEqual({
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    })
  })

  test("resolves reusable parameters and responses", () => {
    const input = {
      swagger: "2.0",
      info: {},
      parameters: {
        PetBody: {
          name: "body",
          in: "body",
          required: true,
          schema: { $ref: "#/definitions/Pet" },
        },
        Limit: {
          name: "limit",
          in: "query",
          type: "integer",
        },
      },
      responses: {
        PetResponse: {
          description: "ok",
          schema: { $ref: "#/definitions/Pet" },
        },
        ErrorResponse: {
          description: "error",
          schema: { $ref: "#/definitions/Error" },
        },
      },
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            parameters: [
              { $ref: "#/parameters/PetBody" },
              { $ref: "#/parameters/Limit" },
            ],
            responses: {
              "200": { $ref: "#/responses/PetResponse" },
              default: { $ref: "#/responses/ErrorResponse" },
            },
          },
        },
      },
      definitions: {
        Pet: { type: "object", properties: { name: { type: "string" } } },
        Error: {
          type: "object",
          properties: { message: { type: "string" } },
        },
      },
    } as OpenAPISpec

    const normalized = normalizeOas2ToOas3(input)
    const operation = (normalized.paths["/pets"] as any).post

    expect(operation.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/Pet",
    })
    expect(operation.parameters).toEqual([
      {
        name: "limit",
        in: "query",
        schema: { type: "integer" },
      },
    ])
    expect(
      operation.responses["200"].content["application/json"].schema
    ).toEqual({ $ref: "#/components/schemas/Pet" })
    expect(
      operation.responses.default.content["application/json"].schema
    ).toEqual({ $ref: "#/components/schemas/Error" })

    const result = generate(input)
    expect(result).toContain(
      "typeof Pet,\n  typeof Pet,\n  undefined,\n  OperationErrors<{ defaultError: typeof Error }>"
    )
  })

  test("converts inherited path-level body parameters", () => {
    const input: OpenAPISpec = {
      swagger: "2.0",
      info: {},
      paths: {
        "/pets": {
          parameters: [
            {
              name: "body",
              in: "body",
              required: true,
              schema: { $ref: "#/definitions/Pet" },
            },
          ],
          post: {
            operationId: "createPet",
            responses: {
              "200": {
                description: "ok",
                schema: { $ref: "#/definitions/Pet" },
              },
            },
          },
        },
      },
      definitions: {
        Pet: { type: "object", properties: { name: { type: "string" } } },
      },
    }

    const normalized = normalizeOas2ToOas3(input)
    const operation = (normalized.paths["/pets"] as any).post

    expect(operation.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/Pet",
    })
    expect(operation.parameters).toEqual([])

    const result = generate(input)
    expect(result).toContain("typeof Pet,\n  typeof Pet,\n  undefined")
  })
})

describe("schemaVersion with blockscout (Swagger 2.0)", () => {
  const blockscoutSpec = loadOpenAPISpec(blockscoutYamlPath)

  test("auto generates response schemas and types from definitions", () => {
    const result = generate(blockscoutSpec, { schemaVersion: "auto" })

    expect(result).toContain("// Generated Zod Schemas")
    expect(result).toContain("export const v1Counters")
    expect(result).toContain("export const rpcStatus")
    expect(result).toContain("export type StatsService_GetCountersOperation")
    expect(result).toContain("typeof v1Counters")
    expect(result).toContain("typeof rpcStatus")
    expect(result).toContain("export const securitySchemes")
    expect(result).toContain("ApiKeyAuth")
  })

  test("oas3 skips normalization and leaves responses undefined", () => {
    const result = generate(blockscoutSpec, { schemaVersion: "oas3" })

    expect(result).not.toContain("// Generated Zod Schemas")
    expect(result).toContain("OperationErrors<{ defaultError: undefined }>")
  })
})
