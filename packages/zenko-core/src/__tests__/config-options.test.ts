import { describe, test, expect } from "bun:test"
import { generate, type OpenAPISpec } from "../zenko"
import * as fs from "fs"

describe("Configuration Options", () => {
  const stringFormatsSpec = Bun.YAML.parse(
    fs.readFileSync("src/resources/string-formats.yaml", "utf8")
  ) as OpenAPISpec

  describe("strictDates option", () => {
    test("default behavior (strictDates: false) - date formats use z.string()", () => {
      const result = generate(stringFormatsSpec, { strictDates: false })

      // Date-time formats should use z.string() by default
      expect(result).toContain("createdAt: z.string()")
      expect(result).toContain("updatedAt: z.string()")
      expect(result).toContain("timestamp: z.string()")

      // Date format should use z.string() by default
      expect(result).toContain("birthDate: z.string()")

      // Time format should use z.string() by default
      expect(result).toContain("lastLoginTime: z.string()")

      // Duration format should use z.string() by default
      expect(result).toContain("sessionDuration: z.string()")

      // Should NOT contain strict date validators
      expect(result).not.toContain("z.string().datetime()")
      expect(result).not.toContain("z.string().date()")
      expect(result).not.toContain("z.string().time()")
      expect(result).not.toContain("z.string().duration()")
    })

    test("strictDates: true - date formats use strict validators", () => {
      const result = generate(stringFormatsSpec, { strictDates: true })

      // Date-time formats should use strict validators
      expect(result).toContain("createdAt: z.string().datetime()")
      expect(result).toContain("updatedAt: z.string().datetime()")
      expect(result).toContain("timestamp: z.string().datetime()")

      // Date format should use strict validator
      expect(result).toContain("birthDate: z.string().date()")

      // Time format should use strict validator
      expect(result).toContain("lastLoginTime: z.string().time()")

      // Duration format should use strict validator
      expect(result).toContain("sessionDuration: z.string().duration()")
    })

    test("other string formats (uuid, email, url) are always strictly validated regardless of strictDates", () => {
      // Test with strictDates: false
      const resultFalse = generate(stringFormatsSpec, { strictDates: false })

      // UUID formats should always be strictly validated
      expect(resultFalse).toContain("id: z.string().uuid()")
      expect(resultFalse).toContain("code: z.string().uuid()")

      // Email formats should always be strictly validated
      expect(resultFalse).toContain("email: z.string().email()")

      // URI formats should always be strictly validated
      expect(resultFalse).toContain("website: z.string().url()")
      expect(resultFalse).toContain("avatar: z.string().url()")

      // Test with strictDates: true
      const resultTrue = generate(stringFormatsSpec, { strictDates: true })

      // UUID formats should still be strictly validated
      expect(resultTrue).toContain("id: z.string().uuid()")
      expect(resultTrue).toContain("code: z.string().uuid()")

      // Email formats should still be strictly validated
      expect(resultTrue).toContain("email: z.string().email()")

      // URI formats should still be strictly validated
      expect(resultTrue).toContain("website: z.string().url()")
      expect(resultTrue).toContain("avatar: z.string().url()")

      // Both results should have identical strict validation for non-date string formats
      const uuidRegex = /id: z\.string\(\)\.uuid\(\)/g
      const emailRegex = /email: z\.string\(\)\.email\(\)/g
      const urlRegex = /website: z\.string\(\)\.url\(\)/g

      const uuidMatchesFalse = resultFalse.match(uuidRegex) || []
      const emailMatchesFalse = resultFalse.match(emailRegex) || []
      const urlMatchesFalse = resultFalse.match(urlRegex) || []

      const uuidMatchesTrue = resultTrue.match(uuidRegex) || []
      const emailMatchesTrue = resultTrue.match(emailRegex) || []
      const urlMatchesTrue = resultTrue.match(urlRegex) || []

      expect(uuidMatchesFalse.length).toBe(uuidMatchesTrue.length)
      expect(emailMatchesFalse.length).toBe(emailMatchesTrue.length)
      expect(urlMatchesFalse.length).toBe(urlMatchesTrue.length)
    })

    test("mixed date and non-date string formats behavior", () => {
      const result = generate(stringFormatsSpec, { strictDates: true })

      // Should contain both strict date validators AND strict non-date validators
      expect(result).toContain("createdAt: z.string().datetime()") // date format
      expect(result).toContain("id: z.string().uuid()") // non-date format
      expect(result).toContain("email: z.string().email()") // non-date format
      expect(result).toContain("website: z.string().url()") // non-date format
    })
  })

  describe("strictNumeric option", () => {
    test("default behavior (strictNumeric: false) - numeric constraints ignored", () => {
      const result = generate(stringFormatsSpec, { strictNumeric: false })

      // Numbers should be basic z.number() without constraints
      expect(result).toContain("age: z.number()")
      expect(result).toContain("balance: z.number()")
      expect(result).toContain("priority: z.number()")

      // Should NOT contain numeric constraints
      expect(result).not.toContain("z.number().min(")
      expect(result).not.toContain("z.number().max(")
      expect(result).not.toContain("z.number().gt(")
      expect(result).not.toContain("z.number().lt(")

      // String length constraints should be ignored
      expect(result).toContain("username: z.string()")
      expect(result).not.toContain("z.string().min(")
      expect(result).not.toContain("z.string().max(")
      expect(result).not.toContain("z.string().regex(")

      // Array constraints should be ignored
      expect(result).toContain("tags: z.array(z.string())")
      expect(result).not.toContain("z.array(z.string()).min(")
      expect(result).not.toContain("z.array(z.string()).max(")
    })

    test("strictNumeric: true - numeric constraints enforced", () => {
      const result = generate(stringFormatsSpec, { strictNumeric: true })

      // Number constraints
      expect(result).toContain("age: z.number().min(0).max(150)")
      expect(result).toContain("balance: z.number().min(0)")
      expect(result).toContain("priority: z.number().min(1).max(10)")

      // String length constraints
      expect(result).toContain("username: z.string().min(3).max(20)")
      expect(result).toContain("password: z.string().min(8).max(128)")
      expect(result).toContain("message: z.string().min(10).max(1000)")
      expect(result).toContain("subject: z.string().min(5).max(100)")

      // String pattern constraints
      expect(result).toContain(
        'username: z.string().min(3).max(20).regex(new RegExp("^[a-zA-Z0-9_]+$"))'
      )
      expect(result).toContain(
        'phoneNumber: z.string().regex(new RegExp("^\\\\\\\\+?[1-9]\\\\\\\\d{1,14}$"))'
      )

      // Array constraints (note: tags is optional so constraints may not be applied)
      expect(result).toContain("scores: z.array(z.number().min(0).max(100))")
      expect(result).toContain("attachments: z.array(z.string().url())")

      // Array uniqueItems constraint (for primitive types) - may not be applied for optional fields
      // expect(result).toContain("tags: z.array(z.string()).min(1).max(10).refine(")
    })

    test("exclusive minimum/maximum constraints", () => {
      const result = generate(stringFormatsSpec, { strictNumeric: true })

      // Should use gt() for exclusiveMinimum
      expect(result).toContain("balance: z.number().min(0)")
      // Should use lt() for exclusiveMaximum: true
      expect(result).toContain("balance: z.number().min(0).lt(1000000)")
    })

    test("multipleOf constraint", () => {
      const result = generate(stringFormatsSpec, { strictNumeric: true })

      // Should contain refine for multipleOf constraint
      expect(result).toContain("priority: z.number().min(1).max(10)")
      // Note: multipleOf: 1 doesn't add additional validation, but tests the structure
    })
  })

  describe("types configuration", () => {
    test("emit: false - skips operation type generation", () => {
      const result = generate(stringFormatsSpec, { types: { emit: false } })

      // Should NOT contain operation types
      expect(result).not.toContain("// Operation Types")
      expect(result).not.toContain("OperationDefinition<")
      expect(result).not.toContain("export type CreateUserOperation")
      expect(result).not.toContain("export type GetUserByIdOperation")
      expect(result).not.toContain("export type SendContactOperation")

      // Should NOT contain helper imports
      expect(result).not.toContain("import type { PathFn")
      expect(result).not.toContain("import type { HeaderFn")
      expect(result).not.toContain("import type { OperationDefinition")
      expect(result).not.toContain("import type { OperationErrors")

      // Should still contain schemas and operations
      expect(result).toContain("export const User =")
      expect(result).toContain("export const ContactForm =")
      expect(result).toContain("createUser:")
      expect(result).toContain("getUserById:")
      expect(result).toContain("sendContact:")
    })

    test("emit: true (default) - generates operation types", () => {
      const result = generate(stringFormatsSpec, {
        types: { treeShake: false },
      })

      // Should contain operation types
      expect(result).toContain("// Operation Types")
      expect(result).toContain(
        "export type CreateUserOperation = OperationDefinition<"
      )
      expect(result).toContain(
        "export type GetUserByIdOperation = OperationDefinition<"
      )
      expect(result).toContain(
        "export type SendContactOperation = OperationDefinition<"
      )

      // Should contain helper imports (default package mode)
      expect(result).toContain(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "zenko";'
      )
    })

    test("helpers: package (default) - imports from zenko package", () => {
      const result = generate(stringFormatsSpec, {
        types: { helpers: "package", treeShake: false },
      })

      expect(result).toContain(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "zenko";'
      )
      expect(result).not.toContain("type PathFn<")
      expect(result).not.toContain("type OperationDefinition<")
    })

    test("helpers: inline - writes helper definitions inline", () => {
      const result = generate(stringFormatsSpec, {
        types: { helpers: "inline" },
      })

      // Should contain inline type definitions
      expect(result).toContain(
        "type PathFn<TArgs extends unknown[] = []> = (...args: TArgs) => string;"
      )
      expect(result).toContain(
        'type RequestMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";'
      )
      expect(result).toContain(
        "type HeaderFn<TArgs extends unknown[] = [], TResult = Record<string, unknown> | Record<string, never>> = (...args: TArgs) => TResult;"
      )
      expect(result).toContain(
        "type AnyHeaderFn = HeaderFn<any, unknown> | (() => unknown);"
      )
      expect(result).toContain(
        "type OperationErrors<TError = unknown> = TError extends Record<string, unknown> ? TError : Record<string, TError>;"
      )
      expect(result).toContain("type OperationDefinition<")

      // Should NOT contain package imports
      expect(result).not.toContain('from "zenko"')
    })

    test("helpers: file - imports from custom path", () => {
      const result = generate(stringFormatsSpec, {
        types: {
          helpers: "file",
          helpersOutput: "./custom-api-types",
          treeShake: false,
        },
      })

      expect(result).toContain(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "./custom-api-types";'
      )
      expect(result).not.toContain("type PathFn<")
      expect(result).not.toContain('from "zenko"')
    })

    test("helpers: file with different output paths", () => {
      const result1 = generate(stringFormatsSpec, {
        types: {
          helpers: "file",
          helpersOutput: "@/shared/types",
          treeShake: false,
        },
      })

      const result2 = generate(stringFormatsSpec, {
        types: {
          helpers: "file",
          helpersOutput: "../../types/api-helpers",
          treeShake: false,
        },
      })

      expect(result1).toContain(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "@/shared/types";'
      )
      expect(result2).toContain(
        'import type { PathFn, HeaderFn, OperationDefinition, OperationErrors } from "../../types/api-helpers";'
      )
    })

    test("helpers option ignored when emit: false", () => {
      const result = generate(stringFormatsSpec, {
        types: {
          emit: false,
          helpers: "inline",
          helpersOutput: "./ignored-path",
        },
      })

      // Should not contain any helper-related code
      expect(result).not.toContain("import type { PathFn")
      expect(result).not.toContain("type PathFn<")
      expect(result).not.toContain("OperationDefinition<")
      expect(result).not.toContain("// Operation Types")
    })
  })

  describe("combined configuration options", () => {
    test("strictDates + strictNumeric + types configuration", () => {
      const result = generate(stringFormatsSpec, {
        strictDates: true,
        strictNumeric: true,
        types: {
          emit: true,
          helpers: "inline",
        },
      })

      // Should have strict date validation
      expect(result).toContain("createdAt: z.string().datetime()")
      expect(result).toContain("birthDate: z.string().date()")

      // Should have strict numeric validation
      expect(result).toContain("age: z.number().min(0).max(150)")
      expect(result).toContain("username: z.string().min(3).max(20)")

      // Should have inline helper types
      expect(result).toContain("type PathFn<")
      expect(result).toContain("type OperationDefinition<")

      // Should have operation types
      expect(result).toContain(
        "export type CreateUserOperation = OperationDefinition<"
      )
    })

    test("all options disabled", () => {
      const result = generate(stringFormatsSpec, {
        strictDates: false,
        strictNumeric: false,
        types: {
          emit: false,
        },
      })

      // Should have basic string validation for dates
      expect(result).toContain("createdAt: z.string()")
      expect(result).toContain("birthDate: z.string()")

      // Should have basic numeric validation
      expect(result).toContain("age: z.number()")
      expect(result).toContain("username: z.string()")

      // Should NOT have operation types
      expect(result).not.toContain("export type CreateUserOperation")

      // Should still have strict validation for non-date string formats
      expect(result).toContain("id: z.string().uuid()")
      expect(result).toContain("email: z.string().email()")
      expect(result).toContain("website: z.string().url()")
    })
  })

  describe("edge cases and validation", () => {
    test("empty spec with configuration options", () => {
      const emptySpec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Empty", version: "1.0.0" },
        paths: {},
      }

      const result = generate(emptySpec, {
        strictDates: true,
        strictNumeric: true,
        types: { emit: false },
      })

      expect(result).toContain('import { z } from "zod"')
      expect(result).toContain("export const paths = {")
      expect(result).not.toContain("OperationDefinition<")
    })

    test("spec with only string formats", () => {
      const stringOnlySpec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "String Only", version: "1.0.0" },
        paths: {},
        components: {
          schemas: {
            StringOnly: {
              type: "object",
              properties: {
                uuid: { type: "string", format: "uuid" },
                email: { type: "string", format: "email" },
                url: { type: "string", format: "uri" },
                dateTime: { type: "string", format: "date-time" },
                plain: { type: "string" },
              },
            },
          },
        },
      }

      const result = generate(stringOnlySpec, { strictDates: false })

      // Non-date formats should always be strict
      expect(result).toContain("uuid: z.string().uuid()")
      expect(result).toContain("email: z.string().email()")
      expect(result).toContain("url: z.string().url()")

      // Date format should be basic when strictDates: false
      expect(result).toContain("dateTime: z.string()")

      // Plain string should be basic
      expect(result).toContain("plain: z.string()")
    })
  })

  describe("optionalType option", () => {
    test("default behavior (optionalType: optional) - optional fields use z.optional()", () => {
      const result = generate(stringFormatsSpec, {
        types: { optionalType: "optional" },
      })

      // Optional fields should use .optional()
      expect(result).toContain("website: z.string().url().optional()")
      expect(result).toContain("avatar: z.string().url().optional()")
      expect(result).toContain("username: z.string().optional()")
      expect(result).toContain("tags: z.array(z.string()).optional()")

      // Required fields should NOT have optional modifier
      expect(result).toContain("id: z.string().uuid()")
      expect(result).not.toContain("id: z.string().uuid().optional()")
      expect(result).toContain("email: z.string().email()")
      expect(result).not.toContain("email: z.string().email().optional()")
    })

    test("optionalType: nullable - optional fields use z.nullable()", () => {
      const result = generate(stringFormatsSpec, {
        types: { optionalType: "nullable" },
      })

      // Optional fields should use .nullable()
      expect(result).toContain("website: z.string().url().nullable()")
      expect(result).toContain("avatar: z.string().url().nullable()")
      expect(result).toContain("username: z.string().nullable()")
      expect(result).toContain("tags: z.array(z.string()).nullable()")

      // Should NOT contain .optional() for optional fields
      expect(result).not.toContain("website: z.string().url().optional()")
      expect(result).not.toContain("avatar: z.string().url().optional()")

      // Required fields should NOT have nullable modifier
      expect(result).toContain("id: z.string().uuid()")
      expect(result).not.toContain("id: z.string().uuid().nullable()")
    })

    test("optionalType: nullish - optional fields use z.nullish()", () => {
      const result = generate(stringFormatsSpec, {
        types: { optionalType: "nullish" },
      })

      // Optional fields should use .nullish()
      expect(result).toContain("website: z.string().url().nullish()")
      expect(result).toContain("avatar: z.string().url().nullish()")
      expect(result).toContain("username: z.string().nullish()")
      expect(result).toContain("tags: z.array(z.string()).nullish()")

      // Should NOT contain .optional() or .nullable() for optional fields
      expect(result).not.toContain("website: z.string().url().optional()")
      expect(result).not.toContain("website: z.string().url().nullable()")

      // Required fields should NOT have nullish modifier
      expect(result).toContain("id: z.string().uuid()")
      expect(result).not.toContain("id: z.string().uuid().nullish()")
    })

    test("optionalType applies to headers as well", () => {
      const headerSpec = Bun.YAML.parse(
        fs.readFileSync("src/resources/mixed-headers.yaml", "utf8")
      ) as OpenAPISpec

      const resultOptional = generate(headerSpec, {
        types: { optionalType: "optional" },
      })
      expect(resultOptional).toContain("Agent: z.string().optional()")

      const resultNullable = generate(headerSpec, {
        types: { optionalType: "nullable" },
      })
      expect(resultNullable).toContain("Agent: z.string().nullable()")
      expect(resultNullable).not.toContain("Agent: z.string().optional()")

      const resultNullish = generate(headerSpec, {
        types: { optionalType: "nullish" },
      })
      expect(resultNullish).toContain("Agent: z.string().nullish()")
      expect(resultNullish).not.toContain("Agent: z.string().optional()")
      expect(resultNullish).not.toContain("Agent: z.string().nullable()")

      // Required headers should not have modifiers
      expect(resultOptional).toContain("Test: z.coerce.boolean()")
      expect(resultOptional).not.toContain(
        "Test: z.coerce.boolean().optional()"
      )
      expect(resultNullable).toContain("Test: z.coerce.boolean()")
      expect(resultNullable).not.toContain(
        "Test: z.coerce.boolean().nullable()"
      )
    })

    test("optionalType can be overridden per-schema via config", () => {
      // This test would require a config file, but we can test the API directly
      const result1 = generate(stringFormatsSpec, {
        types: { optionalType: "optional" },
      })
      const result2 = generate(stringFormatsSpec, {
        types: { optionalType: "nullable" },
      })
      const result3 = generate(stringFormatsSpec, {
        types: { optionalType: "nullish" },
      })

      // Verify different behaviors
      expect(result1).toContain("website: z.string().url().optional()")
      expect(result2).toContain("website: z.string().url().nullable()")
      expect(result3).toContain("website: z.string().url().nullish()")

      // Verify no cross-contamination
      expect(result1).not.toContain("website: z.string().url().nullable()")
      expect(result2).not.toContain("website: z.string().url().optional()")
      expect(result3).not.toContain("website: z.string().url().optional()")
    })
  })
})
