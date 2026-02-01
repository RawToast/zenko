# AGENTS

Instructions for AI coding agents working in the Zenko repository.

## Project Overview

Zenko is a TypeScript library for generating type-safe API clients from OpenAPI specs with Zod schema validation. It produces path functions, request/response types, and Zod validators that work with any HTTP library (fetch, axios, ky, undici, etc.).

**Key directories:**

- `packages/zenko/` - Main library source code
- `packages/zenko/src/core/` - Schema and operation parsing
- `packages/zenko/src/utils/` - Helper utilities
- `packages/zenko/src/__tests__/` - Integration tests
- `packages/examples/` - Example clients using generated code
- `packages/specs/` - OpenAPI spec files for testing

## Commands

Run all commands from the **workspace root**

### Essential Commands

| Command          | Description                                       |
| ---------------- | ------------------------------------------------- |
| `bun check`      | **Preferred** - runs lint, format, and type check |
| `bun zenko test` | Run all tests in packages/zenko                   |
| `turbo build`    | Build all packages                                |

### Build

```bash
bun zenko build          # Build zenko package (uses tsup)
turbo build              # Build all packages
```

### Lint & Format

```bash
bun lint                 # Fix lint issues (oxlint with --fix)
bun lint:check           # Check only (for CI/read-only)
bun format               # Fix formatting (oxfmt)
bun format:check         # Check only (for CI/read-only)
bun check                # Run all: lint + format + type-check
bun check:ci             # CI mode (no auto-fix)
```

### Testing

```bash
bun zenko test                                    # Run all tests
bun zenko test src/__tests__/cli.test.ts          # Single test file
bun zenko test src/__tests__/petstore.test.ts     # Another example
bun zenko test -u                                 # Update snapshots
bun zenko coverage                                # Run with coverage
turbo test                                        # Run tests across all packages
```

### Type Checking

```bash
bun zenko check-types    # Type check zenko package
turbo check-types        # Type check all packages
```

### Code Generation (Verification)

```bash
turbo codegen            # Generate examples in packages/examples
turbo build && bun packages/zenko/dist/cli.cjs --config packages/zenko/private/zenko.config.json
```

The private examples in `packages/zenko/private/` are useful for catching type errors that tests might miss.

## Code Style

### Imports

Order imports as follows (enforced by oxfmt):

1. Built-in modules (node:fs, etc.)
2. Third-party modules (zod, etc.)
3. Workspace modules (@zenko/\*)
4. Local modules (relative paths)

```typescript
import * as fs from "fs"
import * as path from "path"

import { z } from "zod"

import { someHelper } from "@zenko/specs"

import { toCamelCase } from "./utils/string-utils"
import type { Operation } from "./types/operation"
```

### Formatting (oxfmt)

- **Quotes:** Double quotes (`"`) always
- **Semicolons:** None
- **Indentation:** 2 spaces
- **Line width:** 80 characters
- **Trailing commas:** ES5 style
- **Arrow parens:** Always (`(x) => x`)
- **Bracket spacing:** `{ foo }` not `{foo}`

### Naming Conventions

| Type                | Convention               | Example                                  |
| ------------------- | ------------------------ | ---------------------------------------- |
| Variables/Functions | camelCase                | `generateZodSchema`, `isOpenEnum`        |
| Classes/Types       | PascalCase               | `OpenAPISpec`, `SchemaOptions`           |
| Constants           | camelCase or UPPER_SNAKE | `defaultOptions`, `MAX_RETRIES`          |
| Files               | kebab-case               | `schema-generator.ts`, `string-utils.ts` |
| Test files          | `*.test.ts`              | `cli.test.ts`, `petstore.test.ts`        |

### TypeScript

**Strict mode is enabled** with these key flags:

- `noUncheckedIndexedAccess` - Index access may return undefined
- `noUnusedLocals` - No unused variables
- `noUnusedParameters` - No unused parameters
- `noFallthroughCasesInSwitch` - Explicit case handling

**Best practices:**

- Export inferred Zod types: `export type Pet = z.infer<typeof Pet>`
- Prefer `type` over `interface` for type aliases
- Use `unknown` over `any` where possible
- Use `satisfies` for type checking without widening

### Error Handling

- Prefer Result-style returns for recoverable errors
- Use descriptive error messages with context
- Avoid throwing in library code when possible

```typescript
// Good: Result pattern
function parseSpec(
  yaml: string
): { success: true; data: Spec } | { success: false; error: string }

// Also acceptable: Descriptive throws
if (!schema.type) {
  throw new Error(`Schema "${name}" missing required 'type' field`)
}
```

## Testing

- **Framework:** Bun test (`bun:test`)
- **Location:** `packages/zenko/src/__tests__/` for integration tests
- **Unit tests:** Colocated in `__tests__/` folders near source
- **Snapshots:** Heavy use for output verification

```typescript
import { describe, test, expect } from "bun:test"

describe("feature", () => {
  test("should work correctly", () => {
    const result = someFunction()
    expect(result).toMatchSnapshot()
  })
})
```

**Snapshot tips:**

- Run `bun zenko test -u` to update snapshots after intentional changes
- Review snapshot diffs carefully in PRs
- Name snapshots descriptively: `expect(output).toMatchSnapshot("cli-petstore-output")`

## Repository Structure

```
zenko/
├── packages/
│   ├── zenko/           # Main library
│   │   ├── src/
│   │   │   ├── core/    # Schema & operation parsing
│   │   │   ├── utils/   # Helper functions
│   │   │   ├── types/   # TypeScript type definitions
│   │   │   └── __tests__/
│   │   ├── private/     # Private test examples (not published)
│   │   └── dist/        # Build output (generated)
│   ├── examples/        # Example API clients
│   └── specs/           # OpenAPI test specifications
├── turbo.json           # Turborepo configuration
├── .oxfmtrc.json        # Formatter configuration
└── .oxlintrc.json       # Linter configuration
```

## Pre-Commit Checklist

Before committing changes:

1. **Run checks:** `bun check`
2. **Run tests:** `bun zenko test`
3. **Verify codegen:** `turbo codegen`
4. **Check private examples:** Look for type errors in `packages/zenko/private/`

## Runtime Requirements

- **Bun:** >= 1.2.22 (1.3+ recommended)
- **Node:** >= 18 (for compatibility)
- **TypeScript:** ^5.x

## CI Notes

- GitHub Actions workflows in `.github/workflows/` must stay green
- CI runs `bun check:ci` (no auto-fix mode)
- All tests must pass before merge
- Generated `dist/` folder is not committed

## Common Patterns

### Adding a New Schema Feature

1. Update `packages/zenko/src/core/schema-generator.ts`
2. Add test case in `packages/zenko/src/__tests__/`
3. Create OpenAPI spec in `packages/specs/` if needed
4. Update snapshots: `bun zenko test -u`

### Debugging Generated Output

```bash
# Generate to stdout
bun packages/zenko/src/cli.ts path/to/spec.yaml

# Generate to file
bun packages/zenko/src/cli.ts path/to/spec.yaml output.ts
```
