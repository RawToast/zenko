import { describe, test, expect } from "bun:test"
import { collectReferencedSchemas } from "../collect-referenced-schemas"
import type { Operation } from "../../types/operation"
import type { OpenAPISpec } from "../../zenko"

describe("collectReferencedSchemas", () => {
  test("collects schemas from request body $ref", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          post: {
            operationId: "createTest",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TestRequest" },
                },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        schemas: {
          TestRequest: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "createTest",
        path: "/test",
        method: "post",
        pathParams: [],
        queryParams: [],
        requestType: "TestRequest",
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("TestRequest")).toBe(true)
    expect(result.size).toBe(1)
  })

  test("collects schemas from response $ref", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/TestResponse" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          TestResponse: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [],
        responseType: "TestResponse",
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("TestResponse")).toBe(true)
    expect(result.size).toBe(1)
  })

  test("collects schemas from query parameters", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            parameters: [
              {
                name: "filter",
                in: "query",
                schema: { $ref: "#/components/schemas/Filter" },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        schemas: {
          Filter: {
            type: "object",
            properties: { value: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [
          {
            name: "filter",
            schema: { $ref: "#/components/schemas/Filter" },
          },
        ],
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("Filter")).toBe(true)
    expect(result.size).toBe(1)
  })

  test("collects schemas from array item $ref", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            parameters: [
              {
                name: "ids",
                in: "query",
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Id" },
                },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        schemas: {
          Id: {
            type: "string",
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [
          {
            name: "ids",
            schema: {
              type: "array",
              items: { $ref: "#/components/schemas/Id" },
            },
          },
        ],
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("Id")).toBe(true)
    expect(result.size).toBe(1)
  })

  test("collects schemas from request headers", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            parameters: [
              {
                name: "X-Custom-Header",
                in: "header",
                schema: { $ref: "#/components/schemas/CustomHeader" },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        schemas: {
          CustomHeader: {
            type: "string",
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [],
        requestHeaders: [
          {
            name: "X-Custom-Header",
            schema: { $ref: "#/components/schemas/CustomHeader" },
          },
        ],
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("CustomHeader")).toBe(true)
    expect(result.size).toBe(1)
  })

  test("follows $ref chains to collect transitive dependencies", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          User: {
            type: "object",
            properties: {
              profile: { $ref: "#/components/schemas/Profile" },
            },
          },
          Profile: {
            type: "object",
            properties: {
              address: { $ref: "#/components/schemas/Address" },
            },
          },
          Address: {
            type: "object",
            properties: { street: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [],
        responseType: "User",
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("User")).toBe(true)
    expect(result.has("Profile")).toBe(true)
    expect(result.has("Address")).toBe(true)
    expect(result.size).toBe(3)
  })

  test("collects schemas from inline request schemas", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          post: {
            operationId: "createTest",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      nested: { $ref: "#/components/schemas/Nested" },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        schemas: {
          Nested: {
            type: "object",
            properties: { value: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "createTest",
        path: "/test",
        method: "post",
        pathParams: [],
        queryParams: [],
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("Nested")).toBe(true)
    expect(result.size).toBe(1)
  })

  test("collects schemas from inline response schemas", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/Data" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Data: {
            type: "object",
            properties: { id: { type: "number" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [],
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("Data")).toBe(true)
    expect(result.size).toBe(1)
  })

  test("handles multiple operations", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/users": {
          get: {
            operationId: "listUsers",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/UserList" },
                  },
                },
              },
            },
          },
        },
        "/posts": {
          get: {
            operationId: "listPosts",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/PostList" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          UserList: {
            type: "array",
            items: { $ref: "#/components/schemas/User" },
          },
          PostList: {
            type: "array",
            items: { $ref: "#/components/schemas/Post" },
          },
          User: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          Post: {
            type: "object",
            properties: { title: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "listUsers",
        path: "/users",
        method: "get",
        pathParams: [],
        queryParams: [],
        responseType: "UserList",
      },
      {
        operationId: "listPosts",
        path: "/posts",
        method: "get",
        pathParams: [],
        queryParams: [],
        responseType: "PostList",
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("UserList")).toBe(true)
    expect(result.has("PostList")).toBe(true)
    expect(result.has("User")).toBe(true)
    expect(result.has("Post")).toBe(true)
    expect(result.size).toBe(4)
  })

  test("handles webhooks", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
      webhooks: {
        "webhook.example.com": {
          post: {
            operationId: "webhookHandler",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WebhookPayload" },
                },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        schemas: {
          WebhookPayload: {
            type: "object",
            properties: { event: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "webhookHandler",
        path: "webhook.example.com",
        method: "post",
        pathParams: [],
        queryParams: [],
        requestType: "WebhookPayload",
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.has("WebhookPayload")).toBe(true)
    expect(result.size).toBe(1)
  })

  test("handles empty operations array", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
      components: {
        schemas: {
          Unused: {
            type: "object",
            properties: { value: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = []
    const result = collectReferencedSchemas(operations, spec)

    expect(result.size).toBe(0)
  })

  test("handles operations with no matching raw operation", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
      components: {
        schemas: {
          Test: {
            type: "object",
            properties: { value: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "nonExistent",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [],
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    expect(result.size).toBe(0)
  })

  test("handles error response schemas", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Success" },
                  },
                },
              },
              "400": {
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
      components: {
        schemas: {
          Success: {
            type: "object",
            properties: { data: { type: "string" } },
          },
          Error: {
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [],
        responseType: "Success",
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    // Should include both success and error schemas
    expect(result.has("Success")).toBe(true)
    expect(result.has("Error")).toBe(true)
    expect(result.size).toBe(2)
  })

  test("handles circular dependencies gracefully", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/A" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          A: {
            type: "object",
            properties: {
              b: { $ref: "#/components/schemas/B" },
            },
          },
          B: {
            type: "object",
            properties: {
              a: { $ref: "#/components/schemas/A" },
            },
          },
        },
      },
    }

    const operations: Operation[] = [
      {
        operationId: "getTest",
        path: "/test",
        method: "get",
        pathParams: [],
        queryParams: [],
        responseType: "A",
      },
    ]

    const result = collectReferencedSchemas(operations, spec)

    // Should include both schemas despite circular dependency
    expect(result.has("A")).toBe(true)
    expect(result.has("B")).toBe(true)
    expect(result.size).toBe(2)
  })
})
