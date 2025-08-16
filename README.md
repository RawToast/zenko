# Zenko

A TypeScript generator for OpenAPI specifications that creates **Zod schemas**, **type-safe path functions**, and **operation objects**.

Unlike most OpenAPI generators, Zenko does not create a client. Instead you are free to use your own fetch wrapper or library of choice.

## Features

- 🔧 **Zod Schema Generation** - Generates runtime-validated Zod schemas from OpenAPI schemas
- 🛣️ **Type-safe Path Functions** - Creates functions to build API paths with proper TypeScript types
- 📋 **Operation Objects** - Generates objects containing path functions, request validation, and response types
- 🔄 **Dependency Resolution** - Automatically resolves schema dependencies with topological sorting
- ⚡ **CLI & Programmatic API** - Use via command line or import as a library

## Installation

### One-time Usage

```bash
# Use directly with npx (no installation required)
npx zenko input.yaml output.ts

# Or with bunx
bunx zenko input.yaml output.ts
```

### Install for Repeated Use

```bash
# Install globally
npm install -g zenko
bun install -g zenko

# Or install locally
npm install zenko
bun add zenko
yarn add zenko
pnpm add zenko
```

## Usage

### Command Line

```bash
# Generate TypeScript types from OpenAPI spec
zenko input.yaml output.ts
zenko petstore.json api-types.ts

# Show help
zenko --help
zenko -h

# One-time usage (no installation)
npx zenko input.yaml output.ts
bunx zenko input.yaml output.ts
```

### Programmatic Usage

```typescript
import { OpenAPIGenerator, type OpenAPISpec } from "zenko"
import * as fs from "fs"
import { load } from "js-yaml"

// Load your OpenAPI spec
const spec = load(fs.readFileSync("api.yaml", "utf8")) as OpenAPISpec

// Generate TypeScript code
const generator = new OpenAPIGenerator(spec)
const output = generator.generate()

// Write to file
fs.writeFileSync("types.ts", output)
```

#### ES Modules

```typescript
import { OpenAPIGenerator } from "zenko"
```

#### CommonJS

```javascript
const { OpenAPIGenerator } = require("zenko")
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

### 3. Operation Objects

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
```

## Example Usage in Your App

```typescript
import { paths, authenticateUser, AuthenticateRequest } from "./generated-types"

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

## Key Improvements

### Dependency Resolution

Zenko automatically resolves schema dependencies using topological sorting, ensuring that referenced types are defined before they're used. This eliminates "used before declaration" errors.

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

## Architecture

- **`src/generator.ts`** - Main OpenAPI → TypeScript generator
- **`src/cli.ts`** - Command-line interface
- **`dist/`** - Bundled outputs (CJS + ESM)
- **Topological Sort** - Ensures proper dependency ordering for schema generation
