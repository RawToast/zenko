import { describe, test, expect } from "bun:test"
import { generateHelperFile } from "../generate-helper-file"

describe("generateHelperFile", () => {
  test("produces valid TypeScript", () => {
    const helperContent = generateHelperFile()
    expect(helperContent).toMatchInlineSnapshot(`
      "// Generated helper types for Zenko
      // This file provides type definitions for operation objects and path functions

      export type PathFn<TArgs extends unknown[] = []> = (...args: TArgs) => string

      export type RequestMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace"

      export type HeaderFn<TArgs extends unknown[] = [], TResult = Record<string, unknown> | Record<string, never>> = (...args: TArgs) => TResult

      export type AnyHeaderFn = HeaderFn<any, unknown> | (() => unknown)

      export type OperationErrors<TClient = unknown, TServer = unknown, TDefault = unknown, TOther = unknown> = {
        clientErrors?: TClient
        serverErrors?: TServer
        defaultErrors?: TDefault
        otherErrors?: TOther
      }

      export type OperationDefinition<TMethod extends RequestMethod, TPath extends (...args: any[]) => string, TRequest = undefined, TResponse = undefined, THeaders extends AnyHeaderFn | undefined = undefined, TErrors extends OperationErrors | undefined = undefined> = {
        method: TMethod
        path: TPath
        request?: TRequest
        response?: TResponse
        headers?: THeaders
        errors?: TErrors
      }
      "
    `)
  })
})
