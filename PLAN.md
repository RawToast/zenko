# Bun-first Zenko with Node Variant

## Plan (agreed)

- Make `zenko` Bun-first using Bun’s YAML (`Bun.YAML.parse`, YAML module import) and move all logic into a shared `@zenko/core`.
- Publish `zenko-node` that uses `js-yaml` for Node environments with a matching CLI experience.
- Keep outputs and types identical across variants.

Reference: [Bun YAML](https://bun.com/docs/runtime/yaml)

### Package layout
- `packages/zenko-core` (new)
  - Pure TS, no runtime-specific I/O
  - Exports: `generateFromDocument(spec, options)`, helpers, types
  - Moves current `src/zenko.ts`, `src/utils`, `src/types` logic that doesn’t depend on FS/YAML into core
- `packages/zenko` (Bun-first)
  - Depends on `@zenko/core`
  - YAML loading via `Bun.YAML.parse` and/or YAML ESM import when using the `bun` export condition
  - CLI (`bin: zenko`) with `#!/usr/bin/env bun` shebang; same flags and output as today
  - Remove `js-yaml`
  - Keep existing tests that can run under Bun; point imports to `@zenko/core` where appropriate
- `packages/zenko-node` (Node-compatible)
  - Depends on `@zenko/core`
  - YAML loading via `js-yaml` + `fs/promises`
  - CLI (`bin: zenko-node`) with `#!/usr/bin/env node` shebang; flags and output mirror `zenko`

### Source changes
- Extract core API
  - Create `@zenko/core` with `generateFromDocument(openApiDoc, options)` and associated helpers
  - Ensure all internal utilities from `packages/zenko/src/utils` move to core where possible
- Introduce environment adapters
  - `packages/zenko/src/loader.ts` (Bun): read file (or stdin/URL) and `Bun.YAML.parse` to `OpenAPI.Document`
  - `packages/zenko-node/src/loader.ts` (Node): read with `fs/promises`, parse with `js-yaml`
- CLI parity
  - Keep identical CLI flags/options in both CLIs; call into shared core API
  - Preserve exit codes, error messages, and file layout

### Build & exports
- `@zenko/core`
  - `type: module`; ship `dist/index.{cjs,mjs}.(d.)ts`
- `zenko`
  - `exports` adds `"bun": "./src/zenko.ts"` (already present style), and standard `import/require` to dist
  - CLI built with tsup; banner set to `#!/usr/bin/env bun`
  - No `js-yaml` dependency
- `zenko-node`
  - `exports` standard `import/require` to dist
  - Depends on `js-yaml`
  - CLI banner `#!/usr/bin/env node`

### Tests
- Move logic/unit tests that don’t need I/O into `@zenko/core`
- Keep CLI/integration tests in `zenko` (run with Bun)
- Add minimal “equivalence” tests in `zenko-node` that run the same inputs and diff outputs against snapshots from core/zenko
- It’s acceptable to run all tests with Bun runner; `js-yaml` works under Bun

### CI & scripts
- Update matrix to build and test:
  - `@zenko/core`: build + test
  - `zenko`: build + test
  - `zenko-node`: build + test
- Remove `js-yaml` from `zenko`; keep in `zenko-node`
- Ensure `turbo codegen` and `turbo build` still work; swap internal imports to `@zenko/core`

### Migration & docs
- README updates:
  - `zenko`: Bun-first runtime requirement; how to run CLI with Bun and YAML import
  - `zenko-node`: Node-compatible alternative with identical flags
  - Programmatic usage examples for both

### Compatibility considerations
- Ensure `packages/examples` continue to generate correctly via Bun (`bun zenko build`) and Node (`npx zenko-node ...`)
- Validate that outputs are byte-for-byte equal between `zenko` and `zenko-node` for known specs (petstore, train-travel)

## Deviations & Notes

- Removed the legacy generator implementation from `packages/zenko/src/zenko.ts` (now a re-export shim) since all logic migrated to `@zenko/core`.
- Extended example generation scripts to rely on the new packages and verified both Bun and Node flows; added Node invocation instructions to docs.
- CI now runs `turbo run test` for all packages followed by `turbo run coverage --filter=zenko` (rather than a single coverage command).
- Minor formatting lint adjustments applied by the user post-plan (e.g., trailing commas removal).

