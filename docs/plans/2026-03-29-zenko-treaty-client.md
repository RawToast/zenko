# Zenko Treaty Client Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate an Eden Treaty-like client from Zenko's existing `*.gen.ts` modules, with nested path DX, method-leaf calls, param functions, and strongly typed request/response/error handling.

**Architecture:** Ship this in two layers. First, extend Zenko's normal `.gen.ts` output with a small `operationMetadata` export so a second-pass generator can work from existing generated modules without reparsing YAML or walking the TypeScript AST. Second, add a shared `zenko/treaty` runtime and a `generateTreatyModule()` emitter that writes `*.treaty.gen.ts`; once that works, wire a one-command CLI path via `zenko treaty ...` and `treatyOutput` config. Keep the MVP intentionally below full Eden parity: JSON requests, query/header typing, nested path params, and discriminated `{ data, error }` are in; WS/SSE/in-process Elysia adapters stay out.

**Tech Stack:** TypeScript, Zod, Bun tests, tsdown, current Zenko generator, `../eden` Treaty2 as the DX reference, and `../elysia` route-tree types as the type-shape reference.

---

## Plan Review Notes

- The earlier plan was directionally right, but it was still missing the **bridge** from existing `.gen.ts` files to an Eden-like emitter. The concrete fix is to emit a compact `operationMetadata` object during normal Zenko generation.
- Do **not** start with a separate workspace package. The lower-friction MVP is a new `zenko/treaty` subpath exported from `packages/zenko/package.json` and built from `packages/zenko/src/treaty.ts`.
- Treat **second-pass generation** as the MVP and **one-step generation** as a convenience layer on top. That keeps the feature shippable even if the CLI ergonomics need one extra pass at the end.
- The current `OperationErrors` type loses numeric status codes. To get closer to Eden's narrowing, preserve status-keyed response metadata alongside the existing `errors` bucket instead of trying to reconstruct it later.
- Use these files as implementation references while coding:
  - `../elysia/src/types.ts` for `CreateEden`, `ResolvePath`, and how nested `:param` route keys are represented
  - `../eden/src/treaty2/types.ts` for `TreatyResponse`, `CreateParams`, and the leaf method signatures
  - `../eden/src/treaty2/index.ts` for the proxy runtime and request/response assembly
  - `../eden/test/treaty2.test.ts` and `../eden/test/types/treaty2.ts` as the MVP acceptance checklist

### Task 1: Emit Stable Route and Status Metadata in `.gen.ts`

**Files:**

- Modify: `packages/zenko/src/types/operation.ts`
- Modify: `packages/zenko/src/core/operation-parser.ts`
- Modify: `packages/zenko/src/zenko.ts`
- Modify: `packages/zenko/src/core/__tests__/operation-parser.test.ts`
- Modify: `packages/zenko/src/__tests__/tictactoe.test.ts`

**Step 1: Write the failing parser and generator tests**

Add one parser-level test that proves Zenko preserves status-keyed response information, and one generator-level test that proves it emits metadata into the generated module.

```typescript
test("preserves success and error response status maps", () => {
  const operations = parseOperations(spec, new Map())
  const getSquare = operations.find(
    (operation) => operation.operationId === "getSquare"
  )

  expect(getSquare).toMatchObject({
    operationId: "getSquare",
    path: "/board/{row}/{column}",
    method: "get",
    successResponses: { "200": "mark" },
    errorResponses: { "400": "errorMessage" },
  })
})

test("emits operationMetadata with path and status maps", () => {
  const result = generate(specYaml)

  expect(result).toContain("export const operationMetadata = {")
  expect(result).toContain("getSquare: {")
  expect(result).toContain('method: "get"')
  expect(result).toContain('path: "/board/{row}/{column}"')
  expect(result).toContain('successResponses: { "200": "mark" }')
  expect(result).toContain('errorResponses: { "400": "errorMessage" }')
})
```

**Step 2: Run the focused tests to verify they fail**

Run: `bun zenko test src/core/__tests__/operation-parser.test.ts src/__tests__/tictactoe.test.ts`

Expected: FAIL because `Operation` does not yet expose status maps and the generator does not emit `operationMetadata`.

**Step 3: Add the metadata to the internal `Operation` model and emit it**

In `packages/zenko/src/types/operation.ts`, add explicit maps for success and error responses:

```typescript
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

In `packages/zenko/src/core/operation-parser.ts`, keep the existing `responseType` / `errors` output for backwards compatibility, but also return the raw numeric maps:

```typescript
function getResponseTypes(...) {
  const successCodes = new Map<string, string>()
  const errorEntries: Array<{ code: string; schema: any }> = []

  // existing logic stays

  const successResponses = Object.fromEntries(successCodes)
  const errorResponses = Object.fromEntries(
    errorEntries.map(({ code, schema }) => [
      code,
      typeof schema === "string"
        ? schema
        : resolveResponseType(schema, `${capitalize(toCamelCase(operationId))}Status${code}`, nameMap),
    ])
  )

  return {
    successResponse,
    errors,
    successResponses: Object.keys(successResponses).length ? successResponses : undefined,
    errorResponses: Object.keys(errorResponses).length ? errorResponses : undefined,
  }
}
```

In `packages/zenko/src/zenko.ts`, emit the metadata after the existing operation objects:

```typescript
output.push("// Operation Metadata")
output.push("export const operationMetadata = {")

for (const op of operations) {
  const operationId = toCamelCase(op.operationId)
  output.push(`  ${formatPropertyName(operationId)}: {`)
  output.push(`    method: ${JSON.stringify(op.method)},`)
  output.push(`    path: ${JSON.stringify(op.path)},`)
  if (op.successResponses) {
    output.push(`    successResponses: ${JSON.stringify(op.successResponses)},`)
  }
  if (op.errorResponses) {
    output.push(`    errorResponses: ${JSON.stringify(op.errorResponses)},`)
  }
  output.push("  },")
}

output.push("} as const")
output.push("")
```

**Step 4: Run the focused tests again**

Run: `bun zenko test src/core/__tests__/operation-parser.test.ts src/__tests__/tictactoe.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/types/operation.ts packages/zenko/src/core/operation-parser.ts packages/zenko/src/zenko.ts packages/zenko/src/core/__tests__/operation-parser.test.ts packages/zenko/src/__tests__/tictactoe.test.ts
git commit -m "feat: emit treaty metadata from generated operations"
```

---

### Task 2: Add the Shared `zenko/treaty` Runtime and Type Helpers

**Files:**

- Create: `packages/zenko/src/treaty.ts`
- Modify: `packages/zenko/package.json`
- Modify: `packages/zenko/tsdown.config.ts`
- Create: `packages/zenko/src/__tests__/treaty-runtime.test.ts`

**Step 1: Write the failing runtime tests**

Create a minimal route table by hand and prove the runtime supports method leaves, path params, JSON bodies, and the `{ data, error }` result envelope.

```typescript
import { describe, test, expect, mock } from "bun:test"
import { createTreatyClient } from "../treaty"

const routes = {
  board: {
    get: {
      method: "get",
      path: () => "/board",
    },
    ":row": {
      ":column": {
        put: {
          method: "put",
          path: ({ row, column }: { row: string; column: string }) =>
            `/board/${row}/${column}`,
        },
      },
    },
  },
} as const

test("calls GET leaves and returns a success envelope", async () => {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch

  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ winner: "." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )

  const client = createTreatyClient({ baseUrl: "https://api.test.com", routes })
  const result = await client.board.get()

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.test.com/board",
    expect.objectContaining({ method: "GET" })
  )
  expect(result.error).toBeNull()
  expect(result.data).toEqual({ winner: "." })
})

test("walks dynamic segments and sends JSON bodies", async () => {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch

  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 })
  )

  const client = createTreatyClient({ baseUrl: "https://api.test.com", routes })
  await client.board({ row: "1" })({ column: "2" }).put("X")

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.test.com/board/1/2",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify("X"),
    })
  )
})
```

**Step 2: Run the runtime test to verify it fails**

Run: `bun zenko test src/__tests__/treaty-runtime.test.ts`

Expected: FAIL because `packages/zenko/src/treaty.ts` does not exist yet.

**Step 3: Implement the shared runtime and type algebra**

Create `packages/zenko/src/treaty.ts` with:

- `TreatyResult<TData, TError>`
- operation inference helpers from `OperationDefinition`
- param-key routing for keys matching `` `:${string}` ``
- a small proxy runtime that accumulates path segments until a terminal HTTP method is called

Start with this shape:

```typescript
import { z } from "zod"

import type { OperationDefinition } from "./types"

export type TreatyResult<TData, TError> =
  | {
      data: TData
      error: null
      response: Response
      status: number
      headers: Headers
    }
  | {
      data: null
      error: TError
      response: Response
      status: number
      headers: Headers
    }

type RequestSchema<T> =
  T extends OperationDefinition<any, any, infer TRequest, any, any, any, any>
    ? TRequest extends z.ZodTypeAny
      ? z.input<TRequest>
      : undefined
    : never

type ResponseSchema<T> =
  T extends OperationDefinition<any, any, any, infer TResponse, any, any, any>
    ? TResponse extends z.ZodTypeAny
      ? z.output<TResponse>
      : undefined
    : never

export function createTreatyClient(config: {
  baseUrl: string
  routes: Record<string, unknown>
  fetch?: typeof fetch
}) {
  return createProxy([], {}, config)
}
```

Implement only the MVP rules from `../eden/src/treaty2/index.ts`:

- `get` / `head`: `(options?)`
- `post` / `put` / `patch` / `delete`: `(body, options?)`
- query string support for plain values and `Date`
- JSON request bodies
- parse JSON responses when `content-type` contains `application/json`
- return `{ data, error, response, status, headers }`
- do **not** add SSE, WS, `onRequest`, `onResponse`, `throwHttpError`, or multipart yet

**Step 4: Export the runtime as a real package subpath**

In `packages/zenko/package.json`, add:

```json
"./treaty": {
  "types": "./dist/treaty.d.ts",
  "bun": "./src/treaty.ts",
  "import": "./dist/treaty.mjs",
  "require": "./dist/treaty.cjs"
}
```

In `packages/zenko/tsdown.config.ts`, add the new entry:

```typescript
entry: {
  index: "index.ts",
  cli: "src/cli.ts",
  treaty: "src/treaty.ts",
},
```

**Step 5: Run the runtime test and build**

Run: `bun zenko test src/__tests__/treaty-runtime.test.ts`

Expected: PASS

Run: `bun zenko build`

Expected: PASS and `dist/treaty.*` is produced

**Step 6: Commit**

```bash
git add packages/zenko/src/treaty.ts packages/zenko/package.json packages/zenko/tsdown.config.ts packages/zenko/src/__tests__/treaty-runtime.test.ts
git commit -m "feat: add zenko treaty runtime"
```

---

### Task 3: Generate `*.treaty.gen.ts` from Existing `.gen.ts` Files

**Files:**

- Create: `packages/zenko/src/treaty-generator.ts`
- Create: `packages/zenko/src/utils/treaty-tree.ts`
- Modify: `packages/zenko/index.ts`
- Create: `packages/zenko/src/__tests__/treaty-generator.test.ts`

**Step 1: Write the failing generator snapshot test**

Create a temp `.gen.ts` fixture using the existing `tictactoe` generator, then prove the treaty generator emits the nested route tree and imports the new runtime.

```typescript
test("generates a nested treaty module from operationMetadata", async () => {
  const generatedPath = await writeGeneratedTictactoeModule()
  const output = await generateTreatyModule({
    inputFile: generatedPath,
    importPath: "./tictactoe.gen",
  })

  expect(output).toContain('import { createTreatyClient } from "zenko/treaty"')
  expect(output).toContain("export const treatyRoutes = {")
  expect(output).toContain('":row": {')
  expect(output).toContain('":column": {')
  expect(output).toContain("get: getSquare,")
  expect(output).toContain("put: putSquare,")
})
```

**Step 2: Run the generator test to verify it fails**

Run: `bun zenko test src/__tests__/treaty-generator.test.ts`

Expected: FAIL because `generateTreatyModule()` and the route-tree utility do not exist yet.

**Step 3: Implement the tree builder**

In `packages/zenko/src/utils/treaty-tree.ts`, convert `operationMetadata` into nested route keys:

```typescript
export type TreatyTreeNode = {
  [key: string]: TreatyTreeNode | string
}

export function buildTreatyTree(
  metadata: Record<string, { method: string; path: string }>
) {
  const root: Record<string, unknown> = {}

  for (const [operationId, definition] of Object.entries(metadata)) {
    const segments = definition.path
      .split("/")
      .filter(Boolean)
      .map((segment) =>
        segment.startsWith("{") && segment.endsWith("}")
          ? `:${segment.slice(1, -1)}`
          : segment
      )

    let cursor = root
    for (const segment of segments) {
      cursor[segment] ??= {}
      cursor = cursor[segment] as Record<string, unknown>
    }

    cursor[definition.method] = operationId
  }

  return root
}
```

**Step 4: Implement the module generator**

In `packages/zenko/src/treaty-generator.ts`, load the generated module via `pathToFileURL`, read `operationMetadata`, render the route tree, and emit a factory plus type aliases:

```typescript
export async function generateTreatyModule(options: {
  inputFile: string
  importPath: string
}) {
  const mod = await import(pathToFileURL(options.inputFile).href)
  const metadata = mod.operationMetadata as Record<
    string,
    { method: string; path: string }
  >
  const tree = buildTreatyTree(metadata)

  return [
    'import { createTreatyClient } from "zenko/treaty"',
    `import { ${Object.keys(metadata).join(", ")} } from ${JSON.stringify(options.importPath)}`,
    "",
    renderTreatyRoutes(tree),
    "",
    "export const createClient = (baseUrl: string, init?: { fetch?: typeof fetch }) =>",
    "  createTreatyClient({ baseUrl, routes: treatyRoutes, fetch: init?.fetch })",
    "",
  ].join("\\n")
}
```

Render the leaves as references to existing operation exports:

```typescript
export const treatyRoutes = {
  board: {
    get: getBoard,
    ":row": {
      ":column": {
        get: getSquare,
        put: putSquare,
      },
    },
  },
} as const
```

In `packages/zenko/index.ts`, export the generator:

```typescript
export { generateTreatyModule } from "./src/treaty-generator"
```

**Step 5: Run the generator test again**

Run: `bun zenko test src/__tests__/treaty-generator.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add packages/zenko/src/treaty-generator.ts packages/zenko/src/utils/treaty-tree.ts packages/zenko/index.ts packages/zenko/src/__tests__/treaty-generator.test.ts
git commit -m "feat: generate treaty modules from zenko output"
```

---

### Task 4: Add a CLI Command for Existing Generated Modules

**Files:**

- Modify: `packages/zenko/src/cli.ts`
- Modify: `packages/zenko/src/__tests__/cli.test.ts`

**Step 1: Write the failing CLI tests**

Add tests for a second-pass command that takes an existing `.gen.ts` file and writes a treaty module.

```typescript
test("generates a treaty module from an existing .gen.ts file", () => {
  const cliPath = path.join(process.cwd(), "src/cli.ts")
  const inputFile = path.join(tempDir, "tictactoe.gen.ts")
  const outputFile = path.join(tempDir, "tictactoe.treaty.gen.ts")

  writeGeneratedTictactoeModule(inputFile)

  execSync(`bun run ${cliPath} treaty ${inputFile} ${outputFile}`, {
    encoding: "utf8",
  })

  const output = fs.readFileSync(outputFile, "utf8")
  expect(output).toContain("export const treatyRoutes = {")
  expect(output).toContain('import { createTreatyClient } from "zenko/treaty"')
})

test("shows treaty usage in --help output", () => {
  const cliPath = path.join(process.cwd(), "src/cli.ts")
  const output = execSync(`bun run ${cliPath} --help`, { encoding: "utf8" })

  expect(output).toContain("zenko treaty <input-generated-file> <output-file>")
})
```

**Step 2: Run the CLI tests to verify they fail**

Run: `bun zenko test src/__tests__/cli.test.ts`

Expected: FAIL because the CLI does not understand the `treaty` subcommand yet.

**Step 3: Implement the `treaty` subcommand**

Refactor `parseArgs()` to capture the command explicitly:

```typescript
type ParsedArgs = {
  showHelp: boolean
  strictDates: boolean
  strictNumeric: boolean
  configPath?: string
  command: "generate" | "treaty"
  positional: string[]
}
```

In `main()`, branch early:

```typescript
if (parsed.command === "treaty") {
  if (parsed.positional.length !== 2) {
    printHelp()
    process.exit(1)
    return
  }

  const [inputFile, outputFile] = parsed.positional
  await generateTreatySingle({ inputFile, outputFile })
  return
}
```

Add a helper:

```typescript
async function generateTreatySingle(options: {
  inputFile: string
  outputFile: string
}) {
  const resolvedInput = path.resolve(options.inputFile)
  const resolvedOutput = path.resolve(options.outputFile)
  const output = await generateTreatyModule({
    inputFile: resolvedInput,
    importPath: relativeImportPath(resolvedOutput, resolvedInput),
  })

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true })
  fs.writeFileSync(resolvedOutput, output)
}
```

Update `printHelp()` to include both generation modes.

**Step 4: Run the CLI tests again**

Run: `bun zenko test src/__tests__/cli.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/cli.ts packages/zenko/src/__tests__/cli.test.ts
git commit -m "feat: add treaty CLI for generated modules"
```

---

### Task 5: Add the One-Step `openapi -> zenko -> treaty` Path

**Files:**

- Modify: `packages/zenko/src/cli.ts`
- Modify: `packages/zenko/zenko-config.schema.json`
- Modify: `packages/zenko/src/__tests__/cli.test.ts`

**Step 1: Write the failing one-step tests**

Add config-based coverage first, because it matches the current CLI design and requires the least surface area:

```typescript
test("supports treatyOutput in config generation", () => {
  const cliPath = path.join(process.cwd(), "src/cli.ts")
  const configPath = path.join(tempDir, "zenko.config.json")
  const outputFile = path.join(tempDir, "tictactoe.gen.ts")
  const treatyOutput = path.join(tempDir, "tictactoe.treaty.gen.ts")

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      schemas: [
        {
          input: path.relative(tempDir, tictactoeYamlPath),
          output: "tictactoe.gen.ts",
          treatyOutput: "tictactoe.treaty.gen.ts",
        },
      ],
    })
  )

  execSync(`bun run ${cliPath} --config ${configPath}`, { encoding: "utf8" })

  expect(fs.existsSync(outputFile)).toBe(true)
  expect(fs.existsSync(treatyOutput)).toBe(true)
})
```

If you want single-run positional support too, add one more test for:

```typescript
execSync(
  `bun run ${cliPath} ${tictactoeYamlPath} ${outputFile} --treaty-output ${treatyOutput}`,
  { encoding: "utf8" }
)
```

**Step 2: Run the CLI tests to verify they fail**

Run: `bun zenko test src/__tests__/cli.test.ts`

Expected: FAIL because `treatyOutput` is not part of the CLI/config contract yet.

**Step 3: Implement `treatyOutput` in config and optionally in single-run mode**

Extend the config type in `packages/zenko/src/cli.ts`:

```typescript
type CliConfigEntry = {
  input: string
  output: string
  treatyOutput?: string
  strictDates?: boolean
  strictNumeric?: boolean
  dateTimeOffset?: boolean | string[]
  types?: TypesConfig
  operationIds?: string[]
  openEnums?: boolean | string[] | EnumConfig
}
```

After `generateSingle()` writes the main `.gen.ts` file, call the treaty generator when configured:

```typescript
await generateSingle(...)

if (entry.treatyOutput) {
  await generateTreatySingle({
    inputFile: outputFile,
    outputFile: resolvePath(entry.treatyOutput, baseDir),
  })
}
```

Update `packages/zenko/zenko-config.schema.json` to document the field:

```json
"treatyOutput": {
  "type": "string",
  "description": "Optional output path for a Treaty-style client generated from the main Zenko .gen.ts output"
}
```

**Step 4: Run the CLI tests again**

Run: `bun zenko test src/__tests__/cli.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/cli.ts packages/zenko/zenko-config.schema.json packages/zenko/src/__tests__/cli.test.ts
git commit -m "feat: support one-step treaty generation"
```

---

### Task 6: Add End-to-End Validation and Documentation

**Files:**

- Create: `packages/zenko/src/__tests__/treaty-integration.test.ts`
- Modify: `README.md`

**Step 1: Write the failing end-to-end test**

This test should:

1. generate `tictactoe.gen.ts`
2. generate `tictactoe.treaty.gen.ts`
3. import the treaty client factory from the emitted module
4. mock `fetch`
5. prove the real generated API feels Eden-like

Use this test shape:

```typescript
test("generated treaty client supports nested get and put calls", async () => {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch

  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ winner: "." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )

  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ winner: "X" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )

  const { createClient } = await import(pathToFileURL(treatyModulePath).href)
  const client = createClient("https://api.test.com")

  const board = await client.board.get()
  const updated = await client.board({ row: "1" })({ column: "1" }).put("X")

  expect(board.error).toBeNull()
  expect(updated.error).toBeNull()
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "https://api.test.com/board",
    expect.objectContaining({ method: "GET" })
  )
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "https://api.test.com/board/1/1",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify("X"),
    })
  )
})
```

**Step 2: Run the integration test to verify it fails**

Run: `bun zenko test src/__tests__/treaty-integration.test.ts`

Expected: FAIL until the runtime, generator, and import paths all line up correctly.

**Step 3: Fix the remaining glue and add README usage**

Add a short README section showing both flows:

````md
## Treaty-style client generation

Generate the base Zenko module:

```bash
zenko petstore.yaml src/schema/petstore.gen.ts
zenko treaty src/schema/petstore.gen.ts src/schema/petstore.treaty.gen.ts
```
````

Or generate both in one config-driven run:

```json
{
  "schemas": [
    {
      "input": "petstore.yaml",
      "output": "src/schema/petstore.gen.ts",
      "treatyOutput": "src/schema/petstore.treaty.gen.ts"
    }
  ]
}
```

````

Keep the usage example short and aligned with Eden's shape:

```typescript
const client = createClient("https://api.example.com")

const pets = await client.pets.get()
const pet = await client.pets({ petId: "123" }).get()
````

**Step 4: Run the focused tests and whole-repo verification**

Run: `bun zenko test src/__tests__/treaty-runtime.test.ts src/__tests__/treaty-generator.test.ts src/__tests__/treaty-integration.test.ts src/__tests__/cli.test.ts`

Expected: PASS

Run: `bun check`

Expected: PASS

Run: `bun zenko test`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/__tests__/treaty-integration.test.ts README.md
git commit -m "docs: add treaty client usage and end-to-end coverage"
```

---

## Explicitly Deferred for the First Branch

- `subscribe` / WebSocket support
- SSE / stream parsing
- multipart and nested file heuristics
- passing an in-process `Elysia` app instance instead of a URL
- `throwHttpError`, hook arrays, and advanced response transforms

If any of these become hard requirements before implementation starts, split them into a follow-up plan instead of bloating the MVP branch.
