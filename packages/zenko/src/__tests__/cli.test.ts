import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import {
  blockscoutYamlPath,
  dateEnumYamlPath,
  petstoreYamlPath,
  tictactoeYamlPath,
} from "@zenko/specs"
import { generate } from "../zenko"
import { parseYaml } from "../utils/yaml"

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
    const petstorePath = petstoreYamlPath

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
    expect(output).toContain("zenko treaty <generated-ts-file> <output-file>")
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

  test("generates treaty module from a Zenko .gen.ts file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const yaml = fs.readFileSync(tictactoeYamlPath, "utf8")
    const spec = parseYaml(yaml)
    const genPath = path.join(tempDir, "tictactoe.gen.ts")
    fs.writeFileSync(genPath, generate(spec))
    const outputPath = path.join(tempDir, "tictactoe.treaty.gen.ts")

    execSync(`bun run ${cliPath} treaty ${genPath} ${outputPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(outputPath, "utf8")
    expect(output).toContain("export const operations = {")
    expect(output).toContain("export const treatyRoutes = {")
    expect(output).toContain("createTreatyClient")
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
    const petstorePath = petstoreYamlPath

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

  test("supports treatyOutput in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const petstorePath = petstoreYamlPath

    const configDir = path.join(tempDir, "treaty-config")
    const configOutput = path.join(configDir, "api.gen.ts")
    const treatyOutput = path.join(configDir, "api.treaty.gen.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, petstorePath),
          output: "api.gen.ts",
          treatyOutput: "api.treaty.gen.ts",
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    expect(fs.existsSync(configOutput)).toBe(true)
    expect(fs.existsSync(treatyOutput)).toBe(true)
    const treaty = fs.readFileSync(treatyOutput, "utf8")
    expect(treaty).toContain("export const treatyRoutes = {")
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
    expect(output).toContain("z.string().datetime({ offset: true })")
    expect(output).toContain(".min(0)")
    expect(output).toContain(".max(5)")
    expect(output).toContain("export const paths =")
  })

  test("supports operationIds in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const petstorePath = petstoreYamlPath

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

  test("supports operationTypeSuffix in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")

    const configDir = path.join(tempDir, "operation-suffix-config")
    const configOutput = path.join(configDir, "operation-suffix-output.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, petstoreYamlPath),
          output: "operation-suffix-output.ts",
          types: { operationTypeSuffix: "Op" },
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain("export type ListPetsOp = OperationDefinition<")
    expect(output).toContain(": ListPetsOp")
    expect(output).not.toContain("ListPetsOperation")
  })

  test("supports openEnums in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const dateEnumPath = dateEnumYamlPath

    const configDir = path.join(tempDir, "open-enums-config")
    const configOutput = path.join(configDir, "open-enums-output.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, dateEnumPath),
          output: "open-enums-output.ts",
          openEnums: ["Status"],
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain('import { z } from "zod"')
    // Status should be open enum
    expect(output).toContain("const StatusKnown =")
    expect(output).toContain("z.enum(StatusKnown).or(")
    // Version should remain closed
    expect(output).toContain("export const Version = z.enum([")
    expect(output).not.toContain("const VersionKnown =")
  })

  test("supports openEnums: true in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const dateEnumPath = dateEnumYamlPath

    const configDir = path.join(tempDir, "open-enums-all-config")
    const configOutput = path.join(configDir, "open-enums-all-output.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, dateEnumPath),
          output: "open-enums-all-output.ts",
          openEnums: true,
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain('import { z } from "zod"')
    // Both Status and Version should be open
    expect(output).toContain("const StatusKnown =")
    expect(output).toContain("const VersionKnown =")
    expect(output).toContain("z.enum(StatusKnown).or(")
    expect(output).toContain("z.enum(VersionKnown).or(")
  })

  test("supports openEnums object config form with custom prefix", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const dateEnumPath = dateEnumYamlPath

    const configDir = path.join(tempDir, "open-enums-object-config")
    const configOutput = path.join(configDir, "open-enums-object-output.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, dateEnumPath),
          output: "open-enums-object-output.ts",
          openEnums: { open: true, unknownPrefix: "unrecognized_" },
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain('import { z } from "zod"')
    // Should use custom prefix
    expect(output).toContain(
      "z.string().transform((v): `unrecognized_${string}` => `unrecognized_${v}`)"
    )
    // Both Status and Version should be open
    expect(output).toContain("const StatusKnown =")
    expect(output).toContain("const VersionKnown =")
  })

  test("help text includes dateTimeOffset", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const output = execSync(`bun run ${cliPath} --help`, {
      encoding: "utf8",
    })

    expect(output).toContain("dateTimeOffset")
  })

  test("supports dateTimeOffset: false in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")

    const configDir = path.join(tempDir, "datetime-offset-config")
    const configOutput = path.join(configDir, "datetime-offset-output.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const specPath = path.join(configDir, "spec.yaml")
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {},
      components: {
        schemas: {
          Event: {
            type: "object",
            required: ["happenedAt"],
            properties: {
              happenedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    }
    fs.writeFileSync(specPath, Bun.YAML.stringify(spec))

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: "spec.yaml",
          output: "datetime-offset-output.ts",
          strictDates: true,
          dateTimeOffset: false,
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain("z.string().datetime()")
    expect(output).not.toContain("datetime({ offset: true })")
  })

  test("supports openEnums object config form with selective enums", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const dateEnumPath = dateEnumYamlPath

    const configDir = path.join(tempDir, "open-enums-selective-config")
    const configOutput = path.join(configDir, "open-enums-selective-output.ts")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, dateEnumPath),
          output: "open-enums-selective-output.ts",
          openEnums: { open: ["Status"], unknownPrefix: "x-" },
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain('import { z } from "zod"')
    // Status should be open with custom prefix
    expect(output).toContain("const StatusKnown =")
    expect(output).toContain(
      "z.string().transform((v): `x-${string}` => `x-${v}`)"
    )
    // Version should remain closed
    expect(output).toContain("export const Version = z.enum([")
    expect(output).not.toContain("const VersionKnown =")
  })

  test("help text includes schemaVersion", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const output = execSync(`bun run ${cliPath} --help`, {
      encoding: "utf8",
    })

    expect(output).toContain("schemaVersion")
    expect(output).toContain("--schema-version")
  })

  test("supports schemaVersion auto in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const configDir = path.join(tempDir, "schema-version-auto-config")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const configOutput = path.join(configDir, "blockscout.gen.ts")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, blockscoutYamlPath),
          output: "blockscout.gen.ts",
          schemaVersion: "auto",
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).toContain("// Generated Zod Schemas")
    expect(output).toContain("export const v1Counters")
  })

  test("supports schemaVersion oas3 in config file", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const configDir = path.join(tempDir, "schema-version-oas3-config")
    fs.mkdirSync(configDir, { recursive: true })

    const configPath = path.join(configDir, "zenko.config.json")
    const configOutput = path.join(configDir, "blockscout.gen.ts")
    const config = {
      schemas: [
        {
          input: path.relative(configDir, blockscoutYamlPath),
          output: "blockscout.gen.ts",
          schemaVersion: "oas3",
        },
      ],
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    execSync(`bun run ${cliPath} --config ${configPath}`, {
      encoding: "utf8",
    })

    const output = fs.readFileSync(configOutput, "utf8")
    expect(output).not.toContain("// Generated Zod Schemas")
    expect(output).toContain("OperationErrors<{ defaultError: undefined }>")
  })

  test("supports --schema-version on single-file CLI path", () => {
    const cliPath = path.join(process.cwd(), "src/cli.ts")
    const outputPath = path.join(tempDir, "blockscout-oas3-cli.ts")

    execSync(
      `bun run ${cliPath} ${blockscoutYamlPath} ${outputPath} --schema-version oas3`,
      { encoding: "utf8" }
    )

    const output = fs.readFileSync(outputPath, "utf8")
    expect(output).not.toContain("// Generated Zod Schemas")
    expect(output).toContain("OperationErrors<{ defaultError: undefined }>")
  })
})
