import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import * as fs from "fs"
import * as path from "path"
import { generate, type OpenAPISpec } from "../zenko"

describe("TicTacToe", () => {
  const tempDir = path.join(process.cwd(), "temp-test")

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
    const tictactoeContent = fs.readFileSync(
      "src/resources/tictactoe.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(tictactoeContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("tictactoe-complete-output")
  })

  test("generates complete TypeScript output with strict options", () => {
    const tictactoeContent = fs.readFileSync(
      "src/resources/tictactoe.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(tictactoeContent) as OpenAPISpec
    const result = generate(specYaml, {
      strictDates: true,
      strictNumeric: true,
    })

    expect(result).toMatchSnapshot("tictactoe-complete-output")
  })

  test("generates header functions for security schemes", () => {
    const tictactoeContent = fs.readFileSync(
      "src/resources/tictactoe.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(tictactoeContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should generate header functions
    expect(result).toContain("export const headers = {")

    // TicTacToe has no request headers, so functions should parse empty objects
    expect(result).toContain(
      "getBoard: () => headerSchemas.getBoard.parse({}),"
    )
    expect(result).toContain(
      "getSquare: () => headerSchemas.getSquare.parse({}),"
    )
    expect(result).toContain(
      "putSquare: () => headerSchemas.putSquare.parse({}),"
    )
  })

  test("includes headers in operation objects when request headers exist", () => {
    const optionalHeaderContent = fs.readFileSync(
      "src/resources/optional-headers.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(optionalHeaderContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should include headers when request headers exist
    expect(result).toContain("headers: headers.createMatrix,")

    // Should generate proper header function with parameters
    expect(result).toContain(
      "createMatrix: (params: z.input<typeof headerSchemas.createMatrix>) => {"
    )
    expect(result).toContain("return headerSchemas.createMatrix.parse(params)")
  })

  test("generates all expected schemas with proper types", () => {
    const tictactoeContent = fs.readFileSync(
      "src/resources/tictactoe.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(tictactoeContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should generate all schemas
    expect(result).toContain("export const errorMessage =")
    expect(result).toContain("export const coordinate =")
    expect(result).toContain("export const mark =")
    expect(result).toContain("export const board =")
    expect(result).toContain("export const winner =")
    expect(result).toContain("export const status =")

    // Should generate inferred types
    expect(result).toContain("export type errorMessage =")
    expect(result).toContain("export type coordinate =")
    expect(result).toContain("export type mark =")
    expect(result).toContain("export type board =")
    expect(result).toContain("export type winner =")
    expect(result).toContain("export type status =")
  })

  test("generates path functions with parameters", () => {
    const tictactoeContent = fs.readFileSync(
      "src/resources/tictactoe.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(tictactoeContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should generate path functions
    expect(result).toContain("export const paths = {")
    expect(result).toContain('getBoard: () => "/board",')
    expect(result).toContain(
      "getSquare: ({ row, column }: { row: string, column: string }) =>"
    )
    expect(result).toContain(
      "putSquare: ({ row, column }: { row: string, column: string }) =>"
    )
  })

  test("generates operation objects with correct properties", () => {
    const tictactoeContent = fs.readFileSync(
      "src/resources/tictactoe.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(tictactoeContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should generate operation objects with type annotations
    expect(result).toContain("export const getBoard: GetBoardOperation = {")
    expect(result).toContain("export const getSquare: GetSquareOperation = {")
    expect(result).toContain("export const putSquare: PutSquareOperation = {")

    // Should include correct properties
    expect(result).toContain("path: paths.getBoard,")
    expect(result).toContain("path: paths.getSquare,")
    expect(result).toContain("path: paths.putSquare,")

    // Should include response types
    expect(result).toContain("response: status,")
    expect(result).toContain("response: mark,")

    // Should include request type where applicable
    expect(result).toContain("request: mark,")
  })

  test("generates operation objects without type annotations when types disabled", () => {
    const tictactoeContent = fs.readFileSync(
      "src/resources/tictactoe.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(tictactoeContent) as OpenAPISpec
    const result = generate(specYaml, { types: { emit: false } })

    // Should generate operation objects without type annotations
    expect(result).toContain("export const getBoard = {")
    expect(result).toContain("export const getSquare = {")
    expect(result).toContain("export const putSquare = {")

    // Should not include operation types
    expect(result).not.toContain("export type GetBoardOperation =")
    expect(result).not.toContain("export type GetSquareOperation =")
    expect(result).not.toContain("export type PutSquareOperation =")
  })
})
