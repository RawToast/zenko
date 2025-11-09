import { describe, test, expect } from "bun:test"
import { analyzeZenkoUsage, generateZenkoImport } from "../tree-shaking"
import type { RequestMethod } from "../../types"

describe("tree-shaking", () => {
  test("analyzes basic usage correctly", () => {
    const operations = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get" as RequestMethod,
        pathParams: [],
        queryParams: [],
        requestType: "TestRequest",
        responseType: "TestResponse",
        requestHeaders: [],
        errors: undefined,
      },
    ]

    const usage = analyzeZenkoUsage(operations)

    expect(usage.usesOperationDefinition).toBe(true)
    expect(usage.usesHeaderFn).toBe(false)
    expect(usage.usesOperationErrors).toBe(true) // Used as default type
  })

  test("PathFn is never used in package/file mode", () => {
    const operations = [
      {
        operationId: "getUser",
        path: "/users/{id}",
        method: "get" as RequestMethod,
        pathParams: [{ name: "id", type: "string" }],
        queryParams: [],
        requestType: undefined,
        responseType: "User",
        requestHeaders: [],
        errors: undefined,
      },
    ]

    const usage = analyzeZenkoUsage(operations)
    // PathFn should never be used in package/file mode
    expect(usage.usesOperationDefinition).toBe(true)
    expect(usage.usesHeaderFn).toBe(false)
    expect(usage.usesOperationErrors).toBe(true)
  })

  test("HeaderFn is never used in package/file mode", () => {
    const operations = [
      {
        operationId: "createUser",
        path: "/users",
        method: "post" as RequestMethod,
        pathParams: [],
        queryParams: [],
        requestType: "CreateUserRequest",
        responseType: "User",
        requestHeaders: [
          {
            name: "authorization",
            description: "Auth header",
            schema: { type: "string" },
            required: true,
          },
        ],
        errors: undefined,
      },
    ]

    const usage = analyzeZenkoUsage(operations)
    // HeaderFn is never used because generated code uses `typeof headers.xxx`
    expect(usage.usesHeaderFn).toBe(false)
  })

  test("detects OperationErrors usage", () => {
    const operations = [
      {
        operationId: "getError",
        path: "/error",
        method: "get" as RequestMethod,
        pathParams: [],
        queryParams: [],
        requestType: undefined,
        responseType: undefined,
        requestHeaders: [],
        errors: { badRequest: "string" },
      },
    ]

    const usage = analyzeZenkoUsage(operations)
    expect(usage.usesOperationErrors).toBe(true)
  })

  test("generates correct import statements", () => {
    const usage = {
      usesHeaderFn: false,
      usesOperationDefinition: true,
      usesOperationErrors: true,
    }

    const packageImport = generateZenkoImport(usage, "package")
    expect(packageImport).toBe(
      'import type { OperationDefinition, OperationErrors } from "zenko";'
    )

    const fileImport = generateZenkoImport(usage, "file", "./types")
    expect(fileImport).toBe(
      'import type { OperationDefinition, OperationErrors } from "./types";'
    )
  })

  test("returns empty import when no types used", () => {
    const usage = {
      usesHeaderFn: false,
      usesOperationDefinition: false,
      usesOperationErrors: false,
    }

    const importStatement = generateZenkoImport(usage, "package")
    expect(importStatement).toBe("")
  })
})
