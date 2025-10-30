import type { Operation, OperationErrorGroup } from "../types/operation"

export type ZenkoUsage = {
  usesHeaderFn: boolean
  usesOperationDefinition: boolean
  usesOperationErrors: boolean
}

/**
 * Analyzes operations to determine which Zenko types are actually used
 */
export function analyzeZenkoUsage(operations: Operation[]): ZenkoUsage {
  const usage: ZenkoUsage = {
    usesHeaderFn: false,
    usesOperationDefinition: false,
    usesOperationErrors: false,
  }

  // If there are any operations, OperationDefinition is always used
  if (operations.length > 0) {
    usage.usesOperationDefinition = true
  }

  for (const op of operations) {
    // PathFn is never used in package/file mode - only in inline helpers
    // So we never set usesPathFn to true here

    // HeaderFn is never used in package/file mode - the generated code uses
    // `typeof headers.xxx` which TypeScript can infer without needing HeaderFn
    // So we never set usesHeaderFn to true here

    // OperationErrors is used if there are any error responses
    // Note: Even if there are no explicit errors, the type might still be used
    // as a default in OperationDefinition, so we need to check if it's actually needed
    if (op.errors && hasAnyErrors(op.errors)) {
      usage.usesOperationErrors = true
    }
  }

  // Special case: if there are operations but no errors, OperationErrors is still used
  // as the default type in OperationDefinition
  if (operations.length > 0 && !usage.usesOperationErrors) {
    // Check if any operation has the default OperationErrors type
    const hasDefaultErrors = operations.some(
      (op) => !op.errors || !hasAnyErrors(op.errors)
    )
    if (hasDefaultErrors) {
      usage.usesOperationErrors = true
    }
  }

  return usage
}

/**
 * Generates the import statement based on usage analysis
 */
export function generateZenkoImport(
  usage: ZenkoUsage,
  mode: "package" | "file",
  helpersOutput?: string
): string {
  const types: string[] = []

  // PathFn is never used in package/file mode - only in inline helpers
  if (usage.usesHeaderFn) types.push("HeaderFn")
  if (usage.usesOperationDefinition) types.push("OperationDefinition")
  if (usage.usesOperationErrors) types.push("OperationErrors")

  // If no types are used, return empty string
  if (types.length === 0) {
    return ""
  }

  const importSource = mode === "package" ? '"zenko"' : `"${helpersOutput}"`
  return `import type { ${types.join(", ")} } from ${importSource};`
}

function hasAnyErrors(errors: OperationErrorGroup): boolean {
  return Boolean(errors && Object.keys(errors).length > 0)
}
