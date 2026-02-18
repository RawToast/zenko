# Security Schemes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parse OpenAPI v3.1 `securitySchemes` and `security` arrays to generate type-safe security metadata on operations, plus a fetch-based bearer auth example.

**Architecture:** Follow the existing header generation pattern (parse → type → generate). Generate a `securitySchemes` const with scheme definitions (preserving original scheme names as declared in the spec) and add a `security` field to each operation object with the resolved per-operation requirements. Add a trailing `TSecurity` generic to `OperationDefinition` for type safety (using inline literal types to avoid self-referential `typeof` issues). No Zod schemas for auth (YAGNI — auth credentials are runtime concerns). Resolve global vs per-operation security at generation time. Skip adding `SecurityRequirement` to tree-shaken imports since the generated code uses literal types directly.

**Tech Stack:** TypeScript, Zod, Bun tests, existing tictactoe.yaml spec (already defines apiKey, Bearer, Basic, OAuth2).

---

### Task 1: Add `SecurityRequirement` type and `security` field to `Operation`

**Files:**

- Modify: `packages/zenko/src/types/operation.ts`

**Step 1: Add SecurityRequirement type and update Operation**

```typescript
// Add after RequestHeader type (line 20)

export type SecurityRequirement = Record<string, string[]>

// Update Operation to add security field:
export type Operation = {
  operationId: string
  path: string
  method: RequestMethod
  pathParams: PathParam[]
  queryParams: QueryParam[]
  requestType?: string
  responseType?: string
  requestHeaders?: RequestHeader[]
  errors?: OperationErrorGroup
  security?: SecurityRequirement[]
}
```

**Step 2: Run type check to verify no regressions**

Run: `bun zenko check-types`
Expected: PASS (security is optional, so no existing code breaks)

**Step 3: Commit**

```bash
git add packages/zenko/src/types/operation.ts
git commit -m "feat: add SecurityRequirement type to Operation"
```

---

### Task 2: Parse security schemes from OpenAPI spec

**Files:**

- Modify: `packages/zenko/src/core/operation-parser.ts`
- Modify: `packages/zenko/src/zenko.ts` (extend `OpenAPISpec` type)

**Step 1: Extend OpenAPISpec to include securitySchemes and top-level security**

In `packages/zenko/src/zenko.ts`, update the `OpenAPISpec` type:

```typescript
export type OpenAPISpec = {
  openapi: string
  info: unknown
  paths: Record<string, Record<string, unknown>>
  webhooks?: Record<string, Record<string, unknown>>
  security?: Record<string, string[]>[]
  components?: {
    schemas?: Record<string, unknown>
    parameters?: Record<string, unknown>
    securitySchemes?: Record<string, unknown>
  }
}
```

**Step 2: Add security extraction to operation-parser.ts**

Add a `getOperationSecurity` function and wire it into `parseOperations`:

```typescript
import type {
  Operation,
  OperationErrorGroup,
  PathParam,
  QueryParam,
  RequestHeader,
  SecurityRequirement,
} from "../types/operation"

// Add this function:
function getOperationSecurity(
  operation: unknown,
  spec: OpenAPISpec
): SecurityRequirement[] | undefined {
  const opSecurity = (operation as any).security

  // Explicit per-operation security (including empty array = no auth)
  if (Array.isArray(opSecurity)) {
    if (opSecurity.length === 0) return []
    return opSecurity as SecurityRequirement[]
  }

  // Fall back to global security
  if (Array.isArray(spec.security) && spec.security.length > 0) {
    return spec.security as SecurityRequirement[]
  }

  return undefined
}
```

**Step 3: Wire getOperationSecurity into parseOperations**

In both the `spec.paths` loop and the `spec.webhooks` loop, add:

```typescript
const security = getOperationSecurity(operation, spec)

operations.push({
  operationId: (operation as { operationId: string }).operationId,
  path,
  method: normalizedMethod,
  pathParams,
  queryParams,
  requestType,
  responseType: successResponse,
  requestHeaders,
  errors,
  security,
})
```

**Step 4: Run type check**

Run: `bun zenko check-types`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/core/operation-parser.ts packages/zenko/src/zenko.ts
git commit -m "feat: parse security requirements from OpenAPI spec"
```

---

### Task 3: Generate `securitySchemes` const and operation `security` fields

**Files:**

- Modify: `packages/zenko/src/zenko.ts`

**Step 1: Generate securitySchemes definition object**

Add a new section in `generateWithMetadata()` AFTER the header functions block (after line 371) and BEFORE request/response types:

```typescript
// Generate security schemes (after header functions, before request/response types)
if (
  spec.components?.securitySchemes &&
  Object.keys(spec.components.securitySchemes).length > 0
) {
  output.push("// Security Schemes")
  output.push("export const securitySchemes = {")

  for (const [name, scheme] of Object.entries(
    spec.components.securitySchemes
  )) {
    const s = scheme as Record<string, unknown>
    // Preserve original scheme names as declared in the spec (don't camelCase)
    output.push(`  ${formatPropertyName(name)}: {`)
    output.push(`    type: ${JSON.stringify(s.type)},`)

    if (s.type === "http") {
      output.push(
        `    scheme: ${JSON.stringify(String(s.scheme).toLowerCase())},`
      )
      if (s.bearerFormat) {
        output.push(`    bearerFormat: ${JSON.stringify(s.bearerFormat)},`)
      }
    } else if (s.type === "apiKey") {
      output.push(`    name: ${JSON.stringify(s.name)},`)
      output.push(`    in: ${JSON.stringify(s.in)},`)
    } else if (s.type === "oauth2") {
      output.push(`    flows: ${JSON.stringify(s.flows)},`)
    } else if (s.type === "openIdConnect") {
      output.push(
        `    openIdConnectUrl: ${JSON.stringify(s.openIdConnectUrl)},`
      )
    }

    output.push("  },")
  }

  output.push("} as const;")
  output.push("")
}
```

**Step 2: Add security field to operation objects**

In the operation objects loop (around line 394-403 in current code), add security after headers:

```typescript
if (op.requestHeaders && op.requestHeaders.length > 0) {
  output.push(`  headers: headers.${camelCaseOperationId},`)
}

// Add security requirements
if (op.security !== undefined) {
  if (op.security.length === 0) {
    output.push("  security: [],")
  } else {
    const securityEntries = op.security.map((req) => {
      const entries = Object.entries(req)
        .map(([scheme, scopes]) => {
          // Preserve original scheme names as declared in the spec
          return `${formatPropertyName(scheme)}: ${JSON.stringify(scopes)}`
        })
        .join(", ")
      return `{ ${entries} }`
    })
    output.push(`  security: [${securityEntries.join(", ")}],`)
  }
}
```

**Step 3: Run type check**

Run: `bun zenko check-types`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/zenko/src/zenko.ts
git commit -m "feat: generate securitySchemes and operation security metadata"
```

---

### Task 4: Update `OperationDefinition` type with `TSecurity` generic

**Files:**

- Modify: `packages/zenko/src/types.ts`
- Modify: `packages/zenko/src/utils/generate-helper-file.ts`
- Modify: `packages/zenko/src/zenko.ts` (inline helper and operation types generation)

**Step 1: Update `OperationDefinition` in types.ts**

```typescript
export type SecurityRequirement = Record<string, string[]>

export type OperationDefinition<
  TMethod extends RequestMethod,
  TPath extends (...args: any[]) => string,
  TRequest = undefined,
  TResponse = undefined,
  THeaders extends AnyHeaderFn | undefined = undefined,
  TErrors extends OperationErrors | undefined = undefined,
  TSecurity extends readonly SecurityRequirement[] | undefined = undefined,
> = {
  method: TMethod
  path: TPath
  request?: TRequest
  response?: TResponse
  headers?: THeaders
  errors?: TErrors
  security?: TSecurity
}
```

**Step 2: Update `generateHelperFile` in generate-helper-file.ts**

Add the `SecurityRequirement` type and update `OperationDefinition`:

```typescript
output.push("export type SecurityRequirement = Record<string, string[]>")
output.push("")
// Update the OperationDefinition line to include TSecurity:
output.push(
  "export type OperationDefinition<TMethod extends RequestMethod, TPath extends (...args: any[]) => string, TRequest = undefined, TResponse = undefined, THeaders extends AnyHeaderFn | undefined = undefined, TErrors extends OperationErrors | undefined = undefined, TSecurity extends readonly SecurityRequirement[] | undefined = undefined> = {"
)
// Add security field:
output.push("  security?: TSecurity")
```

**Step 3: Update inline helper generation in zenko.ts**

In the `appendHelperTypesImport` function, update the `"inline"` case to include `SecurityRequirement` type and the `security` field in `OperationDefinition`.

**Step 4: Update `generateOperationTypes` in zenko.ts**

Add security type parameter to the generated `OperationDefinition` type:

```typescript
function generateOperationTypes(
  buffer: string[],
  operations: Operation[],
  config: NormalizedTypesConfig
) {
  if (!config.emit) return

  buffer.push("// Operation Types")

  for (const op of operations) {
    const camelCaseOperationId = toCamelCase(op.operationId)
    const headerType = op.requestHeaders?.length
      ? isValidJSIdentifier(camelCaseOperationId)
        ? `typeof headers.${camelCaseOperationId}`
        : `(typeof headers)[${formatPropertyName(camelCaseOperationId)}]`
      : "undefined"
    const requestType = wrapTypeReference(op.requestType)
    const responseType = wrapTypeReference(op.responseType)
    const errorsType = buildOperationErrorsType(op.errors)

    // Build security type - use inline literal to avoid self-referential typeof
    let securityType = "undefined"
    if (op.security !== undefined) {
      if (op.security.length === 0) {
        securityType = "readonly []"
      } else {
        const entries = op.security.map((req) => {
          const props = Object.entries(req)
            .map(
              ([scheme, scopes]) =>
                `readonly ${formatPropertyName(scheme)}: readonly ${JSON.stringify(scopes)}`
            )
            .join("; ")
          return `{ ${props} }`
        })
        securityType = `readonly [${entries.join(", ")}]`
      }
    }

    buffer.push(
      `export type ${capitalize(camelCaseOperationId)}Operation = OperationDefinition<`
    )
    buffer.push(`  "${op.method}",`)
    buffer.push(
      `  ${isValidJSIdentifier(camelCaseOperationId) ? `typeof paths.${camelCaseOperationId}` : `(typeof paths)[${formatPropertyName(camelCaseOperationId)}]`},`
    )
    buffer.push(`  ${requestType},`)
    buffer.push(`  ${responseType},`)
    buffer.push(`  ${headerType},`)
    buffer.push(`  ${errorsType},`)
    buffer.push(`  ${securityType}`)
    buffer.push(`>;`)
    buffer.push("")
  }
}
```

**Step 5: Update tree-shaking utils**

In `packages/zenko/src/utils/tree-shaking.ts`, no changes are needed for `SecurityRequirement` imports — the generated code uses inline literal types for security, so `SecurityRequirement` is not referenced in generated output. The type is only used internally in `types.ts` for the `OperationDefinition` generic constraint.

However, we do need to export `SecurityRequirement` from the package root for users who want to reference it:

In `packages/zenko/index.ts`, add:

```typescript
export {
  type PathFn,
  type HeaderFn,
  type OperationErrors,
  type OperationDefinition,
  type SecurityRequirement,
} from "./src/types"
```

**Step 6: Run type check**

Run: `bun zenko check-types`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/zenko/src/types.ts packages/zenko/src/utils/generate-helper-file.ts packages/zenko/src/zenko.ts packages/zenko/src/utils/tree-shaking.ts
git commit -m "feat: add TSecurity generic to OperationDefinition type"
```

---

### Task 5: Write security schemes tests

**Files:**

- Create: `packages/zenko/src/__tests__/security-schemes.test.ts`

**Step 1: Write comprehensive test file**

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import * as fs from "fs"
import * as path from "path"
import { tictactoeYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("Security Schemes", () => {
  const tempDir = path.join(process.cwd(), "temp-test")

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

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
```

**Step 2: Run the tests (they should fail since generation isn't wired yet — or pass if Tasks 1-4 are done first)**

Run: `bun zenko test src/__tests__/security-schemes.test.ts`

**Step 3: Commit**

```bash
git add packages/zenko/src/__tests__/security-schemes.test.ts
git commit -m "test: add security schemes test suite"
```

---

### Task 6: Update existing test snapshots

**Files:**

- Modify: `packages/zenko/src/__tests__/__snapshots__/tictactoe.test.ts.snap` (auto-updated)
- Modify: any other affected snapshots

**Step 1: Run all tests and update snapshots**

Run: `bun zenko test -u`
Expected: Snapshots updated with new security metadata

**Step 2: Review snapshot diffs to ensure correctness**

Run: `git diff packages/zenko/src/__tests__/__snapshots__/`
Verify: New `securitySchemes` const appears, operations have `security` field.

**Step 3: Run all tests again to confirm they pass**

Run: `bun zenko test`
Expected: All PASS

**Step 4: Run full check**

Run: `bun check`
Expected: PASS (lint, format, type check)

**Step 5: Commit**

```bash
git add -A
git commit -m "test: update snapshots for security schemes"
```

---

### Task 7: Add tictactoe codegen to examples package and create fetch-based bearer auth example

**Files:**

- Modify: `packages/examples/generate.js` (add tictactoe spec generation)
- Create: `packages/examples/src/schema/tictactoe.gen.ts` (generated, via codegen)
- Create: `packages/examples/src/tictactoe-client-fetch.ts`

**Step 1: Add tictactoe to generate.js**

```javascript
import {
  authApiYamlPath,
  enumDemoYamlPath,
  petstoreYamlPath,
  tictactoeYamlPath,
  trainTravelYamlPath,
} from "@zenko/specs"

const specInputPaths = {
  "auth-api.yaml": authApiYamlPath,
  "enum-demo.yaml": enumDemoYamlPath,
  "petstore.yaml": petstoreYamlPath,
  "tictactoe.yaml": tictactoeYamlPath,
  "train-travel.yaml": trainTravelYamlPath,
}

// ... in the try block, add:
const tictactoeSuccess = generateSchema("tictactoe.yaml", "tictactoe.gen.ts")

// Update the success check to include tictactoeSuccess
```

**Step 2: Run codegen**

Run: `turbo codegen`
Expected: `src/schema/tictactoe.gen.ts` generated with securitySchemes and security fields

**Step 3: Create the fetch-based bearer auth example client**

Create `packages/examples/src/tictactoe-client-fetch.ts`:

```typescript
import {
  paths,
  securitySchemes,
  status,
  mark,
  errorMessage,
  type status as Status,
  type mark as Mark,
} from "./schema/tictactoe.gen"
import type { ZodSchema } from "zod"

/**
 * TicTacToe API client demonstrating bearer auth usage with generated security metadata.
 *
 * The tictactoe spec defines multiple security schemes:
 * - defaultApiKey: API key in header
 * - bearerHttpAuthentication: Bearer token (JWT)
 * - app2AppOauth / user2AppOauth: OAuth2 flows
 *
 * This client demonstrates how to use the generated `securitySchemes` metadata
 * to build type-safe auth headers with any HTTP library.
 */
export class TicTacToeClientFetch {
  private baseUrl: string
  private bearerToken?: string
  private apiKey?: string

  constructor(
    baseUrl: string = "https://api.tictactoe.example.com",
    auth?: { bearerToken?: string; apiKey?: string }
  ) {
    this.baseUrl = baseUrl
    this.bearerToken = auth?.bearerToken
    this.apiKey = auth?.apiKey
  }

  /**
   * Set the bearer token for authenticated requests.
   * Used by operations requiring `bearerHttpAuthentication`.
   */
  setBearerToken(token: string) {
    this.bearerToken = token
  }

  /**
   * Set the API key for authenticated requests.
   * Used by operations requiring `defaultApiKey`.
   */
  setApiKey(key: string) {
    this.apiKey = key
  }

  /**
   * Build auth headers based on the security scheme type.
   * Uses the generated `securitySchemes` metadata to determine header format.
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.bearerToken) {
      // Use scheme metadata to build the correct Authorization header
      const bearerScheme = securitySchemes.bearerHttpAuthentication
      if (bearerScheme.scheme === "bearer") {
        headers["Authorization"] = `Bearer ${this.bearerToken}`
      }
    }

    if (this.apiKey) {
      // Use scheme metadata to determine header name
      const apiKeyScheme = securitySchemes.defaultApiKey
      if (apiKeyScheme.in === "header") {
        headers[apiKeyScheme.name] = this.apiKey
      }
    }

    return headers
  }

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
        ...((options?.headers as Record<string, string>) ?? {}),
      },
      ...options,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      const parsed = errorMessage.safeParse(errorText)
      if (parsed.success) {
        throw new Error(`API Error: ${parsed.data}`)
      }
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    return responseSchema.parse(json)
  }

  /**
   * Get the whole board.
   * Security: defaultApiKey OR app2AppOauth (board:read)
   */
  async getBoard(): Promise<Status> {
    return this.request(paths.getBoard(), status)
  }

  /**
   * Get a single board square.
   * Security: bearerHttpAuthentication OR user2AppOauth (board:read)
   */
  async getSquare(row: string, column: string): Promise<Mark> {
    return this.request(paths.getSquare({ row, column }), mark)
  }

  /**
   * Set a single board square.
   * Security: bearerHttpAuthentication OR user2AppOauth (board:write)
   */
  async putSquare(row: string, column: string, value: Mark): Promise<Status> {
    return this.request(paths.putSquare({ row, column }), status, {
      method: "PUT",
      body: JSON.stringify(value),
    })
  }
}
```

**Step 4: Commit**

```bash
git add packages/examples/generate.js packages/examples/src/tictactoe-client-fetch.ts
git commit -m "feat: add tictactoe fetch client with bearer auth example"
```

---

### Task 8: Write tests for the tictactoe fetch client example

**Files:**

- Create: `packages/examples/src/__tests__/tictactoe-client-fetch.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, test, expect, afterEach, mock } from "bun:test"
import { TicTacToeClientFetch } from "../tictactoe-client-fetch"

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock
  return fetchMock
}

const originalFetch = global.fetch

describe("TicTacToeClientFetch", () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  test("includes bearer token in Authorization header", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      bearerToken: "my-jwt-token",
    })

    const mockBoard = {
      winner: ".",
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBoard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.getBoard()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-jwt-token",
        }),
      })
    )
  })

  test("includes API key in custom header", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      apiKey: "test-api-key",
    })

    const mockBoard = {
      winner: ".",
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBoard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.getBoard()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board",
      expect.objectContaining({
        headers: expect.objectContaining({
          "api-key": "test-api-key",
        }),
      })
    )
  })

  test("sends both bearer token and API key when both are set", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      bearerToken: "jwt-token",
      apiKey: "api-key-value",
    })

    const mockBoard = {
      winner: ".",
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBoard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.getBoard()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
          "api-key": "api-key-value",
        }),
      })
    )
  })

  test("setBearerToken updates the token for subsequent requests", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com")

    const mockMark = "X"

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockMark), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    client.setBearerToken("new-token")
    await client.getSquare("1", "1")

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/board/1/1"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-token",
        }),
      })
    )
  })

  test("handles API error responses", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      bearerToken: "token",
    })

    fetchMock.mockResolvedValue(
      new Response("Illegal coordinates", {
        status: 400,
        statusText: "Bad Request",
      })
    )

    await expect(client.getSquare("5", "5")).rejects.toThrow("API Error")
  })

  test("makes request without auth when no credentials set", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com")

    const mockBoard = {
      winner: ".",
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBoard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.getBoard()

    const callHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit)
      ?.headers as Record<string, string>
    expect(callHeaders).not.toHaveProperty("Authorization")
    expect(callHeaders).not.toHaveProperty("api-key")
  })

  test("putSquare sends mark in request body", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      bearerToken: "token",
    })

    const mockStatus = {
      winner: ".",
      board: [
        ["X", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockStatus), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.putSquare("1", "1", "X" as any)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/board/1/1"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify("X"),
      })
    )
  })
})
```

**Step 2: Run the example tests**

Run: `bun test packages/examples/src/__tests__/tictactoe-client-fetch.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/examples/src/__tests__/tictactoe-client-fetch.test.ts
git commit -m "test: add tictactoe fetch client tests for bearer auth"
```

---

### Task 9: Generate examples and run full verification

**Files:**

- Auto-generated: `packages/examples/src/schema/tictactoe.gen.ts`

**Step 1: Run codegen to generate the tictactoe schema**

Run: `turbo codegen`
Expected: All schemas generated including tictactoe.gen.ts

**Step 2: Run full check suite**

Run: `bun check`
Expected: PASS (lint, format, type check)

**Step 3: Run all zenko tests**

Run: `bun zenko test`
Expected: All PASS

**Step 4: Run example tests**

Run: `turbo test`
Expected: All PASS

**Step 5: Check private examples for type errors**

Run: `turbo check-types`
Expected: PASS across all packages

**Step 6: Commit generated files**

```bash
git add packages/examples/src/schema/tictactoe.gen.ts
git commit -m "chore: add generated tictactoe schema with security metadata"
```
