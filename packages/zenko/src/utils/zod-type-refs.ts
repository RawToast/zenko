/**
 * Converts a response/request type name into a Zod value expression for
 * operation object fields. TypeScript type keywords become Zod schemas
 * (e.g. "unknown" -> "z.unknown()"); named schemas pass through unchanged.
 * The "undefined" keyword is left as-is so empty error bodies stay `undefined`.
 */
export function toZodValueReference(typeName: string): string {
  const normalized = typeName.trim()
  if (normalized === "undefined") return "undefined"
  switch (normalized) {
    case "unknown":
      return "z.unknown()"
    case "string":
      return "z.string()"
    case "number":
      return "z.number()"
    case "boolean":
      return "z.boolean()"
    case "null":
      return "z.null()"
    case "any":
      return "z.any()"
    case "never":
      return "z.never()"
    case "void":
      return "z.void()"
    case "bigint":
      return "z.bigint()"
    default:
      return typeName
  }
}

/**
 * Maps a TypeScript type keyword to the corresponding Zod type constructor
 * name used in generated `OperationDefinition` type arguments.
 */
export function typeKeywordToZodType(typeName: string): string | undefined {
  switch (typeName) {
    case "string":
      return "z.ZodString"
    case "number":
      return "z.ZodNumber"
    case "boolean":
      return "z.ZodBoolean"
    case "unknown":
      return "z.ZodUnknown"
    case "any":
      return "z.ZodAny"
    case "null":
      return "z.ZodNull"
    case "never":
      return "z.ZodNever"
    case "void":
      return "z.ZodVoid"
    case "bigint":
      return "z.ZodBigInt"
    default:
      return undefined
  }
}
