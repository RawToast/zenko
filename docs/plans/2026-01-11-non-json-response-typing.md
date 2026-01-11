# Non-JSON Response Typing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure non-JSON responses emit string/enum schemas for text content types while preserving binary Blob/unknown handling.

**Architecture:** Add a content-type normalization helper that maps text-like responses to a string schema (preserving enum when present). Apply it when selecting response types and when collecting inline response schemas so generated Zod output and operation types stay consistent.

**Tech Stack:** TypeScript, Bun tests, Zod schema generator, OpenAPI v3 parser.

---

### Task 1: Update non-JSON response tests

**Files:**

- Modify: `packages/zenko/src/__tests__/non-json-responses.test.ts`
- Test: `packages/zenko/src/__tests__/non-json-responses.test.ts`

**Step 1: Write the failing test**

Unskip the suite and assert text responses produce `z.string()` or `z.enum` while binary uses Blob-safe schema.

```ts
// Example expectations
expect(result).toContain("export const ExportUsersCsvResponse = z.string();")
expect(result).toContain("export const ExportDataXmlResponse = z.string();")
expect(result).toContain(
  'export const GetHealthTextResponse = z.enum(["OK", "DEGRADED"]);'
)
expect(result).toContain("export const DownloadFileResponse =")
expect(result).toContain('typeof Blob === "undefined"')
```

**Step 2: Run test to verify it fails**

Run: `bun zenko test src/__tests__/non-json-responses.test.ts`
Expected: FAIL with missing snapshot and/or missing string/enum output.

**Step 3: Commit**

```bash
git add packages/zenko/src/__tests__/non-json-responses.test.ts
git commit -m "test: assert non-json response typing"
```

---

### Task 2: Add schema-utils normalization tests

**Files:**

- Modify: `packages/zenko/src/utils/__tests__/schema-utils.test.ts`
- Test: `packages/zenko/src/utils/__tests__/schema-utils.test.ts`

**Step 1: Write the failing test**

Add coverage for a new normalization helper that maps text-like content types to `type: "string"` and preserves enums.

```ts
import { normalizeResponseSchema } from "../schema-utils"

const enumSchema = { type: "string", enum: ["OK", "DEGRADED"] }
expect(normalizeResponseSchema("text/plain", enumSchema)).toEqual({
  type: "string",
  enum: ["OK", "DEGRADED"],
})

const xmlSchema = { type: "object", properties: { id: { type: "string" } } }
expect(normalizeResponseSchema("application/xml", xmlSchema)).toEqual({
  type: "string",
})
```

**Step 2: Run test to verify it fails**

Run: `bun zenko test src/utils/__tests__/schema-utils.test.ts`
Expected: FAIL because `normalizeResponseSchema` is missing or returns the wrong schema.

**Step 3: Commit**

```bash
git add packages/zenko/src/utils/__tests__/schema-utils.test.ts
git commit -m "test: cover non-json response normalization"
```

---

### Task 3: Update inline response collection tests

**Files:**

- Modify: `packages/zenko/src/utils/__tests__/collect-inline-types.test.ts`
- Test: `packages/zenko/src/utils/__tests__/collect-inline-types.test.ts`

**Step 1: Write the failing test**

Update the non-JSON response test to expect inline response schemas to be collected.

```ts
expect(result.size).toBe(1)
expect(result.get("TestOperationResponse")).toEqual({ type: "string" })
```

**Step 2: Run test to verify it fails**

Run: `bun zenko test src/utils/__tests__/collect-inline-types.test.ts`
Expected: FAIL because the map is still empty.

**Step 3: Commit**

```bash
git add packages/zenko/src/utils/__tests__/collect-inline-types.test.ts
git commit -m "test: collect non-json inline responses"
```

---

### Task 4: Implement response normalization and wiring

**Files:**

- Modify: `packages/zenko/src/utils/schema-utils.ts`
- Modify: `packages/zenko/src/core/operation-parser.ts`
- Modify: `packages/zenko/src/utils/collect-inline-types.ts`
- Modify: `packages/zenko/src/utils/collect-referenced-schemas.ts`
- Test: `packages/zenko/src/utils/__tests__/schema-utils.test.ts`
- Test: `packages/zenko/src/utils/__tests__/collect-inline-types.test.ts`
- Test: `packages/zenko/src/__tests__/non-json-responses.test.ts`

**Step 1: Write minimal implementation**

```ts
export function normalizeResponseSchema(contentType: string, schema?: any) {
  if (!schema) return schema
  if (!isTextContentType(contentType)) return schema
  if (schema.$ref) return schema
  const nullable = schema.nullable === true ? { nullable: true } : {}
  if (schema.enum) {
    return { type: "string", enum: schema.enum, ...nullable }
  }
  return { type: "string", ...nullable }
}
```

Use `normalizeResponseSchema` when selecting response schemas in `getResponseTypes`, `collectInlineResponseTypes`, and `collectReferencedSchemas` so response types and generated schemas stay aligned.

**Step 2: Run tests to verify they pass**

Run: `bun zenko test src/utils/__tests__/schema-utils.test.ts`
Expected: PASS

Run: `bun zenko test src/utils/__tests__/collect-inline-types.test.ts`
Expected: PASS

Run: `bun zenko test src/__tests__/non-json-responses.test.ts`
Expected: FAIL only for missing snapshot

**Step 3: Update snapshot**

Run: `bun zenko test -u src/__tests__/non-json-responses.test.ts`
Expected: PASS and snapshot created.

**Step 4: Re-run targeted test**

Run: `bun zenko test src/__tests__/non-json-responses.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/utils/schema-utils.ts \
  packages/zenko/src/core/operation-parser.ts \
  packages/zenko/src/utils/collect-inline-types.ts \
  packages/zenko/src/utils/collect-referenced-schemas.ts \
  packages/zenko/src/__tests__/non-json-responses.test.ts \
  packages/zenko/src/utils/__tests__/schema-utils.test.ts \
  packages/zenko/src/utils/__tests__/collect-inline-types.test.ts \
  packages/zenko/src/__tests__/__snapshots__/non-json-responses.test.ts.snap

git commit -m "feat: normalize non-json response schemas"
```
