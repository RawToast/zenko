# Operation Type Suffix Configuration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to customize the suffix appended to operation type names (default `"Operation"`) to avoid naming collisions with schema types (e.g., Fireblocks API has a `GetTransactionOperation` enum that clashes with the generated `GetTransactionOperation` type).

**Architecture:** Add `operationTypeSuffix` option to `TypesConfig` (under `types`), flowing through the existing global/per-schema config merge. Extract a shared helper function to compute operation type names from one place. Default remains `"Operation"` for backwards compatibility.

**Tech Stack:** TypeScript, Bun test, OpenAPI YAML specs, JSON Schema

---

### Task 1: Add Fireblocks spec export to @zenko/specs

**Files:**

- Modify: `packages/specs/index.ts`

**Step 1: Add the export**

Add after the existing exports in `packages/specs/index.ts`:

```typescript
export const fireblocksV2YamlPath = resourcePath("fireblocks-v2.yaml")
```

**Step 2: Verify it builds**

Run: `turbo build --filter=@zenko/specs`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add packages/specs/index.ts
git commit -m "feat(specs): export fireblocks-v2 spec path"
```

---

### Task 2: Add `operationTypeSuffix` to TypesConfig and GenerateOptions

**Files:**

- Modify: `packages/zenko/src/zenko.ts` — Add to `TypesConfig` (line 40), `NormalizedTypesConfig` (line 547), and `normalizeTypesConfig()` (line 535)

**Step 1: Update TypesConfig type**

In `packages/zenko/src/zenko.ts`, add `operationTypeSuffix` to `TypesConfig`:

```typescript
export type TypesConfig = {
  emit?: boolean
  helpers?: TypesHelperMode
  helpersOutput?: string
  treeShake?: boolean
  optionalType?: "optional" | "nullable" | "nullish"
  operationTypeSuffix?: string
}
```

**Step 2: Update NormalizedTypesConfig type**

```typescript
type NormalizedTypesConfig = {
  emit: boolean
  helpers: TypesHelperMode
  helpersOutput: string
  treeShake: boolean
  optionalType: "optional" | "nullable" | "nullish"
  operationTypeSuffix: string
}
```

**Step 3: Update normalizeTypesConfig()**

```typescript
function normalizeTypesConfig(
  config: TypesConfig | undefined
): NormalizedTypesConfig {
  return {
    emit: config?.emit ?? true,
    helpers: config?.helpers ?? "package",
    helpersOutput: config?.helpersOutput ?? "./zenko-types",
    treeShake: config?.treeShake ?? true,
    optionalType: config?.optionalType ?? "optional",
    operationTypeSuffix: config?.operationTypeSuffix ?? "Operation",
  }
}
```

**Step 4: Extract a shared helper for computing operation type names**

Add this helper function (near `generateOperationTypes`):

```typescript
/**
 * Computes the operation type name for a given operationId.
 * Uses the configured suffix to avoid naming collisions with schema types.
 */
function operationTypeName(
  camelCaseOperationId: string,
  suffix: string
): string {
  return `${capitalize(camelCaseOperationId)}${suffix}`
}
```

**Step 5: Use the helper in `generateOperationTypes()` (line 682)**

Replace:

```typescript
buffer.push(
  `export type ${capitalize(camelCaseOperationId)}Operation = OperationDefinition<`
)
```

With:

```typescript
const typeName = operationTypeName(
  camelCaseOperationId,
  config.operationTypeSuffix
)
buffer.push(`export type ${typeName} = OperationDefinition<`)
```

**Step 6: Use the helper in the operation objects section (line 427)**

Replace:

```typescript
const typeAnnotation = typesConfig.emit
  ? `: ${capitalize(camelCaseOperationId)}Operation`
  : ""
```

With:

```typescript
const typeAnnotation = typesConfig.emit
  ? `: ${operationTypeName(camelCaseOperationId, typesConfig.operationTypeSuffix)}`
  : ""
```

**Step 7: Run type check**

Run: `bun zenko check-types`
Expected: SUCCESS (no type errors)

**Step 8: Commit**

```bash
git add packages/zenko/src/zenko.ts
git commit -m "feat: add operationTypeSuffix to TypesConfig with shared helper"
```

---

### Task 3: Update JSON config schema

**Files:**

- Modify: `packages/zenko/zenko-config.schema.json`

**Step 1: Add `operationTypeSuffix` to the TypesConfig definition**

In the `TypesConfig` definition (inside `definitions.TypesConfig.properties`), add:

```json
"operationTypeSuffix": {
  "type": "string",
  "default": "Operation",
  "description": "Suffix appended to operation type names (e.g., 'GetUserOperation'). Override to avoid naming collisions with schema types that already use 'Operation' in their name."
}
```

**Step 2: Commit**

```bash
git add packages/zenko/zenko-config.schema.json
git commit -m "feat: add operationTypeSuffix to config schema"
```

---

### Task 4: Update CLI to pass operationTypeSuffix through

**Files:**

- Modify: `packages/zenko/src/cli.ts`

No changes needed! The CLI already merges `types` config via `resolveTypesConfig()` which does a spread merge of base + entry. Since `operationTypeSuffix` is inside `TypesConfig`, it flows through automatically. Verify this by reading `resolveTypesConfig()` in cli.ts (lines 211-220).

---

### Task 5: Write tests for default behavior (backwards compatibility)

**Files:**

- Create: `packages/zenko/src/__tests__/operation-suffix.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, test, expect } from "bun:test"
import { fireblocksV2YamlPath } from "@zenko/specs"
import { generate, type OpenAPISpec } from "../zenko"
import { loadOpenAPISpec } from "../utils/yaml"

describe("operationTypeSuffix", () => {
  describe("default behavior", () => {
    test("uses 'Operation' suffix by default", () => {
      const spec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/users/{id}": {
            get: {
              operationId: "getUser",
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }

      const result = generate(spec)

      expect(result).toContain(
        "export type GetUserOperation = OperationDefinition<"
      )
      expect(result).toContain(": GetUserOperation")
    })
  })
})
```

**Step 2: Run the test**

Run: `bun zenko test src/__tests__/operation-suffix.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/zenko/src/__tests__/operation-suffix.test.ts
git commit -m "test: add default operation suffix test"
```

---

### Task 6: Write tests for custom suffix

**Files:**

- Modify: `packages/zenko/src/__tests__/operation-suffix.test.ts`

**Step 1: Add custom suffix tests**

Add to the describe block:

```typescript
describe("custom suffix", () => {
  test("uses custom suffix when provided", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/users/{id}": {
          get: {
            operationId: "getUser",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }

    const result = generate(spec, {
      types: { operationTypeSuffix: "ApiOperation" },
    })

    expect(result).toContain(
      "export type GetUserApiOperation = OperationDefinition<"
    )
    expect(result).toContain(": GetUserApiOperation")
    expect(result).not.toContain("GetUserOperation")
  })

  test("empty suffix removes suffix entirely", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/users/{id}": {
          get: {
            operationId: "getUser",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }

    const result = generate(spec, {
      types: { operationTypeSuffix: "" },
    })

    expect(result).toContain("export type GetUser = OperationDefinition<")
    expect(result).toContain(": GetUser =")
    expect(result).not.toContain("GetUserOperation")
  })

  test("suffix is ignored when types.emit is false", () => {
    const spec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/users/{id}": {
          get: {
            operationId: "getUser",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    }

    const result = generate(spec, {
      types: { emit: false, operationTypeSuffix: "Custom" },
    })

    expect(result).not.toContain("GetUserCustom")
    expect(result).not.toContain("GetUserOperation")
    expect(result).not.toContain("OperationDefinition<")
  })
})
```

**Step 2: Run the tests**

Run: `bun zenko test src/__tests__/operation-suffix.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/zenko/src/__tests__/operation-suffix.test.ts
git commit -m "test: add custom and empty operation suffix tests"
```

---

### Task 7: Write Fireblocks naming collision test

This is the real-world test that proves the feature solves the actual problem.

**Files:**

- Modify: `packages/zenko/src/__tests__/operation-suffix.test.ts`

**Step 1: Add Fireblocks collision test**

Add to the test file:

```typescript
describe("naming collision avoidance", () => {
  test("fireblocks spec: getTransaction conflicts with GetTransactionOperation schema", () => {
    const fireblocksSpec = loadOpenAPISpec(fireblocksV2YamlPath)

    // Generate only the conflicting operation to keep the test focused
    const resultDefault = generate(fireblocksSpec, {
      operationIds: ["getTransaction"],
    })

    // With default "Operation" suffix, both the schema enum AND the operation type
    // would be named GetTransactionOperation — this is the collision
    const typeMatches = resultDefault.match(
      /export type GetTransactionOperation/g
    )
    // There should be a collision: the schema type AND the operation type both exist
    expect(typeMatches?.length).toBeGreaterThanOrEqual(1)

    // With a custom suffix, we can avoid the collision
    const resultCustom = generate(fireblocksSpec, {
      operationIds: ["getTransaction"],
      types: { operationTypeSuffix: "Op" },
    })

    // The schema enum should still be GetTransactionOperation
    expect(resultCustom).toContain("export const GetTransactionOperation =")
    // But the operation type should use the custom suffix
    expect(resultCustom).toContain(
      "export type GetTransactionOp = OperationDefinition<"
    )
    // And the operation object should reference the custom type
    expect(resultCustom).toContain(": GetTransactionOp =")
  })

  test("fireblocks spec: custom suffix resolves all naming conflicts", () => {
    const fireblocksSpec = loadOpenAPISpec(fireblocksV2YamlPath)

    // Use a few operations to verify no other collisions with "Op" suffix
    const result = generate(fireblocksSpec, {
      operationIds: ["getTransaction", "getTransactions"],
      types: { operationTypeSuffix: "Op" },
    })

    // Schema types should be unchanged
    expect(result).toContain("export const GetTransactionOperation =")
    // Operation types should use new suffix
    expect(result).toContain(
      "export type GetTransactionOp = OperationDefinition<"
    )
    expect(result).toContain(
      "export type GetTransactionsOp = OperationDefinition<"
    )
  })
})
```

**Step 2: Run the tests**

Run: `bun zenko test src/__tests__/operation-suffix.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/zenko/src/__tests__/operation-suffix.test.ts
git commit -m "test: add fireblocks naming collision test for operationTypeSuffix"
```

---

### Task 8: Update existing snapshot tests

**Step 1: Run all tests to check for snapshot failures**

Run: `bun zenko test`
Expected: All existing tests should still PASS since default is still `"Operation"`

If snapshots fail, update them:
Run: `bun zenko test -u`

**Step 2: Run full check**

Run: `bun check`
Expected: SUCCESS (lint, format, type check all pass)

**Step 3: Commit if snapshots were updated**

```bash
git add -A
git commit -m "chore: update snapshots for operation suffix refactor"
```

---

## Summary of Changes

| File                                                    | Change                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/specs/index.ts`                               | Export `fireblocksV2YamlPath`                                                                                                                                                                            |
| `packages/zenko/src/zenko.ts`                           | Add `operationTypeSuffix` to `TypesConfig`, `NormalizedTypesConfig`, `normalizeTypesConfig()`. Extract `operationTypeName()` helper. Use it in `generateOperationTypes()` and operation objects section. |
| `packages/zenko/zenko-config.schema.json`               | Add `operationTypeSuffix` to `TypesConfig` definition                                                                                                                                                    |
| `packages/zenko/src/__tests__/operation-suffix.test.ts` | New test file: default suffix, custom suffix, empty suffix, emit:false, Fireblocks collision test                                                                                                        |

## Verification Checklist

- [ ] `bun check` passes (lint + format + types)
- [ ] `bun zenko test` passes (all tests including new ones)
- [ ] Default behavior unchanged (existing snapshots still valid)
- [ ] Fireblocks collision is resolved with custom suffix
