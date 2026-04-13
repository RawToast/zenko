# Treaty Client Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current path-tree-first treaty client with an operationId-first, request-object-based client that preserves typed success and error responses via a discriminated result union.

**Architecture:** Keep Zenko's existing operation generation pipeline, but extend the generated operation metadata and treaty runtime so the canonical client surface is `client.someOperation({ params, query, body, headers, init })`. Model runtime outcomes as a discriminated union with separate `success`, `http`, `transport`, `parse`, and `unknown` branches. If route-tree support is retained, keep it as a secondary alias layer built from the same metadata rather than the primary DX surface.

**Tech Stack:** TypeScript, Bun, Zod, Zenko generator/runtime, OpenAPI-derived `OperationDefinition` types, Bun snapshot/integration tests.

---

## Plan Review Notes

- The current treaty runtime already parses responses and exposes `response`, `status`, and `headers`, but it discards typed operation errors and collapses error bodies to `unknown` in `packages/zenko/src/treaty-types.ts`.
- The current generated treaty module is route-tree-first (`client.pets({ petId }).get()`), which makes dynamic routes awkward and hides the real OpenAPI operation surface. The redesign should make `operationId` the primary surface.
- Do not make thrown exceptions the canonical contract. Return a discriminated union from every generated operation and add a small helper layer like `unwrap()` / `.orThrow()` for React Query ergonomics.
- Preserve exact OpenAPI status knowledge where possible. If an operation has a `404` schema and a `default` schema, those should remain distinguishable in the generated error result types.
- Keep the scope focused: ship the operationId-first client and the new result union first; only keep or reintroduce route-tree aliases if they are low-cost and derived from the same operation metadata.

### Task 1: Preserve Status-Keyed Success and Error Metadata End-to-End

**Files:**
- Modify: `packages/zenko/src/types/operation.ts`
- Modify: `packages/zenko/src/core/operation-parser.ts`
- Modify: `packages/zenko/src/zenko.ts`
- Modify: `packages/zenko/src/core/__tests__/operation-parser.test.ts`
- Modify: `packages/zenko/src/__tests__/tictactoe.test.ts`

**Step 1: Write the failing tests**

Add parser and generator assertions that prove numeric success/error status maps are preserved in the internal `Operation` model and emitted into generated metadata.

```ts
test("preserves status-keyed response metadata", () => {
  const operations = parseOperations(spec, new Map())
  const operation = operations.find((item) => item.operationId === "showPetById")

  expect(operation).toMatchObject({
    operationId: "showPetById",
    successResponses: { "200": "Pet" },
    errorResponses: { "404": "Error", default: "Error" },
  })
})

test("emits operation metadata with response status maps", () => {
  const output = generate(specYaml)

  expect(output).toContain("export const operationMetadata = {")
  expect(output).toContain('showPetById: {')
  expect(output).toContain('successResponses: { "200": "Pet" }')
  expect(output).toContain('errorResponses: { "404": "Error", "default": "Error" }')
})
```

**Step 2: Run the focused tests to verify they fail**

Run: `bun zenko test src/core/__tests__/operation-parser.test.ts src/__tests__/tictactoe.test.ts`

Expected: FAIL because the parser/generator does not yet preserve enough status-keyed metadata for the treaty redesign.

**Step 3: Implement the metadata preservation**

Update the internal `Operation` type so it carries explicit success/error response maps:

```ts
export type OperationResponseMap = Record<string, string>

export type Operation = {
  operationId: string
  path: string
  method: RequestMethod
  pathParams: PathParam[]
  queryParams: QueryParam[]
  requestType?: string
  responseType?: string
  successResponses?: OperationResponseMap
  errorResponses?: OperationResponseMap
  requestHeaders?: RequestHeader[]
  errors?: OperationErrorGroup
  security?: SecurityRequirement[]
}
```

Update `operation-parser.ts` to emit both the existing aggregate response/error information and the raw status maps. Update `zenko.ts` to emit those maps into `operationMetadata`.

**Step 4: Run the focused tests again**

Run: `bun zenko test src/core/__tests__/operation-parser.test.ts src/__tests__/tictactoe.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/types/operation.ts packages/zenko/src/core/operation-parser.ts packages/zenko/src/zenko.ts packages/zenko/src/core/__tests__/operation-parser.test.ts packages/zenko/src/__tests__/tictactoe.test.ts
git commit -m "feat: preserve response status metadata for treaty clients"
```

---

### Task 2: Define the Canonical Treaty Result Union and Type Inference

**Files:**
- Modify: `packages/zenko/src/treaty-types.ts`
- Modify: `packages/zenko/src/treaty-infer.ts`
- Modify: `packages/zenko/src/types.ts`
- Create: `packages/zenko/src/__tests__/treaty-client-types.test.ts`

**Step 1: Write the failing type tests**

Add type-level coverage that proves generated operations narrow on `kind`, preserve success payloads, and preserve status-specific HTTP errors.

```ts
test("operation result narrows on success and http error kinds", () => {
  type Result = TreatyResultFor<typeof showPetById>

  expectTypeOf<Result>().toEqualTypeOf<
    | {
        kind: "success"
        status: 200
        data: Pet
      }
    | {
        kind: "http"
        specStatus: 404 | "default" | "unlisted"
        status: number
        error: Error
      }
    | { kind: "transport"; error: Error }
    | { kind: "parse"; status: number; error: Error }
    | { kind: "unknown"; error: unknown }
  >()
})
```

**Step 2: Run the focused type tests to verify they fail**

Run: `bun zenko test src/__tests__/treaty-client-types.test.ts`

Expected: FAIL because `TreatyResult` is still `{ data, error }` and the current inference ignores `OperationDefinition.errors`.

**Step 3: Replace the current treaty result model with a discriminated union**

Use `kind` as the top-level discriminant and keep `status` only on branches backed by an HTTP response:

```ts
export type TreatySuccess<TStatus extends number, TData> = {
  kind: "success"
  status: TStatus
  data: TData
  response: Response
  headers: Headers
}

export type TreatyHttpError<TSpecStatus extends string | number, TError> = {
  kind: "http"
  specStatus: TSpecStatus
  status: number
  error: TError
  response: Response
  headers: Headers
}

export type TreatyTransportError = {
  kind: "transport"
  error: Error
}

export type TreatyParseError = {
  kind: "parse"
  status: number
  error: Error
  rawBody: string
  response: Response
  headers: Headers
}

export type TreatyUnknownError = {
  kind: "unknown"
  error: unknown
}
```

In `treaty-infer.ts`, derive the success/error branches from `OperationDefinition.response` plus the operation's status-keyed metadata. Keep a fallback `specStatus: "unlisted"` branch for runtime statuses not described in the spec.

**Step 4: Re-run the type tests**

Run: `bun zenko test src/__tests__/treaty-client-types.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/treaty-types.ts packages/zenko/src/treaty-infer.ts packages/zenko/src/types.ts packages/zenko/src/__tests__/treaty-client-types.test.ts
git commit -m "feat: add discriminated treaty result types"
```

---

### Task 3: Generate an OperationId-First Request-Object Client Surface

**Files:**
- Modify: `packages/zenko/src/treaty-generator.ts`
- Modify: `packages/zenko/src/utils/treaty-tree.ts`
- Modify: `packages/zenko/src/treaty-infer.ts`
- Modify: `packages/examples/src/schema/petstore.treaty.gen.ts` (generated during verification)
- Modify: `packages/examples/src/schema/auth-api.treaty.gen.ts` (generated during verification)
- Modify: `packages/examples/src/__tests__/petstore-treaty-fetch.test.ts`
- Modify: `packages/examples/src/__tests__/auth-api-treaty-fetch.test.ts`

**Step 1: Write the failing integration tests**

Update the treaty example tests so they assert the new primary surface and request object shape.

```ts
const petResult = await client.showPetById({
  params: { petId: "42" },
})

const profileResult = await client.updateProfile({
  body: { displayName: "New" },
})

const listResult = await client.listPets({
  query: { limit: 10 },
})
```

Also add at least one test that proves headers and `RequestInit` can be passed without changing the body contract:

```ts
await client.createPets({
  body: payload,
  headers: { authorization: "Bearer test" },
  init: { signal: controller.signal },
})
```

**Step 2: Run the focused integration tests to verify they fail**

Run: `bun zenko test src/__tests__/petstore-treaty-fetch.test.ts src/__tests__/auth-api-treaty-fetch.test.ts`

Expected: FAIL because the generated client still exposes route-tree methods and body shorthand calls.

**Step 3: Change the generated client surface**

Update the generator so the canonical export shape is operation-based and every method accepts a single request object:

```ts
export const operations = {
  listPets,
  createPets,
  showPetById,
  login,
  updateProfile,
} as const

export function createClient(baseUrl: string, options?: TreatyClientOptions) {
  return createTreatyClient({
    baseUrl,
    operations,
    operationMetadata,
    options,
  })
}
```

The request shape should be:

```ts
type TreatyRequest<TParams, TQuery, TBody, THeaders> = {
  params?: TParams
  query?: TQuery
  body?: TBody
  headers?: THeaders
  init?: Omit<RequestInit, "method" | "body" | "headers">
}
```

If route-tree aliases are retained, generate them as a non-primary property like `client.$routes` from the same metadata.

**Step 4: Re-run the focused integration tests**

Run: `bun zenko test src/__tests__/petstore-treaty-fetch.test.ts src/__tests__/auth-api-treaty-fetch.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/treaty-generator.ts packages/zenko/src/utils/treaty-tree.ts packages/zenko/src/treaty-infer.ts packages/examples/src/__tests__/petstore-treaty-fetch.test.ts packages/examples/src/__tests__/auth-api-treaty-fetch.test.ts
git commit -m "feat: generate operation-first treaty clients"
```

---

### Task 4: Implement the Runtime for Typed HTTP, Transport, Parse, and Unknown Outcomes

**Files:**
- Modify: `packages/zenko/src/treaty.ts`
- Modify: `packages/zenko/src/treaty-types.ts`
- Modify: `packages/zenko/src/__tests__/treaty-runtime.test.ts`
- Modify: `packages/examples/src/__tests__/petstore-treaty-fetch.test.ts`
- Modify: `packages/examples/src/__tests__/auth-api-treaty-fetch.test.ts`

**Step 1: Write the failing runtime tests**

Add focused runtime tests for each branch:

```ts
test("returns kind=success for 200 JSON", async () => {
  const result = await client.showPetById({ params: { petId: "42" } })
  expect(result.kind).toBe("success")
})

test("returns kind=http with specStatus for known error responses", async () => {
  const result = await client.showPetById({ params: { petId: "missing" } })
  expect(result).toMatchObject({ kind: "http", specStatus: 404 })
})

test("returns kind=transport when fetch rejects", async () => {
  fetchMock.mockRejectedValue(new TypeError("network down"))
  const result = await client.showPetById({ params: { petId: "42" } })
  expect(result.kind).toBe("transport")
})

test("returns kind=parse when a typed JSON body cannot be parsed", async () => {
  fetchMock.mockResolvedValue(new Response("not json", { status: 200 }))
  const result = await client.showPetById({ params: { petId: "42" } })
  expect(result.kind).toBe("parse")
})
```

**Step 2: Run the runtime tests to verify they fail**

Run: `bun zenko test src/__tests__/treaty-runtime.test.ts`

Expected: FAIL because the runtime still returns `{ data, error }` and does not categorize fetch/parse failures.

**Step 3: Implement the runtime branch handling**

Update `createTreatyClient()` and the leaf caller so it:

- builds URLs from `params` and `query`
- serializes `body` based on existing request handling rules
- wraps fetch rejection/abort as `kind: "transport"`
- returns `kind: "http"` for non-2xx responses and attaches `specStatus`
- returns `kind: "parse"` when a response exists but body decoding/validation fails
- returns `kind: "unknown"` for any other uncategorized failure

Add a helper for React Query-style ergonomics:

```ts
export function unwrap<T>(result: TreatyAnyResult<T>): T {
  if (result.kind === "success") return result.data
  throw new Error(`Treaty unwrap failed: ${result.kind}`)
}
```

If `.orThrow()` is added, keep it as sugar over the canonical union, not the primary behavior.

**Step 4: Re-run the runtime tests**

Run: `bun zenko test src/__tests__/treaty-runtime.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/treaty.ts packages/zenko/src/treaty-types.ts packages/zenko/src/__tests__/treaty-runtime.test.ts packages/examples/src/__tests__/petstore-treaty-fetch.test.ts packages/examples/src/__tests__/auth-api-treaty-fetch.test.ts
git commit -m "feat: categorize treaty runtime results"
```

---

### Task 5: Regenerate Examples and Verify the Whole Flow

**Files:**
- Modify: `packages/examples/src/schema/*.treaty.gen.ts` (generated)
- Modify: snapshots or example test fixtures if needed

**Step 1: Regenerate the example clients**

Run: `turbo codegen`

Expected: generated treaty example files now expose operationId-first clients and updated result typing.

**Step 2: Run targeted treaty and example verification**

Run: `bun zenko test src/__tests__/treaty-runtime.test.ts src/__tests__/treaty-client-types.test.ts`

Expected: PASS

Run: `bun zenko test`

Expected: PASS

**Step 3: Run repository-level checks**

Run: `bun check`

Expected: PASS

Run: `turbo codegen`

Expected: PASS with no unexpected diffs after regeneration.

**Step 4: Review generated DX manually**

Check the generated example usage reads naturally:

```ts
await client.showPetById({ params: { petId: "42" } })
await client.listPets({ query: { limit: 10 } })
await client.updateProfile({ body: { displayName: "New" } })
```

And verify error narrowing works:

```ts
const result = await client.showPetById({ params: { petId: "42" } })

if (result.kind === "http" && result.specStatus === 404) {
  result.error
}
```

**Step 5: Commit**

```bash
git add packages/examples/src/schema packages/examples/src/__tests__ packages/zenko/src
git commit -m "test: verify redesigned treaty client generation"
```

---

## Execution Notes

- Use `@test-driven-development` before implementation code for each task.
- Use `@requesting-code-review` after each meaningful task chunk.
- If review feedback comes back, use `@receiving-code-review` before applying fixes.
- Keep route-tree alias work out of scope unless the operation-first client is already green and the alias is almost free.
- Do not claim success until `bun check`, `bun zenko test`, and `turbo codegen` all pass with collected output.
