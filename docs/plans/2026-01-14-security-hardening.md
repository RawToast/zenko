# CLI Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make unsafe config execution and path traversal explicit opt-ins and add a YAML spec size guard.

**Architecture:** Extend CLI flags to gate JS config loading and unsafe paths, validate both input and output paths against a base directory by default (config runs: directory containing the config file; positional runs: current working directory), and add a configurable max spec size check before YAML parsing. Tests should use YAML inputs only (JSON support is not part of this plan).

**Tech Stack:** TypeScript, Bun tests, CLI execution via `execSync`.

---

### Task 1: Add CLI tests for new safety flags

**Files:**

- Modify: `packages/zenko/src/__tests__/cli.test.ts`
- Test: `packages/zenko/src/__tests__/cli.test.ts`

**Step 1: Write failing tests for JS config gating**

```ts
const jsConfigPath = path.join(tempDir, "zenko.config.js")
fs.writeFileSync(
  jsConfigPath,
  `export default { schemas: [{ input: "${petstoreYamlPath}", output: "output.ts" }] }`
)

expect(() => {
  execSync(`bun run ${cliPath} --config ${jsConfigPath}`, { encoding: "utf8" })
}).toThrow()

execSync(`bun run ${cliPath} --config ${jsConfigPath} --allow-js-config`, {
  encoding: "utf8",
})
```

**Step 2: Write failing tests for unsafe paths (config + positional)**

```ts
// Add at file top: import * as os from "os"

// Config-based output escape (baseDir = config directory)
const escapeConfigPath = path.join(tempDir, "escape.config.yaml")
const escapeOutput = "../escaped.ts"
const escapeConfig = {
  schemas: [{ input: petstoreYamlPath, output: escapeOutput }],
}
fs.writeFileSync(escapeConfigPath, Bun.YAML.stringify(escapeConfig))

expect(() => {
  execSync(`bun run ${cliPath} --config ${escapeConfigPath}`, { encoding: "utf8" })
}).toThrow()

execSync(
  `bun run ${cliPath} --config ${escapeConfigPath} --allow-unsafe-paths`,
  { encoding: "utf8" }
)

// Positional output escape (baseDir = process.cwd())
expect(() => {
  execSync(`bun run ${cliPath} ${petstoreYamlPath} ../escaped.ts`, {
    encoding: "utf8",
  })
}).toThrow()

// Positional input escape (baseDir = process.cwd())
const externalSpecPath = path.join(os.tmpdir(), "zenko-external.yaml")
fs.writeFileSync(
  externalSpecPath,
  Bun.YAML.stringify({
    openapi: "3.1.0",
    info: { title: "External", version: "1.0.0" },
    paths: {},
  })
)

expect(() => {
  execSync(`bun run ${cliPath} ${externalSpecPath} ${outputFile}`, {
    encoding: "utf8",
  })
}).toThrow()

execSync(
  `bun run ${cliPath} ${externalSpecPath} ${outputFile} --allow-unsafe-paths`,
  { encoding: "utf8" }
)
```

**Step 3: Run test to verify it fails**

Run: `bun zenko test src/__tests__/cli.test.ts`
Expected: FAIL because the flags are not implemented yet.

**Step 4: Commit**

```bash
git add packages/zenko/src/__tests__/cli.test.ts
git commit -m "test: add cli safety flag coverage"
```

---

### Task 2: Add YAML spec size guard tests

**Files:**

- Modify: `packages/zenko/src/__tests__/cli.test.ts`
- Test: `packages/zenko/src/__tests__/cli.test.ts`

**Step 1: Write the failing size-guard test**

```ts
const tinySpecPath = path.join(tempDir, "tiny-spec.yaml")
const tinySpec = {
  openapi: "3.1.0",
  info: { title: "Tiny", version: "1.0.0" },
  paths: {},
}
fs.writeFileSync(tinySpecPath, Bun.YAML.stringify(tinySpec))

expect(() => {
  execSync(`bun run ${cliPath} ${tinySpecPath} ${outputFile}`, {
    encoding: "utf8",
    env: { ...process.env, ZENKO_MAX_SPEC_BYTES: "10" },
  })
}).toThrow()
```

**Step 2: Run test to verify it fails**

Run: `bun zenko test src/__tests__/cli.test.ts`
Expected: FAIL because the size guard does not exist.

**Step 3: Commit**

```bash
git add packages/zenko/src/__tests__/cli.test.ts
git commit -m "test: cover yaml spec size guard"
```

---

### Task 3: Implement CLI safety flags

**Files:**

- Modify: `packages/zenko/src/cli.ts`
- Test: `packages/zenko/src/__tests__/cli.test.ts`

**Step 1: Extend parsed arguments and help output**

```ts
allowJsConfig: boolean
allowUnsafePaths: boolean
```

Add `--allow-js-config` and `--allow-unsafe-paths` to `parseArgs` and `printHelp`.

**Step 2: Gate JS config loading**

```ts
async function loadConfig(filePath: string, allowJsConfig: boolean) {
  const extension = path.extname(filePath).toLowerCase()

  if (extension === ".json") { /* unchanged */ }
  if (extension === ".yaml" || extension === ".yml") { /* unchanged */ }

  if (!allowJsConfig) {
    throw new Error("JS config files require --allow-js-config")
  }

  const fileUrl = pathToFileURL(filePath).href
  const module = await import(fileUrl)
  return module.default ?? module.config ?? module
}
```

**Step 3: Run tests to verify they pass**

Run: `bun zenko test src/__tests__/cli.test.ts`
Expected: FAIL until path safety and size guard are added.

**Step 4: Commit**

```bash
git add packages/zenko/src/cli.ts
git commit -m "feat: add js config opt-in flag"
```

---

### Task 4: Enforce safe input/output paths by default

**Files:**

- Modify: `packages/zenko/src/cli.ts`
- Test: `packages/zenko/src/__tests__/cli.test.ts`

**Step 1: Add a base-dir enforcement helper**

```ts
function resolveSafePath(filePath: string, baseDir: string, allowUnsafe: boolean) {
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(baseDir, filePath)

  if (!allowUnsafe) {
    const relative = path.relative(baseDir, resolved)
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path must stay within ${baseDir}`)
    }
  }

  return resolved
}
```

Use `resolveSafePath` for both config and positional runs:

- Config runs (`--config`): validate `entry.input`, `entry.output`, and `helpersOutput` relative to the config file directory.
- Positional runs (`zenko <input> <output>`): validate both the input spec path and output path relative to `process.cwd()`.

Any path that escapes the base directory (e.g. `..` or an absolute path outside the base) should require `--allow-unsafe-paths`.

**Step 2: Run tests to verify they pass**

Run: `bun zenko test src/__tests__/cli.test.ts`
Expected: FAIL until size guard is added.

**Step 3: Commit**

```bash
git add packages/zenko/src/cli.ts
git commit -m "feat: guard cli input/output paths"
```

---

### Task 5: Add YAML spec size guard

**Files:**

- Modify: `packages/zenko/src/cli.ts`
- Test: `packages/zenko/src/__tests__/cli.test.ts`

**Step 1: Add size limit check in `readSpec`**

```ts
const MAX_SPEC_BYTES = Number(process.env.ZENKO_MAX_SPEC_BYTES ?? 50_000_000)

const stats = fs.statSync(filePath)
if (stats.size > MAX_SPEC_BYTES) {
  throw new Error(`Spec exceeds max size (${MAX_SPEC_BYTES} bytes)`)
}
```

**Step 2: Run tests to verify they pass**

Run: `bun zenko test src/__tests__/cli.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add packages/zenko/src/cli.ts
git commit -m "feat: add yaml spec size guard"
```

---

### Task 6: Update CLI documentation

**Files:**

- Modify: `packages/zenko/README.md`

**Step 1: Document new flags**

Add entries under the CLI options table for:

- `--allow-js-config`
- `--allow-unsafe-paths`
- `ZENKO_MAX_SPEC_BYTES` (environment variable)

**Step 2: Commit**

```bash
git add packages/zenko/README.md
git commit -m "docs: describe cli safety flags"
```
