import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { generate, type OpenAPISpec } from "../zenko"

describe("oneOf with Discriminator", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("oneof-discriminator-complete-output")
  })

  test("generates discriminated union for Payment with z.discriminatedUnion", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
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
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
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
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
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
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
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
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Operations should use the discriminated union types
    expect(result).toContain("export const createPayment:")
    expect(result).toContain("export const getVehicle:")
    expect(result).toContain("CreatePaymentOperation")
    expect(result).toContain("GetVehicleOperation")
  })

  test("handles discriminator mapping correctly", () => {
    const specYaml = {
      openapi: "3.0.0",
      info: {
        title: "Discriminator Mapping Test",
        version: "1.0.0",
      },
      paths: {},
      components: {
        schemas: {
          Payment: {
            oneOf: [
              { $ref: "#/components/schemas/Foo" },
              { $ref: "#/components/schemas/Bar" },
            ],
            discriminator: {
              propertyName: "paymentType",
              mapping: {
                foo_kind: "#/components/schemas/Foo",
                foo_alias: "#/components/schemas/Foo",
                bar_kind: "#/components/schemas/Bar",
                extra_kind: "#/components/schemas/Extra",
              },
            },
          },
          Foo: {
            type: "object",
            properties: {
              paymentType: {
                type: "string",
                enum: ["foo"],
              },
              fooValue: {
                type: "string",
              },
            },
            required: ["paymentType", "fooValue"],
          },
          Bar: {
            type: "object",
            properties: {
              paymentType: {
                type: "string",
                enum: ["bar"],
              },
              barValue: {
                type: "string",
              },
            },
            required: ["paymentType", "barValue"],
          },
          Extra: {
            type: "object",
            properties: {
              paymentType: {
                type: "string",
                enum: ["extra"],
              },
              extraValue: {
                type: "string",
              },
            },
            required: ["paymentType", "extraValue"],
          },
        },
      },
    } as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain('z.literal("foo_kind")')
    expect(result).toContain('z.literal("foo_alias")')
    expect(result).toContain('z.literal("extra_kind")')
    expect((result.match(/Foo\.merge/g) ?? []).length).toBe(3)
    expect(result).toContain("Extra.merge")
  })

  test("falls back to union when discriminator values are missing", () => {
    const specYaml = {
      openapi: "3.0.0",
      info: {
        title: "Discriminator Fallback Test",
        version: "1.0.0",
      },
      paths: {},
      components: {
        schemas: {
          Payment: {
            oneOf: [
              { $ref: "#/components/schemas/Known" },
              { $ref: "#/components/schemas/Unknown" },
            ],
            discriminator: {
              propertyName: "paymentType",
            },
          },
          Known: {
            type: "object",
            properties: {
              paymentType: {
                type: "string",
                enum: ["known"],
              },
            },
          },
          Unknown: {
            type: "object",
            properties: {
              amount: {
                type: "number",
              },
            },
          },
        },
      },
    } as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toContain("z.union([")
    expect(result).not.toContain("z.discriminatedUnion(")
  })

  test("maintains schema dependency order with oneOf", () => {
    const specContent = fs.readFileSync(
      "src/resources/oneof-discriminator.yaml",
      "utf8"
    )
    const specYaml = Bun.YAML.parse(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Variant schemas should come before the union schema
    const creditCardIndex = result.indexOf("export const CreditCardPayment =")
    const bankTransferIndex = result.indexOf(
      "export const BankTransferPayment ="
    )
    const cryptoIndex = result.indexOf("export const CryptoPayment =")
    const paymentIndex = result.indexOf("export const Payment =")

    expect(creditCardIndex).toBeLessThan(paymentIndex)
    expect(bankTransferIndex).toBeLessThan(paymentIndex)
    expect(cryptoIndex).toBeLessThan(paymentIndex)
  })
})
