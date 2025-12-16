# Zenko

[![CI](https://github.com/RawToast/zenko/actions/workflows/ci.yml/badge.svg)](https://github.com/RawToast/zenko/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/RawToast/zenko/graph/badge.svg?token=8EP854JIBD)](https://codecov.io/gh/RawToast/zenko)

Bun-first TypeScript generator for OpenAPI specifications that creates **Zod schemas**, **type-safe path functions**, and **operation objects**.

Unlike most OpenAPI generators, Zenko does not create a client. Instead you are free to use your own fetch/undici wrapper or library of choice.

## Quick Start

```bash
# One-time usage (no installation required)
bunx zenko input.yaml output.ts
```

```bash
# Or install globally
bun install -g zenko
zenko input.yaml output.ts
```

```bash
# Or as a script in your package.json
bun add -d zenko

# Then in your package.json
"scripts": {
  "generate": "zenko --config resources/zenko.config.json"
}
```

## Features

- 🔧 **Zod Schema Generation** - Runtime-validated schemas from OpenAPI
- 🛣️ **Type-safe Path Functions** - Build API paths with proper TypeScript types
- 📋 **Operation Objects** - Path functions, request validation, and response types
- 🧰 **Operation Type Helpers** - Reusable type definitions for building generic clients
- 🔄 **Dependency Resolution** - Automatic topological sorting eliminates "used before declaration" errors
- ⚡ **CLI & Programmatic API** - Use via command line or import as a library

## Basic Usage

### Command Line

```bash
# Generate from OpenAPI spec
zenko petstore.yaml api-types.ts

# Enable strict validation
zenko api.yaml types.ts --strict-dates --strict-numeric

# Use config file for multiple specs
zenko --config zenko.config.json
```

### Config File

```json
{
  "$schema": "https://raw.githubusercontent.com/RawToast/zenko/refs/heads/master/packages/zenko/zenko-config.schema.json",
  "schemas": [
    {
      "input": "api.yaml",
      "output": "api.gen.ts"
    }
  ]
}
```

### Using Generated Code

```typescript
import { paths, authenticateUser } from "./api.gen"

// Type-safe path building
const path = paths.getUserById({ userId: "123" })
// → "/users/123"

// Request validation with Zod
const validation = authenticateUser.request(requestData)
if (validation.success) {
  const response = await fetch(baseUrl + authenticateUser.path(), {
    method: "POST",
    body: JSON.stringify(validation.data),
  })
}
```

## Documentation

- **[Full Documentation](packages/zenko/README.md)** - Complete API reference, configuration options, and advanced usage
- **[Installation](packages/zenko/README.md#installation)** - Installation and setup guide
- **[Config File](packages/zenko/README.md#config-file)** - Configuration options and examples
- **[Generated Output](packages/zenko/README.md#generated-output)** - Understanding the generated code
- **[Building a Generic Client](packages/zenko/README.md#building-a-generic-client)** - Creating reusable HTTP clients
- **[Examples](packages/examples/README.md)** - Example clients using fetch, undici, and ts-effect

## Requirements

- Bun 1.2.22 or higher

An npm package may be available in the future if there is demand.
