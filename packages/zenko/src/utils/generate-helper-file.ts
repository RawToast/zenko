/**
 * Generate a standalone helper types file for use with `helpers: "file"` mode.
 *
 * @returns TypeScript source containing PathFn, HeaderFn, OperationDefinition, and OperationErrors type definitions.
 */
export function generateHelperFile(): string {
  const output: string[] = []

  output.push("// Generated helper types for Zenko")
  output.push(
    "// This file provides type definitions for operation objects and path functions"
  )
  output.push("")
  output.push(
    "export type PathFn<TArgs extends unknown[] = []> = (...args: TArgs) => string"
  )
  output.push("")
  output.push(
    'export type RequestMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace"'
  )
  output.push("")
  output.push(
    "export type HeaderFn<TArgs extends unknown[] = [], TResult = Record<string, unknown> | Record<string, never>> = (...args: TArgs) => TResult"
  )
  output.push("")
  output.push(
    "export type AnyHeaderFn = HeaderFn<any, unknown> | (() => unknown)"
  )
  output.push("")
  output.push(
    "export type OperationErrors<TError = unknown> = TError extends Record<string, unknown> ? TError : Record<string, TError>;"
  )
  output.push("")
  output.push(
    "export type OperationDefinition<TMethod extends RequestMethod, TPath extends (...args: any[]) => string, TRequest = undefined, TResponse = undefined, THeaders extends AnyHeaderFn | undefined = undefined, TErrors extends OperationErrors | undefined = undefined> = {"
  )
  output.push("  method: TMethod")
  output.push("  path: TPath")
  output.push("  request?: TRequest")
  output.push("  response?: TResponse")
  output.push("  headers?: THeaders")
  output.push("  errors?: TErrors")
  output.push("}")
  output.push("")

  return output.join("\n")
}
