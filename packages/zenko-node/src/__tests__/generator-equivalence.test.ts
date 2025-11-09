import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import * as fs from "fs"
import * as path from "path"
import { loadConfig, loadSpec, normalizeGenerationOptions } from "../loader"
import { generateFromDocument } from "@zenko/core"

const fixturesRoot = path.join(
  process.cwd(),
  "..",
  "zenko-core",
  "src",
  "resources"
)

describe("zenko-node loader + generator", () => {
  const tempDir = path.join(process.cwd(), "zenko-node-loader-temp")

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  test("generates identical output for YAML fixtures", async () => {
    const specPath = path.join(fixturesRoot, "petstore.yaml")
    const nodeSpec = await loadSpec(specPath)
    const bunSpec = Bun.YAML.parse(fs.readFileSync(specPath, "utf8")) as Record<
      string,
      unknown
    >

    const nodeResult = generateFromDocument(nodeSpec).output
    const bunResult = generateFromDocument(bunSpec as any).output

    expect(nodeResult).toEqual(bunResult)
  })

  test("generates identical output for JSON fixtures", async () => {
    const sourceYaml = path.join(fixturesRoot, "petstore.yaml")
    const specPath = path.join(tempDir, "petstore.json")
    const parsed = Bun.YAML.parse(fs.readFileSync(sourceYaml, "utf8"))
    fs.writeFileSync(specPath, JSON.stringify(parsed, null, 2))

    const nodeSpec = await loadSpec(specPath)
    const bunSpec = JSON.parse(fs.readFileSync(specPath, "utf8"))

    const nodeResult = generateFromDocument(nodeSpec).output
    const bunResult = generateFromDocument(bunSpec).output

    expect(nodeResult).toEqual(bunResult)
  })

  test("loadConfig reads YAML config files", async () => {
    const configDir = path.join(tempDir, "config")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.yaml")
    const configContent = [
      "types:",
      "  helpers: inline",
      "schemas:",
      "  - input: ./petstore.yaml",
      "    output: ./output.ts",
      "    strictNumeric: true",
    ].join("\n")
    fs.writeFileSync(configPath, configContent)

    const config = (await loadConfig(configPath)) as {
      schemas: Array<{ input: string; output: string; strictNumeric?: boolean }>
    }

    expect(config.schemas[0]?.input).toBe("./petstore.yaml")
    expect(config.schemas[0]?.strictNumeric).toBe(true)
  })

  test("normalizeGenerationOptions resolves relative paths", () => {
    const baseDir = path.join(process.cwd(), "configs")
    const entry = {
      input: "./specs/petstore.yaml",
      output: "./dist/petstore.ts",
      strictDates: true,
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
