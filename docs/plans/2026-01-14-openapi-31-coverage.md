# OpenAPI 3.1 Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add targeted OpenAPI 3.1 keyword coverage tests for YAML specs.

**Architecture:** Introduce a small OpenAPI 3.1 YAML fixture exposing keywords like `prefixItems`, `unevaluatedProperties`, and `type` arrays, export its path from `@zenko/specs`, and snapshot the generated output to ensure the generator accepts these inputs without errors.

**Tech Stack:** TypeScript, Bun tests, Zod generator, YAML parsing.

---

### Task 1: Add a focused OpenAPI 3.1 fixture

**Files:**

- Create: `packages/specs/resources/openapi-31-keywords.yaml`
- Modify: `packages/specs/index.ts`

**Step 1: Create the YAML fixture**

```yaml
openapi: "3.1.0"
info:
  title: "OpenAPI 3.1 Keywords"
  version: "1.0.0"
paths:
  /widgets:
    get:
      operationId: listWidgets
      responses:
        "200":
          description: "OK"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/WidgetList"
components:
  schemas:
    WidgetList:
      type: array
      items:
        $ref: "#/components/schemas/Widget"
    Widget:
      type: object
      required: [id, name]
      properties:
        id:
          type: integer
        name:
          type: string
        tag:
          type: ["null", "string"]
      unevaluatedProperties: false
    TupleExample:
      type: array
      prefixItems:
        - type: string
        - type: integer
      items: false
    ContainsExample:
      type: array
      items:
        type: string
      contains:
        type: string
```

**Step 2: Export the fixture path**

```ts
export const openapi31KeywordsYamlPath = resourcePath(
  "openapi-31-keywords.yaml"
)
```

**Step 3: Commit**

```bash
git add packages/specs/resources/openapi-31-keywords.yaml packages/specs/index.ts
git commit -m "test: add openapi 3.1 keywords fixture"
```

---

### Task 2: Add OpenAPI 3.1 keyword coverage test

**Files:**

- Create: `packages/zenko/src/__tests__/openapi-31-keywords.test.ts`
- Test: `packages/zenko/src/__tests__/openapi-31-keywords.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { openapi31KeywordsYamlPath } from "@zenko/specs"
import { parseYaml } from "../utils/yaml"
import { generate } from "../zenko"

describe("OpenAPI 3.1 keywords", () => {
  test("generates output for 3.1-only JSON Schema keywords", () => {
    const yaml = fs.readFileSync(openapi31KeywordsYamlPath, "utf8")
    const spec = parseYaml(yaml) as any
    const result = generate(spec)

    expect(result).toContain("export const Widget =")
    expect(result).toContain("export const WidgetList =")
    expect(result).toMatchSnapshot("openapi-31-keywords-output")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun zenko test src/__tests__/openapi-31-keywords.test.ts`
Expected: FAIL with missing snapshot.

**Step 3: Commit**

```bash
git add packages/zenko/src/__tests__/openapi-31-keywords.test.ts
git commit -m "test: cover openapi 3.1 keyword inputs"
```

---

### Task 3: Capture snapshot output

**Files:**

- Modify: `packages/zenko/src/__tests__/__snapshots__/openapi-31-keywords.test.ts.snap`

**Step 1: Update the snapshot**

Run: `bun zenko test -u src/__tests__/openapi-31-keywords.test.ts`
Expected: PASS with snapshot written.

**Step 2: Re-run test to verify it passes**

Run: `bun zenko test src/__tests__/openapi-31-keywords.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/zenko/src/__tests__/__snapshots__/openapi-31-keywords.test.ts.snap
git commit -m "test: snapshot openapi 3.1 keyword output"
```
