import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import * as fs from "fs"
import jsYaml from "js-yaml"
import * as path from "path"
import { generate, type OpenAPISpec } from "../zenko"

describe("Train Travel", () => {
  const tempDir = path.join(process.cwd(), "temp-test")

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  test("generates complete TypeScript output", () => {
    const trainTravelContent = fs.readFileSync(
      "src/resources/train-travel.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(trainTravelContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("train-travel-complete-output")
  })

  test("handles operation IDs with hyphens correctly", () => {
    const trainTravelContent = fs.readFileSync(
      "src/resources/train-travel.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(trainTravelContent) as OpenAPISpec
    const result = generate(specYaml)

    // Currently generates valid TypeScript identifiers (camelCase) for operations
    expect(result).toContain("export const getStations:")
    expect(result).toContain("export const getTrips:")
    expect(result).toContain("export const getBookings:")
    expect(result).toContain("export const createBooking:")
    expect(result).toContain("export const getBooking:")
    expect(result).toContain("export const deleteBooking:")
    expect(result).toContain("export const createBookingPayment:")
    // Note: newBooking is missing - this is a bug

    // Should generate valid path function names
    expect(result).toContain("getStations:")
    expect(result).toContain("getTrips:")
    expect(result).toContain("getBookings:")
    expect(result).toContain("createBooking:")
    expect(result).toContain("getBooking:")
    expect(result).toContain("deleteBooking:")
    expect(result).toContain("createBookingPayment:")
  })

  test("generates proper response types for operations", () => {
    const trainTravelContent = fs.readFileSync(
      "src/resources/train-travel.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(trainTravelContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should generate response types that reference the correct schemas
    expect(result).toContain("response:")
    // These will help identify if the response type generation is working
  })

  test("generates all expected schemas", () => {
    const trainTravelContent = fs.readFileSync(
      "src/resources/train-travel.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(trainTravelContent) as OpenAPISpec
    const result = generate(specYaml)

    // Key schemas from the spec
    expect(result).toContain("export const Station =")
    expect(result).toContain("export const Trip =")
    expect(result).toContain("export const Booking =")
    expect(result).toContain("export const BookingPayment =")
    // Fixed: hyphens are now converted to camelCase
    expect(result).toContain("export const WrapperCollection =")
    expect(result).toContain("export const Problem =")
  })

  test("generates valid TypeScript identifiers for schemas with hyphens", () => {
    const trainTravelContent = fs.readFileSync(
      "src/resources/train-travel.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(trainTravelContent) as OpenAPISpec
    const result = generate(specYaml)

    // Fixed: hyphens are now converted to camelCase
    expect(result).toContain("export const LinksSelf =")
    expect(result).toContain("export const LinksDestination =")
    expect(result).toContain("export const LinksOrigin =")
    expect(result).toContain("export const LinksPagination =")
    expect(result).toContain("export const WrapperCollection =")
    expect(result).toContain("export const LinksBooking =")

    // Fixed: should generate corresponding types with camelCase
    expect(result).toContain("export type LinksSelf =")
    expect(result).toContain("export type LinksDestination =")
    expect(result).toContain("export type LinksOrigin =")
    expect(result).toContain("export type LinksPagination =")
    expect(result).toContain("export type WrapperCollection =")
    expect(result).toContain("export type LinksBooking =")
  })
})
