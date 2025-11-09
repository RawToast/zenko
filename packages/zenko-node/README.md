# zenko-node

`zenko-node` packages the shared `@zenko/core` generator with a Node.js-friendly loader that uses `fs/promises` and `js-yaml`. It offers the same API surface and CLI experience as the Bun-first `zenko` distribution while remaining compatible with plain Node runtimes.

## Installation

```bash
# Run once without installing
npx zenko-node input.yaml output.ts

# Install locally
npm install zenko-node
pnpm add zenko-node
yarn add zenko-node
```

## CLI usage

```bash
zenko-node input.yaml output.ts
zenko-node petstore.json api-types.ts

# Enable strict guards
zenko-node input.yaml output.ts --strict-dates --strict-numeric

# Generate from a config file
zenko-node --config zenko.config.yaml
```

## Programmatic usage

```ts
import { generateFromDocument, type OpenAPISpec } from "zenko-node"
import { readFile, writeFile } from "node:fs/promises"
import { load } from "js-yaml"

const text = await readFile("api.yaml", "utf8")
const spec = load(text) as OpenAPISpec

const { output } = generateFromDocument(spec)
await writeFile("types.ts", output)
```

## Development

```bash
bun install
bun run --filter zenko-node build
```

Run tests with:

```bash
bun run --filter zenko-node test
```
