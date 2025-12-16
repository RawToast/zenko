# Zenko

[![CI](https://github.com/RawToast/zenko/actions/workflows/ci.yml/badge.svg)](https://github.com/RawToast/zenko/actions/workflows/ci.yml)

A work in progress TypeScript generator for OpenAPI specifications that creates **Zod schemas**, **type-safe path functions**, and **operation objects**.

Unlike most OpenAPI generators, Zenko does not create a client. Instead you are free to use your own fetch wrapper or library of choice.

## Features

- 🔧 **Zod Schema Generation** - Generates runtime-validated Zod schemas from OpenAPI schemas
- 🛣️ **Type-safe Path Functions** - Creates functions to build API paths with proper TypeScript types
- 📋 **Operation Objects** - Generates objects containing path functions, request validation, and response types
- 🧰 **Operation Type Helpers** - Import `PathFn`, `HeaderFn`, `OperationDefinition`, and `OperationErrors` to power reusable clients
- 🔄 **Dependency Resolution** - Automatically resolves schema dependencies with topological sorting
- ⚡ **CLI & Programmatic API** - Use via command line or import as a library

## Installation

Note: Zenko requires Bun 1.2.22 or higher.

An npm package may be available in the future if there is demand.

### One-time Usage

```bash
# Use directly with bunx (no installation required)
bunx zenko input.yaml output.ts
```

### Install for Repeated Use

```bash
# Install globally
bun install -g zenko

# Or install locally
bun add zenko
```

## Usage

### Command Line

```bash
# Generate TypeScript types from OpenAPI spec
zenko input.yaml output.ts
zenko petstore.json api-types.ts

# Enable strict guards (date + numeric metadata only; validation coming soon)
zenko input.yaml output.ts --strict-dates --strict-numeric

# Drive multiple specs from a config file
zenko --config zenko.config.json

# Show help
zenko --help
zenko -h

# One-time usage (no installation)
bunx zenko input.yaml output.ts
```

### Config File

The config file controls generation for multiple specs and can also configure type helper emission.

```json
{
  "$schema": "https://raw.githubusercontent.com/RawToast/zenko/refs/heads/master/packages/zenko/zenko-config.schema.json",
  "types": {
    "emit": true,
    "helpers": "package",
    "treeShake": true,
    "optionalType": "optional"
  },
  "schemas": [
    {
      "input": "my-api.yaml",
      "output": "my-api.gen.ts"
    },
    {
      "input": "my-strict-api.yaml",
      "output": "my-strict-api.gen.ts",
      "strictDates": true,
      "strictNumeric": true,
      "types": {
        "helpers": "inline"
      }
    },
    {
      "input": "my-custom-api.yaml",
      "output": "my-custom-api.gen.ts",
      "operationIds": ["getUser", "createUser", "updateUser"],
      "types": {
        "helpers": "file",
        "helpersOutput": "./shared/api-helpers.ts",
        "treeShake": false
      }
    }
  ]
}
```

#### Type Helper Modes

- `helpers: "package"` (default) imports helpers from `zenko`
- `helpers: "inline"` writes the helper definitions into each generated file
- `helpers: "file"` imports from a custom module (`helpersOutput` path)
- `emit: false` disables per-operation type aliases entirely

#### Additional Type Configuration

- `treeShake: true` (default) - Only generates types used in operations
- `treeShake: false` - Generates all types from the schema
- `optionalType: "optional"` (default) - Fields can be undefined (`z.optional()`)
- `optionalType: "nullable"` - Fields can be null (`z.nullable()`)
- `optionalType: "nullish"` - Fields can be undefined or null (`z.nullish()`)

#### Selective Operations

Generate only specific operations using `operationIds`:

```json
{
  "$schema": "https://raw.githubusercontent.com/RawToast/zenko/refs/heads/master/packages/zenko/zenko-config.schema.json",
  "schemas": [
    {
      "input": "api.yaml",
      "output": "api.gen.ts",
      "operationIds": ["getUser", "createUser", "updateUser"]
    }
  ]
}
```

### Programmatic Usage

```typescript
import { generate, type OpenAPISpec } from "zenko"
import * as fs from "fs"
import { load } from "js-yaml"

// Load your OpenAPI spec
const spec = load(fs.readFileSync("api.yaml", "utf8")) as OpenAPISpec

// Generate TypeScript code
const output = generate(spec)

// Write to file
fs.writeFileSync("types.ts", output)
```

#### ES Modules

```typescript
import { generate } from "zenko"
```

#### CommonJS

```javascript
const { generate } = require("zenko")
```

## Generated Output

Zenko generates three main types of code:

### 1. Zod Schemas

```typescript
import { z } from "zod"

// Enum schemas
export const OtpDispatchMethod = z.enum(["SMS", "VOICE"])
export type OtpDispatchMethod = z.infer<typeof OtpDispatchMethod>

// Object schemas with dependencies resolved
export const Recaptcha = z.object({
  recaptcha_token: z.string(),
  recaptcha_platform: z.enum(["Web", "IOS", "ANDROID", "CHECKOUT"]),
})
export type Recaptcha = z.infer<typeof Recaptcha>

// Complex request/response schemas
export const AuthenticateRequest = z.object({
  recaptcha: Recaptcha,
  otp_dispatch_method: OtpDispatchMethod,
})
export type AuthenticateRequest = z.infer<typeof AuthenticateRequest>
```

### 2. Path Functions

```typescript
// Path Functions
export const paths = {
  // Simple paths
  getUser: () => "/user",

  // Parameterized paths with TypeScript types
  getUserById: ({ userId }: { userId: string }) => `/users/${userId}`,
  updatePost: ({ userId, postId }: { userId: string; postId: string }) =>
    `/users/${userId}/posts/${postId}`,
} as const
```

### 3. Operation Objects & Types

```typescript
// Operation Objects
export const authenticateUser = {
  path: paths.authenticateUser,
  request: AuthenticateRequest.safeParse,
  response: AuthenticateResponse,
} as const

export const getUserById = {
  path: paths.getUserById,
  response: UserResponse,
} as const

// Operation Types
import type { OperationDefinition, OperationErrors } from "zenko"

export type AuthenticateUserOperation = OperationDefinition<
  typeof paths.authenticateUser,
  typeof AuthenticateRequest,
  typeof AuthenticateResponse,
  undefined,
  OperationErrors
>
```

## Example Usage in Your App

```typescript
import {
  paths,
  authenticateUser,
  type AuthenticateUserOperation,
  AuthenticateRequest,
} from "./generated-types"

// Type-safe path building
const userPath = paths.getUserById({ userId: "123" })
// → "/users/123"

// Request validation with Zod
const requestData = {
  recaptcha: {
    recaptcha_token: "token123",
    recaptcha_platform: "Web" as const,
  },
  otp_dispatch_method: "SMS" as const,
}

const validation = authenticateUser.request(requestData)
if (validation.success) {
  // Make API call with validated data
  const response = await fetch("/api" + authenticateUser.path(), {
    method: "POST",
    body: JSON.stringify(validation.data),
  })
}
```

### Building a Generic Client

Below is an example of a generic client that can be used to run operations.
See [examples package](../examples/README.md) for a more complete examples with tests, using undici, fetch, ts-effect.

```typescript
import type { OperationDefinition } from "zenko"

async function runOperation<
  T extends OperationDefinition<PathFn<any[]>, any, any>,
>(
  operation: T,
  config: { baseUrl: string; init?: RequestInit }
): Promise<
  T["response"] extends undefined
    ? void
    : T["response"] extends (...args: any[]) => infer U
      ? U
      : T["response"]
> {
  const url = `${config.baseUrl}${operation.path()}`
  const res = await fetch(url, config.init)
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return (await res.json()) as any
}
```

## Key Improvements

### Dependency Resolution

Zenko automatically resolves schema dependencies using topological sorting, ensuring that referenced types are defined before they're used. This eliminates "used before declaration" errors. Alongside excessive duplicate schema generation, as found in other generators.

### Zod Integration

Runtime validation with Zod schemas provides:

- Type safety at compile time
- Runtime validation for API requests/responses
- Automatic type inference with `z.infer<>`
- Integration with form libraries and validation flows

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build the package
bun run build

# Test with example spec
zenko src/resources/petstore.yaml output.ts

# Format code
bun run format
```
