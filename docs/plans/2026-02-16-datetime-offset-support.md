# DateTime Offset Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `dateTimeOffset` config option (`boolean | string[]`) that controls whether generated datetime Zod schemas accept timezone offsets via `z.string().datetime({ offset: true })`.

**Architecture:** When `strictDates` is enabled, the `date-time` format currently emits `z.string().datetime()` which rejects valid RFC 3339 offset timestamps like `"2025-12-03T04:08:52.832229658+00:00"`. This adds a `dateTimeOffset` option (default `true`) that emits `z.string().datetime({ offset: true })` instead. The option supports `boolean` (all or nothing) or `string[]` (only specific schema type names). The pattern follows the existing `openEnums` implementation.

**Tech Stack:** TypeScript, Zod, Bun test runner

**Key Zod behavior:** `z.string().datetime({ offset: true })` still accepts `Z` suffix timestamps, so defaulting to `true` is backward compatible for runtime parsing.

---

### Task 1: Add `dateTimeOffset` to `SchemaOptions` and `buildString()`

**Files:**

- Modify: `packages/zenko/src/core/schema-generator.ts:1-10` (SchemaOptions type)
- Modify: `packages/zenko/src/core/schema-generator.ts:226-236` (buildString function)
- Test: `packages/zenko/src/core/__tests__/schema-generator.test.ts`

**Step 1: Write the failing tests**

Add these tests to `packages/zenko/src/core/__tests__/schema-generator.test.ts` after the existing "should apply date validators when strictDates is enabled" test (around line 157):

```typescript
test("should apply datetime offset when dateTimeOffset is true", () => {
  const options = { ...defaultOptions, strictDates: true, dateTimeOffset: true }
  expect(buildString({ format: "date-time" }, options)).toBe(
    "z.string().datetime({ offset: true })"
  )
  // date, time, duration should NOT be affected
  expect(buildString({ format: "date" }, options)).toBe("z.string().date()")
  expect(buildString({ format: "time" }, options)).toBe("z.string().time()")
  expect(buildString({ format: "duration" }, options)).toBe(
    "z.string().duration()"
  )
})

test("should not apply datetime offset when dateTimeOffset is false", () => {
  const options = {
    ...defaultOptions,
    strictDates: true,
    dateTimeOffset: false,
  }
  expect(buildString({ format: "date-time" }, options)).toBe(
    "z.string().datetime()"
  )
})

test("should apply datetime offset for specific types when dateTimeOffset is string[]", () => {
  const options = {
    ...defaultOptions,
    strictDates: true,
    dateTimeOffset: ["DateTime"] as string[] | boolean,
  }
  // When called with a matching schema name, should apply offset
  expect(buildString({ format: "date-time" }, options, "DateTime")).toBe(
    "z.string().datetime({ offset: true })"
  )
  // When called with a non-matching name, should NOT apply offset
  expect(buildString({ format: "date-time" }, options, "CreatedAt")).toBe(
    "z.string().datetime()"
  )
  // When called with no name, should NOT apply offset
  expect(buildString({ format: "date-time" }, options)).toBe(
    "z.string().datetime()"
  )
})

test("dateTimeOffset has no effect when strictDates is false", () => {
  const options = {
    ...defaultOptions,
    strictDates: false,
    dateTimeOffset: true,
  }
  expect(buildString({ format: "date-time" }, options)).toBe("z.string()")
})
```

Also update the `defaultOptions` at the top of the test file to include `dateTimeOffset: true`:

```typescript
const defaultOptions: SchemaOptions = {
  strictDates: false,
  strictNumeric: false,
  optionalType: "optional",
  openEnums: false,
  openEnumPrefix: "Unknown:",
  dateTimeOffset: true,
}
```

**Step 2: Run tests to verify they fail**

Run: `bun zenko test src/core/__tests__/schema-generator.test.ts`
Expected: FAIL — `dateTimeOffset` doesn't exist on `SchemaOptions` yet

**Step 3: Implement SchemaOptions change**

In `packages/zenko/src/core/schema-generator.ts`, add `dateTimeOffset` to the `SchemaOptions` type:

```typescript
export type SchemaOptions = {
  strictDates: boolean
  strictNumeric: boolean
  optionalType: "optional" | "nullable" | "nullish"
  openEnums: boolean | string[]
  openEnumPrefix: string
  dateTimeOffset: boolean | string[]
}
```

**Step 4: Update `buildString()` signature and implementation**

Update `buildString` to accept an optional `schemaName` parameter and handle `dateTimeOffset`:

```typescript
export function buildString(
  schema: any,
  options: SchemaOptions,
  schemaName?: string
): string {
  // ... binary check unchanged ...

  if (options.strictDates) {
    switch (schema.format) {
      case "date-time": {
        const useOffset =
          options.dateTimeOffset === true ||
          (Array.isArray(options.dateTimeOffset) &&
            schemaName !== undefined &&
            options.dateTimeOffset.includes(schemaName))
        return useOffset
          ? "z.string().datetime({ offset: true })"
          : "z.string().datetime()"
      }
      case "date":
        return "z.string().date()"
      case "time":
        return "z.string().time()"
      case "duration":
        return "z.string().duration()"
    }
  }
  // ... rest unchanged ...
}
```

**Step 5: Run tests to verify they pass**

Run: `bun zenko test src/core/__tests__/schema-generator.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/zenko/src/core/schema-generator.ts packages/zenko/src/core/__tests__/schema-generator.test.ts
git commit -m "feat: add dateTimeOffset to SchemaOptions and buildString"
```

---

### Task 2: Wire `dateTimeOffset` through `GenerateOptions` and `zenko.ts`

**Files:**

- Modify: `packages/zenko/src/zenko.ts:51-57` (GenerateOptions type)
- Modify: `packages/zenko/src/zenko.ts:94-114` (generateWithMetadata function)

**Step 1: Write the failing tests**

Add these tests to `packages/zenko/src/__tests__/config-options.test.ts`, inside a new `describe("dateTimeOffset option", () => { ... })` block after the existing `strictDates` describe block:

```typescript
describe("dateTimeOffset option", () => {
  test("default behavior (dateTimeOffset not set) - datetime gets offset when strictDates enabled", () => {
    const result = generate(stringFormatsSpec, { strictDates: true })

    // Default should be offset: true
    expect(result).toContain("createdAt: z.string().datetime({ offset: true })")
    expect(result).toContain("updatedAt: z.string().datetime({ offset: true })")
    expect(result).toContain("timestamp: z.string().datetime({ offset: true })")

    // Non-datetime date formats should NOT be affected
    expect(result).toContain("birthDate: z.string().date()")
    expect(result).toContain("lastLoginTime: z.string().time()")
    expect(result).toContain("sessionDuration: z.string().duration()")
  })

  test("dateTimeOffset: false - datetime without offset", () => {
    const result = generate(stringFormatsSpec, {
      strictDates: true,
      dateTimeOffset: false,
    })

    expect(result).toContain("createdAt: z.string().datetime()")
    expect(result).toContain("updatedAt: z.string().datetime()")
    expect(result).toContain("timestamp: z.string().datetime()")
  })

  test("dateTimeOffset: true - datetime with offset", () => {
    const result = generate(stringFormatsSpec, {
      strictDates: true,
      dateTimeOffset: true,
    })

    expect(result).toContain("createdAt: z.string().datetime({ offset: true })")
    expect(result).toContain("updatedAt: z.string().datetime({ offset: true })")
    expect(result).toContain("timestamp: z.string().datetime({ offset: true })")
  })

  test("dateTimeOffset has no effect when strictDates is false", () => {
    const result = generate(stringFormatsSpec, {
      strictDates: false,
      dateTimeOffset: true,
    })

    expect(result).toContain("createdAt: z.string()")
    expect(result).not.toContain("datetime")
  })

  test("dateTimeOffset as string array - only named types get offset", () => {
    // Use date-enum spec which has a top-level DateTime schema type
    const dateEnumSpec = loadOpenAPISpec("src/resources/date-enum.yaml")
    const result = generate(dateEnumSpec, {
      strictDates: true,
      dateTimeOffset: ["DateTime"],
    })

    // The DateTime type should have offset
    expect(result).toContain("DateTime = z.string().datetime({ offset: true })")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun zenko test src/__tests__/config-options.test.ts`
Expected: FAIL — `dateTimeOffset` not in `GenerateOptions`

**Step 3: Implement GenerateOptions change**

In `packages/zenko/src/zenko.ts`, add `dateTimeOffset` to `GenerateOptions`:

```typescript
export type GenerateOptions = {
  strictDates?: boolean
  strictNumeric?: boolean
  dateTimeOffset?: boolean | string[]
  types?: TypesConfig
  operationIds?: string[]
  openEnums?: boolean | string[] | EnumConfig
}
```

**Step 4: Wire through `generateWithMetadata()`**

In the destructuring and SchemaOptions construction:

```typescript
const {
  strictDates = false,
  strictNumeric = false,
  dateTimeOffset = true,
  operationIds,
  openEnums = false,
} = options
// ...
const schemaOptions: SchemaOptions = {
  strictDates,
  strictNumeric,
  dateTimeOffset,
  optionalType: typesConfig.optionalType,
  openEnums: enumConfig.open,
  openEnumPrefix: enumConfig.prefix,
}
```

**Step 5: Thread `schemaName` through the call chain**

Find where `buildString` is called in `schema-generator.ts` and pass through the schema name context. Look at how `generateZodSchema` calls `buildString` — the top-level schema name should be passed down when the schema is a direct `format: date-time` type (not a nested property).

The key call sites in `schema-generator.ts` where `buildString` is invoked need the schema name context. Specifically, when generating a top-level component schema like `DateTime`, the name `"DateTime"` should be passed as `schemaName`. For inline properties (like `createdAt` inside a User object), the schema name is the property key is not relevant — the array check applies to top-level type names only.

Look at the `generateZodSchema` function — it already receives the schema name when called from the top-level component iteration. Pass this through as context.

**Step 6: Run tests to verify they pass**

Run: `bun zenko test src/__tests__/config-options.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/zenko/src/zenko.ts packages/zenko/src/__tests__/config-options.test.ts
git commit -m "feat: wire dateTimeOffset through GenerateOptions pipeline"
```

---

### Task 3: Add `dateTimeOffset` to CLI config and JSON schema

**Files:**

- Modify: `packages/zenko/src/cli.ts:13-21` (CliConfigEntry type)
- Modify: `packages/zenko/src/cli.ts:152-165` (runFromConfig function)
- Modify: `packages/zenko/zenko-config.schema.json` (SchemaEntry definition)

**Step 1: Add to CliConfigEntry type**

In `packages/zenko/src/cli.ts`, add `dateTimeOffset` to `CliConfigEntry`:

```typescript
type CliConfigEntry = {
  input: string
  output: string
  strictDates?: boolean
  strictNumeric?: boolean
  dateTimeOffset?: boolean | string[]
  types?: TypesConfig
  operationIds?: string[]
  openEnums?: boolean | string[] | EnumConfig
}
```

**Step 2: Pass through in `runFromConfig()`**

In the `generateSingle` call inside `runFromConfig()`:

```typescript
await generateSingle({
  inputFile,
  outputFile,
  strictDates: entry.strictDates ?? parsed.strictDates,
  strictNumeric: entry.strictNumeric ?? parsed.strictNumeric,
  dateTimeOffset: entry.dateTimeOffset,
  typesConfig,
  operationIds: entry.operationIds,
  openEnums: entry.openEnums,
})
```

**Step 3: Add to `generateSingle` options type**

```typescript
async function generateSingle(options: {
  inputFile: string
  outputFile: string
  strictDates: boolean
  strictNumeric: boolean
  dateTimeOffset?: boolean | string[]
  typesConfig?: TypesConfig
  operationIds?: string[]
  openEnums?: boolean | string[] | EnumConfig
})
```

And pass it to `generateWithMetadata`:

```typescript
const result = generateWithMetadata(spec, {
  strictDates,
  strictNumeric,
  dateTimeOffset,
  types: typesConfig,
  operationIds,
  openEnums,
})
```

**Step 4: Update JSON config schema**

In `packages/zenko/zenko-config.schema.json`, add `dateTimeOffset` to the `SchemaEntry` definition properties, after `strictDates`:

```json
"dateTimeOffset": {
  "oneOf": [
    { "type": "boolean" },
    {
      "type": "array",
      "items": { "type": "string" }
    }
  ],
  "default": true,
  "description": "Control timezone offset support in datetime validation. When true (default), generates z.string().datetime({ offset: true }) which accepts both 'Z' and '+HH:MM' offset formats. When false, generates z.string().datetime() which only accepts 'Z' format. When array of type names, only those named schema types get offset support. Only applies when strictDates is enabled."
}
```

**Step 5: Run full test suite**

Run: `bun zenko test`
Expected: PASS (some snapshot tests may need updating)

**Step 6: Commit**

```bash
git add packages/zenko/src/cli.ts packages/zenko/zenko-config.schema.json
git commit -m "feat: add dateTimeOffset to CLI config and JSON schema"
```

---

### Task 4: Update existing tests and snapshots

**Files:**

- Modify: `packages/zenko/src/__tests__/config-options.test.ts` (update existing strictDates tests)
- Modify: `packages/zenko/src/__tests__/date-enum.test.ts`
- Modify: `packages/zenko/src/__tests__/cli.test.ts`
- Modify: `packages/zenko/src/__tests__/petstore.test.ts`

**Step 1: Update existing strictDates tests**

Since `dateTimeOffset` defaults to `true`, existing tests that check for `z.string().datetime()` with `strictDates: true` now need to expect `z.string().datetime({ offset: true })` unless they explicitly set `dateTimeOffset: false`.

In `config-options.test.ts`, update these expectations:

- Line 37: `"createdAt: z.string().datetime()"` → `"createdAt: z.string().datetime({ offset: true })"`
- Line 38: `"updatedAt: z.string().datetime()"` → `"updatedAt: z.string().datetime({ offset: true })"`
- Line 39: `"timestamp: z.string().datetime()"` → `"timestamp: z.string().datetime({ offset: true })"`
- Line 102: Same pattern
- Line 341: Same pattern

In `cli.test.ts`, line 184:

- `"z.string().datetime()"` → `"z.string().datetime({ offset: true })"`

In `petstore.test.ts`, line 116:

- `"z.string().datetime()"` → `"z.string().datetime({ offset: true })"`

**Step 2: Update snapshots**

Run: `bun zenko test -u`

This will update snapshot files that contain `z.string().datetime()` to use the new offset format.

**Step 3: Run full test suite to confirm**

Run: `bun zenko test`
Expected: ALL PASS

**Step 4: Run full checks**

Run: `bun check`
Expected: Lint, format, and type check all pass

**Step 5: Run codegen for examples**

Run: `turbo codegen`
Expected: Examples regenerate successfully with the new offset default

**Step 6: Commit**

```bash
git add -A
git commit -m "test: update existing tests for dateTimeOffset default true"
```

---

### Task 5: Add a dedicated test YAML resource for offset datetime validation

**Files:**

- Create: `packages/zenko/src/resources/datetime-offset.yaml`
- Modify: `packages/zenko/src/__tests__/config-options.test.ts`

**Step 1: Create test YAML spec**

Create `packages/zenko/src/resources/datetime-offset.yaml` — an OpenAPI spec that models the user's real-world scenario with mixed datetime formats:

```yaml
openapi: 3.0.0
info:
  title: DateTime Offset Test API
  version: 1.0.0
  description: Test API for datetime offset handling with mixed timestamp formats

paths:
  /accounts/{accountId}:
    get:
      operationId: getAccount
      parameters:
        - name: accountId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: Account found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Account"

  /accounts/{accountId}/api-keys:
    get:
      operationId: listApiKeys
      parameters:
        - name: accountId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: API keys listed
          content:
            application/json:
              schema:
                type: object
                properties:
                  livePublic:
                    type: array
                    items:
                      $ref: "#/components/schemas/ApiKey"

components:
  schemas:
    DateTime:
      type: string
      format: date-time
      example: "2014-09-23T05:00:22.231Z"

    Account:
      type: object
      required:
        - id
        - email
        - registeredAt
        - lastActiveAt
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        registeredAt:
          $ref: "#/components/schemas/DateTime"
        lastActiveAt:
          $ref: "#/components/schemas/DateTime"
        verifiedAt:
          $ref: "#/components/schemas/DateTime"
        suspendedAt:
          $ref: "#/components/schemas/DateTime"

    ApiKey:
      type: object
      required:
        - apiKeyId
        - apiKeyValue
        - issuedAt
      properties:
        apiKeyId:
          type: string
        apiKeyValue:
          type: string
        issuedAt:
          type: string
          format: date-time
```

**Step 2: Write integration tests**

Add a new describe block in `packages/zenko/src/__tests__/config-options.test.ts`:

```typescript
describe("dateTimeOffset with realistic spec", () => {
  const offsetSpec = loadOpenAPISpec("src/resources/datetime-offset.yaml")

  test("default: all datetime fields accept offsets", () => {
    const result = generate(offsetSpec, { strictDates: true })

    // Top-level DateTime type should have offset
    expect(result).toContain("DateTime = z.string().datetime({ offset: true })")
    // Inline datetime field should also have offset
    expect(result).toContain("issuedAt: z.string().datetime({ offset: true })")
  })

  test("dateTimeOffset: false disables offset globally", () => {
    const result = generate(offsetSpec, {
      strictDates: true,
      dateTimeOffset: false,
    })

    expect(result).toContain("DateTime = z.string().datetime()")
    expect(result).toContain("issuedAt: z.string().datetime()")
    expect(result).not.toContain("offset")
  })

  test("dateTimeOffset array: only named types get offset", () => {
    const result = generate(offsetSpec, {
      strictDates: true,
      dateTimeOffset: ["DateTime"],
    })

    // Named type should get offset
    expect(result).toContain("DateTime = z.string().datetime({ offset: true })")
    // Inline field should NOT get offset (not in the array)
    expect(result).toContain("issuedAt: z.string().datetime()")
  })

  test("snapshot: full output with offset enabled", () => {
    const result = generate(offsetSpec, { strictDates: true })
    expect(result).toMatchSnapshot("datetime-offset-default")
  })

  test("snapshot: full output with offset disabled", () => {
    const result = generate(offsetSpec, {
      strictDates: true,
      dateTimeOffset: false,
    })
    expect(result).toMatchSnapshot("datetime-offset-disabled")
  })
})
```

**Step 3: Run tests**

Run: `bun zenko test src/__tests__/config-options.test.ts -u`
Expected: PASS, snapshots created

**Step 4: Run full suite**

Run: `bun zenko test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/zenko/src/resources/datetime-offset.yaml packages/zenko/src/__tests__/config-options.test.ts packages/zenko/src/__tests__/__snapshots__/
git commit -m "test: add dedicated datetime offset integration tests"
```

---

### Task 6: Final verification

**Step 1: Run full checks**

Run: `bun check`
Expected: Lint, format, and type checks all pass

**Step 2: Run full test suite**

Run: `bun zenko test`
Expected: ALL PASS

**Step 3: Build**

Run: `turbo build`
Expected: Build succeeds

**Step 4: Run codegen for examples**

Run: `turbo codegen`
Expected: Examples regenerate — generated files in `packages/zenko/src/src/external/` will now contain `z.string().datetime({ offset: true })` instead of `z.string().datetime()`

**Step 5: Run private codegen for type checking**

Run: `bun packages/zenko/dist/cli.cjs --config packages/zenko/private/zenko.config.json`
Expected: Generates successfully, no type errors in the private examples

**Step 6: Final commit if any remaining changes**

```bash
git add -A
git commit -m "chore: regenerate examples with dateTimeOffset default"
```
