# AGENTS

This project is a library for generating TypeScript types and path functions from OpenAPI specs with a focus on Zod schemas.
The goal is to create a library that allows users to create their own typesafe clients, using whatever underlying library they wish e.g. fetch, axios, ky.

## Commands

- **Build:** `bun zenko build` or `turbo build`.
- **Lint:** `bun lint` (fixes); use `bun lint:check` when read-only.
- **Format:** `bun format` (fixes); verify via `bun format:check`.
- **Check:** `bun check` will run lint, format, and type check (prefer this over the individual commands).
- **Tests:** `bun zenko test` or `turbo test`.
- **Single test:** `bun zenko test src/__tests__/cli.test.ts`.
- **Snapshots:** `bun zenko test -u` refreshes stored results.
- **Coverage:** `bun zenko coverage`.
- **Type check:** `bun zenko check-types` or `turbo check-types`.

## Code Style

- **Imports:** built-in → third-party → local; always double quotes.
- **Formatting:** 2 spaces, no semicolons, trailing commas (ES5), 80 char width.
- **Types:** export inferred Zod types; keep strict TypeScript (`noUncheckedIndexedAccess`, `noUnusedLocals`).
- **Naming:** camelCase vars/functions, PascalCase classes/types.
- **Errors:** prefer Result-style returns or descriptive throws.

## Repo Notes

- **Runtime:** Bun 1.3+, Node >=18; run scripts from workspace root.
- **Testing:** specs live in `packages/zenko/src/__tests__`; use snapshots for output verification.
- **Artifacts:** `packages/zenko/dist` is generated; never edit manually.
- **CI:** GitHub Actions in `.github/workflows` must stay green.

## Final Checks

To verify any changes, after running tests, you can run the following commands:

`turbo codegen` will generate the code for the examples in `packages/examples`.

If you need more: `turbo build` will build the code and `bun packages/zenko/dist/cli.cjs --config packages/zenko/private/zenko.config.json` will generate the code.

This will generate some examples in `packages/zenko/private` that you can see any type errors directly within. there are no tests for this, it's just useful for type errors.
