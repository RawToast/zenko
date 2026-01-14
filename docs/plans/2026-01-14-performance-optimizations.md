# Performance Optimizations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce repeated scans and linear lookups in code generation without changing output.

**Architecture:** Add a small snapshot test to lock output, then replace repeated array membership checks with Sets, share operation lookups across collectors, and memoize schema dependency extraction. Keep output identical while shrinking algorithmic hot spots.

**Tech Stack:** TypeScript, Bun tests, Zod generator.

---

### Task 1: Add a stable generation snapshot

**Files:**

- Create: `packages/zenko/src/__tests__/generation-output.test.ts`
- Test: `packages/zenko/src/__tests__/generation-output.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { tictactoeYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("generation output", () => {
  test("snapshot tictactoe output", () => {
    const yaml = fs.readFileSync(tictactoeYamlPath, "utf8")
    const spec = parseYaml(yaml) as any
    const result = generate(spec)

    expect(result).toContain("export const paths")
    expect(result).toMatchSnapshot("tictactoe-output")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun zenko test src/__tests__/generation-output.test.ts`
Expected: FAIL with missing snapshot.

**Step 3: Update snapshot**

Run: `bun zenko test -u src/__tests__/generation-output.test.ts`
Expected: PASS with snapshot created.

**Step 4: Commit**

```bash
git add packages/zenko/src/__tests__/generation-output.test.ts \
  packages/zenko/src/__tests__/__snapshots__/generation-output.test.ts.snap
git commit -m "test: snapshot tictactoe generator output"
```

---

### Task 2: Replace linear membership checks with Sets

**Files:**

- Modify: `packages/zenko/src/zenko.ts`
- Modify: `packages/zenko/src/core/schema-generator.ts`
- Test: `packages/zenko/src/__tests__/generation-output.test.ts`

**Step 1: Update schema filtering in generator**

```ts
const schemasToGenerate = operationIds?.length
  ? new Set(collectReferencedSchemas(operations, spec))
  : new Set(Object.keys(spec.components.schemas))

const sortedSchemas = topologicalSort(spec.components.schemas).filter((name) =>
  schemasToGenerate.has(name)
)
```

**Step 2: Precompute required property lookup**

```ts
const requiredProps = new Set(schema.required ?? [])
// later: requiredProps.has(propName)
```

**Step 3: Run test to verify it passes**

Run: `bun zenko test src/__tests__/generation-output.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/zenko/src/zenko.ts packages/zenko/src/core/schema-generator.ts
git commit -m "perf: replace linear membership checks with sets"
```

---

### Task 3: Share operation lookup across inline type collectors

**Files:**

- Create: `packages/zenko/src/utils/operation-lookup.ts`
- Modify: `packages/zenko/src/utils/collect-inline-types.ts`
- Modify: `packages/zenko/src/utils/collect-referenced-schemas.ts`
- Test: `packages/zenko/src/__tests__/generation-output.test.ts`

**Step 1: Add a shared lookup helper**

```ts
import type { OpenAPISpec } from "../zenko"

type OpenAPIOperation = { operationId?: string }

type OperationLookup = Map<string, OpenAPIOperation>

export function buildOperationLookup(spec: OpenAPISpec): OperationLookup {
  const lookup = new Map<string, OpenAPIOperation>()

  for (const [, pathItem] of Object.entries(spec.paths || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as OpenAPIOperation
      if (op.operationId) lookup.set(op.operationId, op)
    }
  }

  for (const [, pathItem] of Object.entries(spec.webhooks || {})) {
    for (const [, operation] of Object.entries(pathItem)) {
      const op = operation as OpenAPIOperation
      if (op.operationId) lookup.set(op.operationId, op)
    }
  }

  return lookup
}
```

**Step 2: Use the helper in collectors**

```ts
const operationLookup = buildOperationLookup(spec)
```

Replace duplicated loops in `collectInlineRequestTypes`, `collectInlineResponseTypes`, and `collectReferencedSchemas` with the helper.

**Step 3: Run test to verify it passes**

Run: `bun zenko test src/__tests__/generation-output.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/zenko/src/utils/operation-lookup.ts \
  packages/zenko/src/utils/collect-inline-types.ts \
  packages/zenko/src/utils/collect-referenced-schemas.ts
git commit -m "perf: reuse operation lookups"
```

---

### Task 4: Memoize dependency extraction for referenced schemas

**Files:**

- Modify: `packages/zenko/src/utils/collect-referenced-schemas.ts`
- Test: `packages/zenko/src/__tests__/generation-output.test.ts`

**Step 1: Cache extracted dependencies**

```ts
const dependencyCache = new Map<any, string[]>()
const getDependencies = (schema: any) => {
  if (!schema) return []
  if (dependencyCache.has(schema)) return dependencyCache.get(schema) ?? []
  const deps = extractDependencies(schema)
  dependencyCache.set(schema, deps)
  return deps
}
```

Use `getDependencies` wherever `extractDependencies` is called in this module.

**Step 2: Run test to verify it passes**

Run: `bun zenko test src/__tests__/generation-output.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/zenko/src/utils/collect-referenced-schemas.ts
git commit -m "perf: memoize schema dependency extraction"
```
