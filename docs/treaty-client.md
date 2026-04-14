# Treaty client (Eden-style)

Zenko can emit a **Eden Treaty-style HTTP client** on top of the same generated operations as the rest of the library. The client is a thin runtime around your OpenAPI-derived Zod operations: it performs `fetch`, builds URLs from path templates, serializes bodies, and returns a **discriminated result** so you can handle success, HTTP errors, and unexpected failures (network, parse, internal) without exceptions as the default contract.

This document describes the **operation-first** surface (`client.someOperation(...)`), the **result types**, and the optional **route-tree** alias (`$routes`). For the implementation history and roadmap, see the plans under `docs/plans/`.

## Imports

Runtime and types live in the `zenko/treaty` entry (also re-exported from the root `zenko` package for types/helpers):

```ts
import {
  createTreatyClient,
  unwrap,
  type TreatyOperationsClient,
  type TreatyRequest,
  type TreatyResult,
  type TreatyResultFor,
} from "zenko/treaty"
```

## What gets generated

For each spec, Zenko emits a main module (for example `petstore.gen.ts`) containing path functions, Zod schemas, and **`operationMetadata`**. A second step produces a **treaty module** (for example `petstore.treaty.gen.ts`) that wires those operations into `createTreatyClient`.

A typical treaty module contains:

| Export                            | Role                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `operations`                      | Map of operation name → `OperationDefinition` (same objects as in the `.gen.ts` file).                                                  |
| `operationMetadata`               | Per-operation HTTP method, path template, and OpenAPI **status-keyed** success/error hints used for typing and `specStatus` at runtime. |
| `treatyRoutes`                    | Nested object mirroring URL segments and HTTP verbs (used for the Eden-style chain).                                                    |
| `createClient(baseUrl, options?)` | Returns an **operation-first** client plus `$routes`.                                                                                   |

Configure the treaty file path with **`treatyOutput`** in your Zenko config (see `packages/zenko/zenko-config.schema.json`). The examples package uses a separate `generateTreatyModule` script instead; the idea is the same: treaty output is **derived from** the generated `.gen.ts` and its `operationMetadata`.

## Calling operations (primary API)

`createClient` returns a **`TreatyOperationsClient`**: each key in `operations` becomes a method named after that export (usually aligned with OpenAPI `operationId`).

Every method takes a **single request object** (`TreatyRequest`):

```ts
type TreatyRequest<TPathArg, TBody> = {
  /** Path and query fields; merged when resolving the URL. */
  params?: Partial<TPathArg>
  query?: Partial<TPathArg>
  /** JSON body, or `FormData` / `Blob` when the operation expects multipart or binary. */
  body?: TBody | FormData | Blob
  headers?: Record<string, string>
  /** Extra `fetch` options (signal, credentials, …); not method/body/headers. */
  init?: Omit<RequestInit, "method" | "body" | "headers">
}
```

- **GET/HEAD** operations typically allow **omitting** the argument when there is no path/query/body requirement.
- Operations with a **request body schema** require a **`req` object** that includes `body` (TypeScript enforces this).

Example (shape only; names come from your generated client):

```ts
const client = createClient("https://api.example.com", {
  fetch: customFetch,
})

const list = await client.listPets({ query: { limit: 10 } })

const created = await client.createPets({
  body: { name: "Neko", tag: "cat" },
  headers: { authorization: "Bearer …" },
  init: { signal: controller.signal },
})

const one = await client.showPetById({ params: { petId: 42 } })
```

## Result union: `TreatyResult` / `TreatyResultFor`

Each call resolves to a **`Promise` of a discriminated union** with `kind` as the top-level discriminant. The exact success and error branches are **inferred per operation** from the Zod operation definition and `operationMetadata` (`TreatyResultFor<typeof someOp, typeof operationMetadata.someOp>`).

Conceptually, every result is one of:

| `kind`                | When                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`success`**         | Response is OK (`response.ok`), and the success body parses against the operation’s response schema (if any).                                                                                                  |
| **`error`**           | Response is not OK; body is parsed against an error schema when the spec maps that status, otherwise `error` is raw parsed JSON or text. Includes `specStatus` (numeric status, `"default"`, or `"unlisted"`). |
| **`unexpectedError`** | Anything else: **`fetch` rejected**, **JSON/Zod failure** while handling a body, or other internal failures. Use **`subtype`** to narrow: `"transport"` \| `"parse"` \| `"other"`.                             |

### Dummy request: narrowing on `kind` and `subtype`

The pattern is: **check `kind` first**, then narrow **`unexpectedError`** with **`subtype`** when needed.

```ts
declare const result: import("zenko/treaty").TreatyResult<unknown>

switch (result.kind) {
  case "success": {
    // result.status — HTTP status number
    // result.data — typed success payload
    // result.response, result.headers — underlying Response
    console.log(result.data)
    break
  }
  case "error": {
    // result.status — actual HTTP status
    // result.specStatus — status as known to the spec (or "unlisted")
    // result.error — typed or unknown error body
    console.error(result.specStatus, result.error)
    break
  }
  case "unexpectedError": {
    switch (result.subtype) {
      case "transport":
        // result.error — Error (fetch threw)
        console.error(result.error)
        break
      case "parse":
        // result.error — ZodError, SyntaxError, etc.
        // result.rawBody — string snapshot for debugging
        console.error(result.error, result.rawBody)
        break
      case "other":
        console.error(result.error)
        break
    }
    break
  }
}
```

For a **typed** operation, `TreatyResultFor` narrows `data` on success and `error` on **`error`** when your OpenAPI and generated `errors` map line up with `operationMetadata`.

### Throwing instead of branching

For quick scripts or React Query adapters, use **`unwrap`** (alias **`orThrow`**) on a result: it returns `data` on `success` and throws on any other `kind`.

```ts
import { unwrap } from "zenko/treaty"

const pet = unwrap(await client.showPetById({ params: { petId: "1" } }))
```

## Route-tree alias: `$routes`

Generated `createClient` also attaches **`$routes`**, a **`TreatyRouteTreeClient`** built from `treatyRoutes`. You chain by path segment and HTTP verb (similar to Eden), for example `client.$routes.pets.get()` for a static route, or `client.$routes.pets({ petId: "1" }).get()` when a segment is dynamic (`:petId`).

The generated comment in the treaty module notes that this path is **lighter** at runtime and does not go through the same **`operationMetadata`-aware** parsing and `specStatus` handling as the operation-first client. Prefer **`client.someOperation(...)`** when you care about typed errors and spec-accurate status mapping.

## Relationship to the plain `.gen.ts` module

The treaty client **reuses** the same exported operation objects (`method`, `path`, `request`, `response`, `errors`, …). It does not replace the generated types or path functions; it is an optional **transport layer** for apps that want Eden-like ergonomics and a unified result type.

## Breaking migration (Treaty result `kind` names)

If you upgraded from an older Zenko where `TreatyResult` used `kind: "http" | "transport" | "parse" | "unknown"`:

- Rename **`http` → `error`** for non-success HTTP responses (same fields; the type `TreatyHttpError` is now **`TreatyErrorResult`**).
- Fold **`transport`**, **`parse`**, and **`unknown`** into **`unexpectedError`** and switch on **`subtype`** (`"transport"`, `"parse"`, `"other"`).

## Further reading

- Example tests: `packages/examples/src/__tests__/*-treaty-fetch.test.ts`
- Runtime implementation: `packages/zenko/src/treaty.ts`
- Result and inference types: `packages/zenko/src/treaty-types.ts`, `packages/zenko/src/treaty-infer.ts`
