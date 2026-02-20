import { describe, test, expect } from "bun:test"
import { fireblocksV2YamlPath } from "@zenko/specs"
import { generate, type OpenAPISpec } from "../zenko"
import { loadOpenAPISpec } from "../utils/yaml"

const simpleSpec: OpenAPISpec = {
  openapi: "3.0.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {
    "/users/{id}": {
      get: {
        operationId: "getUser",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
}

describe("operationTypeSuffix", () => {
  describe("default behavior", () => {
    test("uses 'Operation' suffix by default", () => {
      const result = generate(simpleSpec)

      expect(result).toContain(
        "export type GetUserOperation = OperationDefinition<"
      )
      expect(result).toContain(": GetUserOperation")
    })
  })

  describe("custom suffix", () => {
    test("uses custom suffix when provided", () => {
      const result = generate(simpleSpec, {
        types: { operationTypeSuffix: "ApiOperation" },
      })

      expect(result).toContain(
        "export type GetUserApiOperation = OperationDefinition<"
      )
      expect(result).toContain(": GetUserApiOperation")
      expect(result).not.toContain("GetUserOperation")
    })

    test("empty suffix removes suffix entirely", () => {
      const result = generate(simpleSpec, {
        types: { operationTypeSuffix: "" },
      })

      expect(result).toContain("export type GetUser = OperationDefinition<")
      expect(result).toContain(": GetUser =")
      expect(result).not.toContain("GetUserOperation")
    })

    test("suffix is ignored when types.emit is false", () => {
      const result = generate(simpleSpec, {
        types: { emit: false, operationTypeSuffix: "Custom" },
      })

      expect(result).not.toContain("GetUserCustom")
      expect(result).not.toContain("GetUserOperation")
      expect(result).not.toContain("OperationDefinition<")
    })
  })

  describe("naming collision avoidance", () => {
    test("fireblocks spec: default suffix causes GetTransactionOperation collision", () => {
      const fireblocksSpec = loadOpenAPISpec(fireblocksV2YamlPath)
      const result = generate(fireblocksSpec, {
        operationIds: ["getTransaction"],
      })

      const typeMatches =
        result.match(/export type GetTransactionOperation/g) || []

      expect(typeMatches.length).toBe(2)
      expect(result).toContain("export const GetTransactionOperation =")
    })

    test("fireblocks spec: custom suffix resolves collision", () => {
      const fireblocksSpec = loadOpenAPISpec(fireblocksV2YamlPath)
      const result = generate(fireblocksSpec, {
        operationIds: ["getTransaction"],
        types: { operationTypeSuffix: "Op" },
      })

      expect(result).toContain("export const GetTransactionOperation =")
      expect(result).toContain(
        "export type GetTransactionOp = OperationDefinition<"
      )
      expect(result).toContain(": GetTransactionOp =")
    })

    test("fireblocks spec: custom suffix works across multiple operations", () => {
      const fireblocksSpec = loadOpenAPISpec(fireblocksV2YamlPath)
      const result = generate(fireblocksSpec, {
        operationIds: ["getTransaction", "getTransactions"],
        types: { operationTypeSuffix: "Op" },
      })

      expect(result).toContain(
        "export type GetTransactionOp = OperationDefinition<"
      )
      expect(result).toContain(
        "export type GetTransactionsOp = OperationDefinition<"
      )
      expect(result).toContain("export const GetTransactionOperation =")
    })
  })

  describe("validation", () => {
    test("throws on suffix with spaces", () => {
      expect(() =>
        generate(simpleSpec, {
          types: { operationTypeSuffix: "My Operation" },
        })
      ).toThrow("Invalid operationTypeSuffix")
    })

    test("throws on suffix with hyphens", () => {
      expect(() =>
        generate(simpleSpec, {
          types: { operationTypeSuffix: "my-op" },
        })
      ).toThrow("Invalid operationTypeSuffix")
    })

    test("throws on suffix starting with a number", () => {
      expect(() =>
        generate(simpleSpec, {
          types: { operationTypeSuffix: "123Op" },
        })
      ).toThrow("Invalid operationTypeSuffix")
    })

    test("allows valid suffixes", () => {
      expect(() =>
        generate(simpleSpec, { types: { operationTypeSuffix: "Op" } })
      ).not.toThrow()
      expect(() =>
        generate(simpleSpec, { types: { operationTypeSuffix: "_Op" } })
      ).not.toThrow()
      expect(() =>
        generate(simpleSpec, { types: { operationTypeSuffix: "$Op" } })
      ).not.toThrow()
      expect(() =>
        generate(simpleSpec, { types: { operationTypeSuffix: "" } })
      ).not.toThrow()
    })
  })
})
