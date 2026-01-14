# Maintainability Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the large schema generator into focused modules and reduce duplicated logic in the operation parser.

**Architecture:** Move schema-building helpers into a `core/schema-generator/` folder with a small public index, and extract shared parsing helpers in `core/operation-parser.ts` so path and webhook handling share the same logic.

**Tech Stack:** TypeScript, Bun tests.

---

### Task 1: Add a refactor safety snapshot

**Files:**

- Create: `packages/zenko/src/__tests__/schema-generator-output.test.ts`
- Test: `packages/zenko/src/__tests__/schema-generator-output.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { tictactoeYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("schema generator output", () => {
  test("snapshot output for refactor safety", () => {
    const yaml = fs.readFileSync(tictactoeYamlPath, "utf8")
    const spec = parseYaml(yaml) as any
    const result = generate(spec)

    expect(result).toContain("export const paths")
    expect(result).toMatchSnapshot("schema-generator-output")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun zenko test src/__tests__/schema-generator-output.test.ts`
Expected: FAIL with missing snapshot.

**Step 3: Update snapshot**

Run: `bun zenko test -u src/__tests__/schema-generator-output.test.ts`
Expected: PASS with snapshot created.

**Step 4: Commit**

```bash
git add packages/zenko/src/__tests__/schema-generator-output.test.ts \
  packages/zenko/src/__tests__/__snapshots__/schema-generator-output.test.ts.snap
git commit -m "test: snapshot schema generator output"
```

---

### Task 2: Extract primitive builders

**Files:**

- Create: `packages/zenko/src/core/schema-generator/primitives.ts`
- Modify: `packages/zenko/src/core/schema-generator.ts`
- Test: `packages/zenko/src/__tests__/schema-generator-output.test.ts`

**Step 1: Move primitive helpers into a new module**

```ts
export function buildString(schema: any, options: SchemaOptions): string {
  /* existing body */
}
export function buildNumber(schema: any, options: SchemaOptions): string {
  /* existing body */
}
export function buildInteger(schema: any, options: SchemaOptions): string {
  /* existing body */
}
export function applyStrictArrayBounds(
  schema: any,
  builder: string,
  itemSchema: any,
  enforceBounds: boolean
): string {
  /* existing body */
}
export function isPrimitiveLike(schema: any): boolean {
  /* existing body */
}
export function applyNumericBounds(schema: any, builder: string): string {
  /* existing body */
}
```

**Step 2: Update imports in `schema-generator.ts`**

```ts
import {
  buildString,
  buildNumber,
  buildInteger,
  applyStrictArrayBounds,
  isPrimitiveLike,
  applyNumericBounds,
} from "./schema-generator/primitives"
```

**Step 3: Run test to verify it passes**

Run: `bun zenko test src/__tests__/schema-generator-output.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/zenko/src/core/schema-generator/primitives.ts \
  packages/zenko/src/core/schema-generator.ts
git commit -m "refactor: extract schema primitive builders"
```

---

### Task 3: Extract discriminator helpers

**Files:**

- Create: `packages/zenko/src/core/schema-generator/discriminators.ts`
- Modify: `packages/zenko/src/core/schema-generator.ts`
- Test: `packages/zenko/src/__tests__/schema-generator-output.test.ts`

**Step 1: Move discriminator helpers into a new module**

Move these functions into `discriminators.ts` and keep their exports:

- `extractDiscriminatorValuesFromSchema`
- `buildDiscriminatorMapping`
- `buildMappedDiscriminatorSchema`
- `buildZodDiscriminatedUnion`
- `getDiscriminatorRequiredProperties`

**Step 2: Update imports in `schema-generator.ts`**

```ts
import {
  extractDiscriminatorValuesFromSchema,
  buildDiscriminatorMapping,
  buildMappedDiscriminatorSchema,
  buildZodDiscriminatedUnion,
  getDiscriminatorRequiredProperties,
} from "./schema-generator/discriminators"
```

**Step 3: Run test to verify it passes**

Run: `bun zenko test src/__tests__/schema-generator-output.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/zenko/src/core/schema-generator/discriminators.ts \
  packages/zenko/src/core/schema-generator.ts
git commit -m "refactor: extract discriminator helpers"
```

---

### Task 4: Extract object builder helpers

**Files:**

- Create: `packages/zenko/src/core/schema-generator/objects.ts`
- Modify: `packages/zenko/src/core/schema-generator.ts`
- Test: `packages/zenko/src/__tests__/schema-generator-output.test.ts`

**Step 1: Move object helpers into a new module**

Move these functions into `objects.ts` and keep their exports:

- `buildZodObject`
- `applyDefaultModifier`

**Step 2: Update imports in `schema-generator.ts`**

```ts
import { buildZodObject } from "./schema-generator/objects"
```

**Step 3: Run test to verify it passes**

Run: `bun zenko test src/__tests__/schema-generator-output.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/zenko/src/core/schema-generator/objects.ts \
  packages/zenko/src/core/schema-generator.ts
git commit -m "refactor: extract object builder"
```

---

### Task 5: Consolidate schema-generator exports

**Files:**

- Modify: `packages/zenko/src/core/schema-generator.ts`
- Test: `packages/zenko/src/__tests__/schema-generator-output.test.ts`

**Step 1: Clean up `schema-generator.ts` as a public entry**

Ensure the file keeps exporting `generateZodSchema`, `applyOptionalModifier`, and any re-exported helpers from the new modules, without changing the external API.

**Step 2: Run test to verify it passes**

Run: `bun zenko test src/__tests__/schema-generator-output.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/zenko/src/core/schema-generator.ts
git commit -m "refactor: tidy schema generator exports"
```

---

### Task 6: Extract shared parameter collection in operation parser

**Files:**

- Modify: `packages/zenko/src/core/operation-parser.ts`
- Test: `packages/zenko/src/__tests__/webhook.test.ts`

**Step 1: Add a shared helper for parameter locations**

```ts
function collectParamsByLocation(
  parameters: any[],
  location: "header" | "query"
) {
  return parameters
    .filter((param) => param.in === location)
    .map((param) => ({
      name: param.name,
      schema: param.schema,
      required: param.required,
    }))
}
```

Use `collectParamsByLocation` in `getRequestHeaders` and `getQueryParams` to replace duplicated loops.

**Step 2: Run test to verify it passes**

Run: `bun zenko test src/__tests__/webhook.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/zenko/src/core/operation-parser.ts
git commit -m "refactor: consolidate parameter parsing"
```

---

### Task 7: Share path/webhook iteration logic

**Files:**

- Modify: `packages/zenko/src/core/operation-parser.ts`
- Test: `packages/zenko/src/__tests__/webhook.test.ts`

**Step 1: Extract a shared loop helper**

```ts
function parsePathItemMap(
  entries: Record<string, Record<string, unknown>>,
  nameMap?: Map<string, string>
): Operation[] {
  const operations: Operation[] = []

  for (const [path, pathItem] of Object.entries(entries)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      const normalizedMethod = method.toLowerCase()
      if (!isRequestMethod(normalizedMethod)) continue
      if (!(operation as { operationId?: string }).operationId) continue

      const pathParams = extractPathParams(path)
      const requestType = getRequestType(operation, nameMap)
      const { successResponse, errors } = getResponseTypes(
        operation,
        (operation as { operationId: string }).operationId,
        nameMap
      )
      const resolvedParameters = collectParameters(pathItem, operation, spec)
      const requestHeaders = getRequestHeaders(resolvedParameters)
      const queryParams = getQueryParams(resolvedParameters)

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
      })
    }
  }

  return operations
}
```

Use `parsePathItemMap` for both `spec.paths` and `spec.webhooks` (passing the webhook name as the path key for webhook entries).

**Step 2: Run test to verify it passes**

Run: `bun zenko test src/__tests__/webhook.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/zenko/src/core/operation-parser.ts
git commit -m "refactor: share path and webhook parsing"
```
