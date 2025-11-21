import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import jsYaml from "js-yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe.skip("oneOf with Discriminator", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("oneof-discriminator-complete-output")
  })

  test("generates discriminated union for Payment with z.discriminatedUnion", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should generate a discriminated union using Zod's discriminatedUnion
    expect(result).toContain("z.discriminatedUnion(")
    expect(result).toContain('"paymentType"')

    // Or alternatively, should generate a regular union
    // expect(result).toContain("z.union([")
  })

  test("generates all payment variant schemas", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // All payment types should be generated
    expect(result).toContain("export const CreditCardPayment =")
    expect(result).toContain("export const BankTransferPayment =")
    expect(result).toContain("export const CryptoPayment =")
    expect(result).toContain("export const Payment =")

    // Types should be generated
    expect(result).toContain("export type CreditCardPayment =")
    expect(result).toContain("export type BankTransferPayment =")
    expect(result).toContain("export type CryptoPayment =")
    expect(result).toContain("export type Payment =")
  })

  test("generates discriminator property with literal types", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should use z.literal() or z.enum() for discriminator values
    expect(result).toContain('z.literal("credit_card")')
    expect(result).toContain('z.literal("bank_transfer")')
    expect(result).toContain('z.literal("crypto")')

    // Or for Vehicle with const
    expect(result).toContain('z.literal("car")')
    expect(result).toContain('z.literal("motorcycle")')
    expect(result).toContain('z.literal("truck")')
  })

  test("generates Vehicle discriminated union with const discriminators", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Should generate all vehicle types
    expect(result).toContain("export const Car =")
    expect(result).toContain("export const Motorcycle =")
    expect(result).toContain("export const Truck =")
    expect(result).toContain("export const Vehicle =")

    // Should handle const keyword for discriminator
    expect(result).toContain('"vehicleType"')
  })

  test("generates operation objects with discriminated union types", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Operations should use the discriminated union types
    expect(result).toContain("export const createPayment:")
    expect(result).toContain("export const getVehicle:")
    expect(result).toContain("CreatePaymentOperation")
    expect(result).toContain("GetVehicleOperation")
  })

  test("handles discriminator mapping correctly", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // The discriminator mapping should map string values to schemas
    // For example: credit_card -> CreditCardPayment
    // This is critical for proper type narrowing in TypeScript

    // Payment union should properly reference all variants
    const paymentIndex = result.indexOf("export const Payment =")
    expect(paymentIndex).toBeGreaterThan(-1)
  })

  test("maintains schema dependency order with oneOf", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Variant schemas should come before the union schema
    const creditCardIndex = result.indexOf("export const CreditCardPayment =")
    const bankTransferIndex = result.indexOf("export const BankTransferPayment =")
    const cryptoIndex = result.indexOf("export const CryptoPayment =")
    const paymentIndex = result.indexOf("export const Payment =")

    expect(creditCardIndex).toBeLessThan(paymentIndex)
    expect(bankTransferIndex).toBeLessThan(paymentIndex)
    expect(cryptoIndex).toBeLessThan(paymentIndex)
  })
})
