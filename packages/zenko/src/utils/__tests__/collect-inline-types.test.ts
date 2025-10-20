import { describe, test, expect } from "bun:test"
import {
  collectInlineRequestTypes,
  collectInlineResponseTypes,
} from "../collect-inline-types"
import type { Operation } from "../../types/operation"

describe("collectInlineTypes", () => {
  const mockOperation: Operation = {
    operationId: "test-operation",
    path: "/test",
    method: "post",
    pathParams: [],
    queryParams: [],
  }

  describe("collectInlineRequestTypes", () => {
    test("should collect inline request schemas", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationRequest")).toBe(true)
      expect(result.get("TestOperationRequest")).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
        },
      })
    })

    test("should collect request schemas with allOf", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      allOf: [
                        { $ref: "#/components/schemas/Base" },
                        {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationRequest")).toBe(true)
    })

    test("should collect request schemas with oneOf", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      oneOf: [
                        { $ref: "#/components/schemas/TypeA" },
                        { $ref: "#/components/schemas/TypeB" },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationRequest")).toBe(true)
    })

    test("should collect request schemas with anyOf", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      anyOf: [
                        { $ref: "#/components/schemas/TypeA" },
                        { $ref: "#/components/schemas/TypeB" },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationRequest")).toBe(true)
    })

    test("should not collect simple $ref request schemas", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/ExistingType",
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(0)
    })

    test("should not collect request schemas without application/json content", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "text/plain": {
                    schema: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(0)
    })

    test("should not collect request schemas without content", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {},
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(0)
    })

    test("should handle webhook request schemas", () => {
      const operations = [mockOperation]
      const spec = {
        webhooks: {
          "webhook-name": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        data: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationRequest")).toBe(true)
    })

    test("should handle hyphenated operation IDs", () => {
      const hyphenatedOperation: Operation = {
        operationId: "test-operation-with-hyphens",
        path: "/test",
        method: "post",
        pathParams: [],
        queryParams: [],
      }
      const operations = [hyphenatedOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation-with-hyphens",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationWithHyphensRequest")).toBe(true)
    })

    test("should handle empty operations array", () => {
      const operations: Operation[] = []
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(0)
    })

    test("should handle empty spec", () => {
      const operations = [mockOperation]
      const spec = {}

      const result = collectInlineRequestTypes(operations, spec)

      expect(result.size).toBe(0)
    })
  })

  describe("collectInlineResponseTypes", () => {
    test("should collect inline response schemas", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationResponse")).toBe(true)
      expect(result.get("TestOperationResponse")).toEqual({
        type: "object",
        properties: {
          id: { type: "string" },
        },
      })
    })

    test("should collect response schemas with allOf", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        allOf: [
                          { $ref: "#/components/schemas/Base" },
                          {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationResponse")).toBe(true)
    })

    test("should collect response schemas with oneOf", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        oneOf: [
                          { $ref: "#/components/schemas/TypeA" },
                          { $ref: "#/components/schemas/TypeB" },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationResponse")).toBe(true)
    })

    test("should collect response schemas with anyOf", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        anyOf: [
                          { $ref: "#/components/schemas/TypeA" },
                          { $ref: "#/components/schemas/TypeB" },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationResponse")).toBe(true)
    })

    test("should not collect simple $ref response schemas", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ExistingType",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(0)
    })

    test("should only collect 2xx response schemas", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          success: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
                "201": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                        },
                      },
                    },
                  },
                },
                "400": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          error: { type: "string" },
                        },
                      },
                    },
                  },
                },
                "500": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          error: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationResponse")).toBe(true)
      // Should collect both 200 and 201 responses with the same type name
      // The last one processed (201) should win
      expect(result.get("TestOperationResponse")).toEqual({
        type: "object",
        properties: {
          id: { type: "string" },
        },
      })
    })

    test("should not collect response schemas without application/json content", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "text/plain": {
                      schema: {
                        type: "string",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(0)
    })

    test("should not collect response schemas without content", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "204": {},
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(0)
    })

    test("should handle webhook response schemas", () => {
      const operations = [mockOperation]
      const spec = {
        webhooks: {
          "webhook-name": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          received: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationResponse")).toBe(true)
    })

    test("should handle hyphenated operation IDs", () => {
      const hyphenatedOperation: Operation = {
        operationId: "test-operation-with-hyphens",
        path: "/test",
        method: "post",
        pathParams: [],
        queryParams: [],
      }
      const operations = [hyphenatedOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation-with-hyphens",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(1)
      expect(result.has("TestOperationWithHyphensResponse")).toBe(true)
    })

    test("should handle empty operations array", () => {
      const operations: Operation[] = []
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(0)
    })

    test("should handle empty spec", () => {
      const operations = [mockOperation]
      const spec = {}

      const result = collectInlineResponseTypes(operations, spec)

      expect(result.size).toBe(0)
    })
  })

  describe("combined behavior", () => {
    test("should collect both request and response types from the same operation", () => {
      const operations = [mockOperation]
      const spec = {
        paths: {
          "/test": {
            post: {
              operationId: "test-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const requestTypes = collectInlineRequestTypes(operations, spec)
      const responseTypes = collectInlineResponseTypes(operations, spec)

      expect(requestTypes.size).toBe(1)
      expect(requestTypes.has("TestOperationRequest")).toBe(true)

      expect(responseTypes.size).toBe(1)
      expect(responseTypes.has("TestOperationResponse")).toBe(true)
    })

    test("should handle mixed paths and webhooks", () => {
      const pathOperation: Operation = {
        operationId: "path-operation",
        path: "/path",
        method: "post",
        pathParams: [],
        queryParams: [],
      }
      const webhookOperation: Operation = {
        operationId: "webhook-operation",
        path: "webhook-name",
        method: "post",
        pathParams: [],
        queryParams: [],
      }
      const operations = [pathOperation, webhookOperation]
      const spec = {
        paths: {
          "/path": {
            post: {
              operationId: "path-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        pathData: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        webhooks: {
          "webhook-name": {
            post: {
              operationId: "webhook-operation",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        webhookData: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const requestTypes = collectInlineRequestTypes(operations, spec)

      expect(requestTypes.size).toBe(2)
      expect(requestTypes.has("PathOperationRequest")).toBe(true)
      expect(requestTypes.has("WebhookOperationRequest")).toBe(true)
    })
  })
})
