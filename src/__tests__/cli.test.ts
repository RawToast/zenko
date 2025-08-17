import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

describe("CLI", () => {
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

  test("generates TypeScript from petstore.yaml", () => {
    const petstorePath = path.join(process.cwd(), "src/resources/petstore.yaml")

    // Run the CLI
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    execSync(`bun run ${cliPath} ${petstorePath} ${outputFile}`, {
      encoding: "utf8",
    })

    // Read the generated output
    const output = fs.readFileSync(outputFile, "utf8")

    // Verify the output matches our snapshot
    expect(output).toMatchSnapshot("cli-petstore-output")

    // Basic checks that key elements are present
    expect(output).toContain('import { z } from "zod"')
    expect(output).toContain("export const Pet =")
    expect(output).toContain("export const Pets =")
    expect(output).toContain("export const Error =")
    expect(output).toContain("export const paths =")
    expect(output).toContain("listPets:")
    expect(output).toContain("createPets:")
    expect(output).toContain("showPetById:")
  })

  test("shows help with --help flag", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const output = execSync(`bun run ${cliPath} --help`, {
      encoding: "utf8",
    })

    expect(output).toContain("Usage: zenko <input-file> <output-file>")
    expect(output).toContain("OpenAPI specification file")
    expect(output).toContain("Output TypeScript file")
    expect(output).toContain("Options:")
    expect(output).toContain("-h, --help")
  })

  test("shows help with -h flag", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const output = execSync(`bun run ${cliPath} -h`, {
      encoding: "utf8",
    })

    expect(output).toContain("Usage: zenko <input-file> <output-file>")
  })

  test("exits with error when no arguments provided", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")

    expect(() => {
      execSync(`bun run ${cliPath}`, {
        encoding: "utf8",
      })
    }).toThrow()
  })

  test("exits with error when only one argument provided", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")

    expect(() => {
      execSync(`bun run ${cliPath} input.yaml`, {
        encoding: "utf8",
      })
    }).toThrow()
  })

  test("handles JSON input files", () => {
    // Create a simple JSON OpenAPI spec
    const jsonSpec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/test": {
          get: {
            operationId: "getTest",
            responses: {
              "200": {
                description: "OK",
              },
            },
          },
        },
      },
    }

    const jsonFile = path.join(tempDir, "test.json")
    const jsonOutput = path.join(tempDir, "json-output.ts")
    fs.writeFileSync(jsonFile, JSON.stringify(jsonSpec, null, 2))

    const cliPath = path.join(process.cwd(), "src/cli.ts")
    execSync(`bun run ${cliPath} ${jsonFile} ${jsonOutput}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(jsonOutput, "utf8")
    expect(output).toContain("getTest:")
    expect(output).toContain('import { z } from "zod"')
  })
})
