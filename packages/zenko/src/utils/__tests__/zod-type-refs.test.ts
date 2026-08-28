import { describe, expect, it } from "bun:test"

import { toZodValueReference, typeKeywordToZodType } from "../zod-type-refs"

describe("toZodValueReference", () => {
  it("maps TypeScript keywords to Zod value expressions", () => {
    expect(toZodValueReference("unknown")).toBe("z.unknown()")
    expect(toZodValueReference("string")).toBe("z.string()")
    expect(toZodValueReference("number")).toBe("z.number()")
    expect(toZodValueReference("boolean")).toBe("z.boolean()")
    expect(toZodValueReference("null")).toBe("z.null()")
    expect(toZodValueReference("any")).toBe("z.any()")
    expect(toZodValueReference("never")).toBe("z.never()")
    expect(toZodValueReference("void")).toBe("z.void()")
    expect(toZodValueReference("bigint")).toBe("z.bigint()")
  })

  it("preserves undefined and named schema references", () => {
    expect(toZodValueReference("undefined")).toBe("undefined")
    expect(toZodValueReference("  undefined  ")).toBe("undefined")
    expect(toZodValueReference("Pet")).toBe("Pet")
    expect(toZodValueReference("z.array(Pet)")).toBe("z.array(Pet)")
  })
})

describe("typeKeywordToZodType", () => {
  it("maps TypeScript keywords to Zod type constructors", () => {
    expect(typeKeywordToZodType("string")).toBe("z.ZodString")
    expect(typeKeywordToZodType("number")).toBe("z.ZodNumber")
    expect(typeKeywordToZodType("boolean")).toBe("z.ZodBoolean")
    expect(typeKeywordToZodType("unknown")).toBe("z.ZodUnknown")
    expect(typeKeywordToZodType("any")).toBe("z.ZodAny")
    expect(typeKeywordToZodType("null")).toBe("z.ZodNull")
    expect(typeKeywordToZodType("never")).toBe("z.ZodNever")
    expect(typeKeywordToZodType("void")).toBe("z.ZodVoid")
    expect(typeKeywordToZodType("bigint")).toBe("z.ZodBigInt")
  })

  it("returns undefined for non-keywords", () => {
    expect(typeKeywordToZodType("Pet")).toBeUndefined()
    expect(typeKeywordToZodType("undefined")).toBeUndefined()
    expect(typeKeywordToZodType("typeof Pet")).toBeUndefined()
  })
})
