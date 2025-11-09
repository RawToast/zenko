import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { generate, type OpenAPISpec } from "../zenko"

describe("Petstore", () => {
  const tempDir = path.join(process.cwd(), "temp-test")
  const outputFile = path.join(tempDir, "output.ts")

  beforeAll(() => {
    // Create temp directory for test output
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
  })

  afterAll(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  test("generates complete TypeScript output", () => {
    const petstoreContent = fs.readFileSync(
      "../zenko-core/src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(petstoreContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("petstore-complete-output")
  })

  test("includes Zod import", () => {
    const petstoreContent = fs.readFileSync(
      "../zenko-core/src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(petstoreContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain('import { z } from "zod"')
  })

  test("generates schemas in correct dependency order", () => {
    const petstoreContent = fs.readFileSync(
      "../zenko-core/src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(petstoreContent) as OpenAPISpec
    const result = generate(specYaml)

    // Pet should come before Pets since Pets references Pet
    const petIndex = result.indexOf("export const Pet =")
    const petsIndex = result.indexOf("export const Pets =")
    expect(petIndex).toBeGreaterThan(-1)
    expect(petsIndex).toBeGreaterThan(-1)
    expect(petIndex).toBeLessThan(petsIndex)
  })

  test("generates all expected schemas", () => {
    const petstoreContent = fs.readFileSync(
      "../zenko-core/src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(petstoreContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain("export const Pet =")
    expect(result).toContain("export const Pets =")
    expect(result).toContain("export const Error =")
    expect(result).toContain("export type Pet =")
    expect(result).toContain("export type Pets =")
    expect(result).toContain("export type Error =")
  })

  test("generates path functions", () => {
    const petstoreContent = fs.readFileSync(
      "../zenko-core/src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(petstoreContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain("export const paths = {")
    expect(result).toContain("listPets:")
    expect(result).toContain("createPets:")
    expect(result).toContain("showPetById:")
  })

  test("generates operation objects", () => {
    const petstoreContent = fs.readFileSync(
      "../zenko-core/src/resources/petstore.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(petstoreContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain("export const listPets: ListPetsOperation =")
    expect(result).toContain("export const createPets: CreatePetsOperation =")
    expect(result).toContain("export const showPetById: ShowPetByIdOperation =")
    expect(result).toContain('method: "get"')
    expect(result).toContain('method: "post"')
  })

  test("supports strict options", () => {
    const strictSpec: OpenAPISpec = {
      openapi: "3.0.0",
      info: { title: "Strict", version: "1.0.0" },
      paths: {},
      components: {
        schemas: {
          StrictExample: {
            type: "object",
            required: ["timestamp", "count"],
            properties: {
              timestamp: { type: "string", format: "date-time" },
              count: { type: "number", minimum: 0, maximum: 10 },
            },
          },
        },
      },
    }

    const result = generate(strictSpec, {
      strictDates: true,
      strictNumeric: true,
    })

    expect(result).toContain("z.string().datetime()")
    expect(result).toContain(".min(0)")
    expect(result).toContain(".max(10)")
  })

  test("generates expected TypeScript from petstore.yaml", () => {
    const petstorePath = path.join(
      process.cwd(),
      "../zenko-core/src/resources/petstore.yaml"
    )

    // Run the CLI
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    execSync(`bun run ${cliPath} ${petstorePath} ${outputFile}`, {
      encoding: "utf8",
    })

    // Read the generated output
    const output = fs.readFileSync(outputFile, "utf8")

    // Verify the output matches our snapshot
    expect(output).toMatchSnapshot("cli-petstore-output")
  })
})
