import * as fs from "fs"
import { beforeAll, describe, expect, test } from "bun:test"
import { oneOfDiscriminatorYamlPath } from "@zenko/specs"
import { generate, type OpenAPISpec } from "../zenko"

/**
 * Loads and parses a YAML fixture file.
 */
function loadSpec(specPath: string): OpenAPISpec {
  const content = fs.readFileSync(specPath, "utf8")
  return Bun.YAML.parse(content) as OpenAPISpec
}

describe("oneOf with Discriminator", () => {
  let specYaml: OpenAPISpec
  let result: string

  beforeAll(() => {
    specYaml = loadSpec(oneOfDiscriminatorYamlPath)
    result = generate(specYaml)
  })

  test("generates complete TypeScript output", () => {
    expect(result).toMatchSnapshot("oneof-discriminator-complete-output")
  })

  test("generates discriminated union for Payment with z.discriminatedUnion", () => {
    // Should generate a discriminated union using Zod's discriminatedUnion
    expect(result).toContain("z.discriminatedUnion(")
    expect(result).toContain('"paymentType"')
  })

  test("generates all payment variant schemas", () => {
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
    // Should generate all vehicle types
    expect(result).toContain("export const Car =")
    expect(result).toContain("export const Motorcycle =")
    expect(result).toContain("export const Truck =")
    expect(result).toContain("export const Vehicle =")

    // Should handle const keyword for discriminator
    expect(result).toContain('"vehicleType"')
  })

  test("generates operation objects with discriminated union types", () => {
    // Operations should use the discriminated union types
    expect(result).toContain("export const createPayment:")
    expect(result).toContain("export const getVehicle:")
    expect(result).toContain("CreatePaymentOperation")
    expect(result).toContain("GetVehicleOperation")
  })

  test("handles discriminator mapping correctly", () => {
    // This test exercises discriminator mapping where:
    // - Multiple mapping values (foo_kind, foo_alias) point to the same schema (Foo)
    // - A mapping entry (extra_kind -> Extra) references a schema not in oneOf
    //
    // This is technically invalid per OpenAPI 3.0 spec (mapping targets should be
    // in oneOf), but we handle it gracefully by including Extra in the union.
    const mappingSpec = {
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
                // Note: Extra is NOT in oneOf - tests graceful handling of edge case
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
    const mappingResult = generate(mappingSpec)

    // Use snapshot to capture full output structure - resilient to implementation changes
    expect(mappingResult).toMatchSnapshot("discriminator-mapping-output")
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
    const fallbackResult = generate(specYaml)

    expect(fallbackResult).toContain("z.union([")
    expect(fallbackResult).not.toContain("z.discriminatedUnion(")
  })

  test("maintains schema dependency order with oneOf", () => {
    // Variant schemas should come before the union schema
    const creditCardIndex = result.indexOf("export const CreditCardPayment =")
    const bankTransferIndex = result.indexOf(
      "export const BankTransferPayment ="
    )
    const cryptoIndex = result.indexOf("export const CryptoPayment =")
    const paymentIndex = result.indexOf("export const Payment =")

    // First verify all schemas are found
    expect(creditCardIndex).toBeGreaterThanOrEqual(0)
    expect(bankTransferIndex).toBeGreaterThanOrEqual(0)
    expect(cryptoIndex).toBeGreaterThanOrEqual(0)
    expect(paymentIndex).toBeGreaterThanOrEqual(0)

    // Then verify ordering
    expect(creditCardIndex).toBeLessThan(paymentIndex)
    expect(bankTransferIndex).toBeLessThan(paymentIndex)
    expect(cryptoIndex).toBeLessThan(paymentIndex)
  })
})
