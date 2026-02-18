import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { tictactoeYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("Security Schemes", () => {
  test("generates security schemes metadata from tictactoe spec", () => {
    const content = fs.readFileSync(tictactoeYamlPath, "utf8")
    const specYaml = parseYaml(content)
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("security-schemes-tictactoe")
  })

  test("generates securitySchemes const with all scheme types", () => {
    const content = fs.readFileSync(tictactoeYamlPath, "utf8")
    const specYaml = parseYaml(content)
    const result = generate(specYaml)

    expect(result).toContain("export const securitySchemes = {")
    // apiKey scheme
    expect(result).toContain('"apiKey"')
    expect(result).toContain('"api-key"')
    expect(result).toContain('"header"')
    // Bearer scheme
    expect(result).toContain('"http"')
    expect(result).toContain('"bearer"')
    expect(result).toContain('"JWT"')
    // OAuth2 scheme
    expect(result).toContain('"oauth2"')
  })

  test("includes security requirements on operation objects", () => {
    const content = fs.readFileSync(tictactoeYamlPath, "utf8")
    const specYaml = parseYaml(content)
    const result = generate(specYaml)

    // getBoard uses defaultApiKey OR app2AppOauth
    expect(result).toContain("security:")

    // getSquare and putSquare use bearerHttpAuthentication OR user2AppOauth
    expect(result).toContain("bearerHttpAuthentication")
  })

  test("handles operation with no security (empty array override)", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      security: [{ bearerAuth: [] }],
      paths: {
        "/public": {
          get: {
            operationId: "get-public",
            security: [],
            responses: { "200": { description: "OK" } },
          },
        },
        "/protected": {
          get: {
            operationId: "get-protected",
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
          },
        },
      },
    }

    const result = generate(spec)

    // Public endpoint should have security: [] (explicit no auth)
    expect(result).toContain("security: [],")

    // Protected endpoint should inherit global security
    expect(result).toContain("bearerAuth")
  })

  test("handles global security inheritance", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      security: [{ apiKey: [] }],
      paths: {
        "/items": {
          get: {
            operationId: "list-items",
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        securitySchemes: {
          apiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
        },
      },
    }

    const result = generate(spec)

    // Should inherit global security
    expect(result).toContain("security:")
    expect(result).toContain("apiKey")
  })

  test("handles spec with no security schemes", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            operationId: "list-items",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }

    const result = generate(spec)

    // Should not contain securitySchemes section
    expect(result).not.toContain("securitySchemes")
    // Should not contain security on operations
    expect(result).not.toContain("security:")
  })

  test("preserves OR semantics (multiple security entries)", () => {
    const content = fs.readFileSync(tictactoeYamlPath, "utf8")
    const specYaml = parseYaml(content)
    const result = generate(specYaml)

    // getBoard: defaultApiKey OR app2AppOauth - should be two entries in the array
    expect(result).toContain("security: [")
  })

  test("generates security type parameter in OperationDefinition", () => {
    const content = fs.readFileSync(tictactoeYamlPath, "utf8")
    const specYaml = parseYaml(content)
    const result = generate(specYaml)

    // Operation types should include security type parameter
    expect(result).toContain("GetBoardOperation = OperationDefinition<")
  })

  test("handles AND semantics (multiple schemes in one requirement)", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/admin": {
          get: {
            operationId: "admin-action",
            security: [{ bearerAuth: [], apiKey: [] }],
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
          apiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
        },
      },
    }

    const result = generate(spec)

    // AND semantics: both schemes in one object
    expect(result).toContain("bearerAuth")
    expect(result).toContain("apiKey")
    // Should be a single entry in the security array (AND, not OR)
    const securityMatch = result.match(/security: \[(\{[^}]+\})\]/)
    expect(securityMatch).not.toBeNull()
  })

  test("generates openIdConnect scheme with openIdConnectUrl", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            operationId: "list-items",
            responses: { "200": { description: "OK" } },
          },
        },
      },
      components: {
        securitySchemes: {
          oidc: {
            type: "openIdConnect",
            openIdConnectUrl:
              "https://auth.example.com/.well-known/openid-configuration",
          },
        },
      },
    }

    const result = generate(spec)

    expect(result).toContain('"openIdConnect"')
    expect(result).toContain(
      '"https://auth.example.com/.well-known/openid-configuration"'
    )
    expect(result).toContain("openIdConnectUrl:")
  })

  test("handles global security: [] (explicitly no auth for entire API)", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      security: [],
      paths: {
        "/public": {
          get: {
            operationId: "get-public",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }

    const result = generate(spec)

    // Global security: [] means no auth at all — should NOT generate security on operations
    expect(result).not.toContain("securitySchemes")
  })

  test("works with types disabled", () => {
    const content = fs.readFileSync(tictactoeYamlPath, "utf8")
    const specYaml = parseYaml(content)
    const result = generate(specYaml, { types: { emit: false } })

    // Should still generate securitySchemes and security on operations
    expect(result).toContain("export const securitySchemes = {")
    expect(result).toContain("security:")

    // Should not generate type definitions
    expect(result).not.toContain("GetBoardOperation =")
  })
})
