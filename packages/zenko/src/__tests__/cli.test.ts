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

    expect(output).toContain("Usage:")
    expect(output).toContain("zenko <input-file> <output-file>")
    expect(output).toContain("Options:")
    expect(output).toContain("--strict-dates")
    expect(output).toContain("--strict-numeric")
  })

  test("shows help with -h flag", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const output = execSync(`bun run ${cliPath} -h`, {
      encoding: "utf8",
    })

    expect(output).toContain("Usage:")
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

  test("supports config file generation", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const petstorePath = path.join(process.cwd(), "src/resources/petstore.yaml")

    const configDir = path.join(tempDir, "config")
    const configOutput = path.join(configDir, "config-output.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, petstorePath),
          output: "config-output.ts",
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain('import { z } from "zod"')
    expect(output).toContain("export const paths =")
  })

  test("supports strict flags on single run", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const strictSpec = {
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
              count: { type: "number", minimum: 0, maximum: 5 },
            },
          },
        },
      },
    }

    const specPath = path.join(tempDir, "strict-spec.yaml")
    fs.writeFileSync(specPath, Bun.YAML.stringify(strictSpec))

    execSync(
      `bun run ${cliPath} ${specPath} ${outputFile} --strict-dates --strict-numeric`,
      {
        encoding: "utf8",
      }
    )

    const output = fs.readFileSync(outputFile, "utf8")
    expect(output).toContain("z.string().datetime()")
    expect(output).toContain(".min(0)")
    expect(output).toContain(".max(5)")
    expect(output).toContain("export const paths =")
  })

  test("supports operationIds in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const petstorePath = path.join(process.cwd(), "src/resources/petstore.yaml")

    const configDir = path.join(tempDir, "selective-config")
    const configOutput = path.join(configDir, "selective-output.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, petstorePath),
          output: "selective-output.ts",
          operationIds: ["listPets", "showPetById"],
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain('import { z } from "zod"')
    expect(output).toContain("export const paths =")
    expect(output).toContain("listPets:")
    expect(output).toContain("showPetById:")
    expect(output).not.toContain("createPets:")
    expect(output).toContain("export const Pet =")
    expect(output).toContain("export const Pets =")
    expect(output).toContain("export const Error =")
  })
})
