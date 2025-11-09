import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import * as fs from "fs"
import * as path from "path"
import { loadConfig, loadSpec, normalizeGenerationOptions } from "../loader"

const fixturesRoot = path.join(
  process.cwd(),
  "..",
  "zenko-core",
  "src",
  "resources"
)

describe("Bun loader", () => {
  const tempDir = path.join(process.cwd(), "loader-test-temp")

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  test("loadSpec parses YAML OpenAPI documents", async () => {
    const specPath = path.join(fixturesRoot, "petstore.yaml")
    const spec = await loadSpec(specPath)

    expect(spec.openapi).toBeDefined()
    expect(spec.paths).toBeDefined()
    expect(Object.keys(spec.paths ?? {})).toContain("/pets")
  })

  test("loadSpec parses JSON OpenAPI documents", async () => {
    const specPath = path.join(tempDir, "spec.json")
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/example": {
          get: {
            operationId: "getExample",
            responses: {
              "200": { description: "OK" },
            },
          },
        },
      },
    }
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2))

    const loaded = await loadSpec(specPath)
    expect(loaded.paths?.["/example"]).toBeDefined()
  })

  test("loadConfig parses YAML configuration files", async () => {
    const configPath = path.join(tempDir, "zenko.config.yaml")
    const configContent = [
      "types:",
      '  helpers: "inline"',
      "schemas:",
      "  - input: ./input.yaml",
      "    output: ./output.ts",
      "    strictDates: true",
    ].join("\n")
    fs.writeFileSync(configPath, configContent)

    const config = (await loadConfig(configPath)) as {
      schemas: Array<{ input: string; output: string; strictDates?: boolean }>
      types?: unknown
    }

    expect(Array.isArray(config.schemas)).toBe(true)
    expect(config.schemas[0]?.input).toBe("./input.yaml")
    expect(config.schemas[0]?.strictDates).toBe(true)
  })

  test("normalizeGenerationOptions resolves relative paths", () => {
    const baseDir = path.join(process.cwd(), "configs")
    const entry = {
      input: "./specs/petstore.yaml",
      output: "./dist/petstore.ts",
      strictDates: true,
      strictNumeric: false,
    }

    const resolved = normalizeGenerationOptions(entry, baseDir, {
      strictDates: false,
      strictNumeric: false,
      operationIds: undefined,
      types: undefined,
    })

    expect(resolved.resolvedInput).toBe(
      path.join(baseDir, "specs", "petstore.yaml")
    )
    expect(resolved.resolvedOutput).toBe(
      path.join(baseDir, "dist", "petstore.ts")
    )
    expect(resolved.strictDates).toBe(true)
  })
})
