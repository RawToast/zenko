# @zenko/core

Shared, runtime-agnostic OpenAPI-to-TypeScript code generation utilities that power the Zenko toolchain.

This package is consumed by the Bun-first `zenko` CLI/runtime as well as the Node-compatible `zenko-node` distribution. It intentionally contains zero direct file system or YAML parsing logic so runtimes can supply their own adapters.

## Exports

`@zenko/core` provides the shared generator primitives:

- `generateFromDocument(openApiDocument, options)` → `{ output, helperFile? }`
- `generate` → string-only shorthand
- Type helpers such as `PathFn`, `HeaderFn`, `OperationDefinition`, `OperationErrors`
- Operation metadata types (`Operation`, `PathParam`, etc.)

## Programmatic usage

```ts
import {
  generateFromDocument,
  type GenerateOptions,
  type OpenAPISpec,
} from "@zenko/core"

const spec: OpenAPISpec = {
  openapi: "3.0.0",
  info: { title: "Sample", version: "1.0.0" },
  paths: {
    "/ping": {
      get: {
        operationId: "ping",
        responses: { "200": { description: "pong" } },
      },
    },
  },
}

const { output } = generateFromDocument(spec, {
  types: { emit: true, helpers: "inline" },
})
console.log(output)
```

## Development

```bash
bun install
bun run --filter @zenko/core build
```

Tests can be executed with:

```bash
bun run --filter @zenko/core test
```

