import { describe, expect, expectTypeOf, test } from "bun:test"
import { z } from "zod"

import { createTreatyClient } from "../treaty"
import type { TreatyResultFor } from "../treaty-infer"
import type { TreatyResult } from "../treaty-types"
import type { OperationDefinition, OperationErrors } from "../types"

/** Compile-time equality check (fails `tsc` when types diverge). */
type ExpectEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

describe("TreatyClient type inference", () => {
  test("nested static segment + GET infers success data from Zod response", () => {
    const Resp = z.object({ id: z.string(), name: z.string() })
    const paths = {
      list: () => "/items" as const,
    } as const

    type ListOp = OperationDefinition<
      "get",
      typeof paths.list,
      undefined,
      typeof Resp,
      undefined,
      OperationErrors,
      undefined
    >

    const listItems: ListOp = {
      method: "get",
      path: paths.list,
      response: Resp,
    } as const

    const routes = {
      catalog: {
        items: {
          get: listItems,
        },
      },
    } as const

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
    })

    type GetRet = Awaited<ReturnType<typeof client.catalog.items.get>>
    type Ok = Extract<GetRet, { kind: "success" }>
    type Data = Ok["data"]
    const _equal: ExpectEqual<Data, z.infer<typeof Resp>> = true
    expect(_equal).toBe(true)
  })

  test("dynamic :row / :column + GET and PUT (tictactoe-shaped routes)", () => {
    const errorMessage = z.string()
    const mark = z.enum([".", "X", "O"])
    const status = z.object({
      winner: mark.optional(),
      board: z.array(z.array(mark).min(3).max(3)).min(3).max(3).optional(),
    })

    const paths = {
      getBoard: () => "/board" as const,
      getSquare: ({ row, column }: { row: string; column: string }) =>
        `/board/${row}/${column}` as const,
      putSquare: ({ row, column }: { row: string; column: string }) =>
        `/board/${row}/${column}` as const,
    } as const

    type GetBoardOp = OperationDefinition<
      "get",
      typeof paths.getBoard,
      undefined,
      typeof status,
      undefined,
      OperationErrors,
      undefined
    >
    type GetSquareOp = OperationDefinition<
      "get",
      typeof paths.getSquare,
      undefined,
      typeof mark,
      undefined,
      OperationErrors<{ badRequest: typeof errorMessage }>,
      undefined
    >
    type PutSquareOp = OperationDefinition<
      "put",
      typeof paths.putSquare,
      typeof mark,
      typeof status,
      undefined,
      OperationErrors<{ badRequest: typeof errorMessage }>,
      undefined
    >

    const getBoard: GetBoardOp = {
      method: "get",
      path: paths.getBoard,
      response: status,
    } as const

    const getSquare: GetSquareOp = {
      method: "get",
      path: paths.getSquare,
      response: mark,
      errors: { badRequest: errorMessage },
    } as const

    const putSquare: PutSquareOp = {
      method: "put",
      path: paths.putSquare,
      request: mark,
      response: status,
      errors: { badRequest: errorMessage },
    } as const

    const routes = {
      board: {
        get: getBoard,
        ":row": {
          ":column": {
            get: getSquare,
            put: putSquare,
          },
        },
      },
    } as const

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
    })

    type BoardGet = Awaited<ReturnType<typeof client.board.get>>
    type BoardData = Extract<BoardGet, { kind: "success" }>["data"]
    const _boardData: ExpectEqual<BoardData, z.infer<typeof status>> = true
    expect(_boardData).toBe(true)

    const cell = client.board({ row: "1" })({ column: "2" })
    type PutRet = Awaited<ReturnType<typeof cell.put>>
    type PutOk = Extract<PutRet, { kind: "success" }>
    type PutData = PutOk["data"]
    const _putData: ExpectEqual<PutData, z.infer<typeof status>> = true
    expect(_putData).toBe(true)
  })

  test("non-Zod leaves allow unknown body on mutating methods", async () => {
    const routes = {
      board: {
        put: {
          method: "put",
          path: () => "/board",
        },
      },
    } as const

    const fetchMock = async () =>
      new Response(null, { status: 204, statusText: "No Content" })

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
      fetch: fetchMock as unknown as typeof fetch,
    })

    const p: Promise<TreatyResult<unknown>> = client.board.put("payload")
    expect(p).toBeInstanceOf(Promise)
    await p
  })

  test("operation result narrows success and unexpected branches (petstore-shaped)", () => {
    const Pet = z.object({
      id: z.number(),
      name: z.string(),
      tag: z.string().optional(),
    })
    const ApiError = z.object({
      code: z.number(),
      message: z.string(),
    })

    const paths = {
      showPetById: ({ petId }: { petId: string }) => `/pets/${petId}` as const,
    } as const

    type ShowPetByIdOp = OperationDefinition<
      "get",
      typeof paths.showPetById,
      undefined,
      typeof Pet,
      undefined,
      OperationErrors<{
        notFound: typeof ApiError
        defaultError: typeof ApiError
      }>,
      undefined
    >

    const showPetById: ShowPetByIdOp = {
      method: "get",
      path: paths.showPetById,
      response: Pet,
      errors: { notFound: ApiError, defaultError: ApiError },
    } as const

    const operationMetadata = {
      showPetById: {
        method: "get",
        path: "/pets/{petId}",
        successResponses: { "200": "Pet" },
        errorResponses: { "404": "Error", default: "Error" },
        errorStatusKeys: { "404": "notFound", default: "defaultError" },
      },
    } as const

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { showPetById },
      operationMetadata,
    })

    expectTypeOf(client.showPetById).toBeFunction()

    type Result = TreatyResultFor<
      typeof showPetById,
      typeof operationMetadata.showPetById
    >

    type ExpectedSuccess = Extract<Result, { kind: "success" }>
    expectTypeOf<ExpectedSuccess["status"]>().toEqualTypeOf<200>()
    expectTypeOf<ExpectedSuccess["data"]>().toEqualTypeOf<z.infer<typeof Pet>>()

    type ExpectedTransportError = Extract<
      Result,
      { kind: "unexpectedError"; subtype: "transport" }
    >
    expectTypeOf<ExpectedTransportError["error"]>().toEqualTypeOf<Error>()

    type ExpectedParseError = Extract<
      Result,
      { kind: "unexpectedError"; subtype: "parse" }
    >
    expectTypeOf<ExpectedParseError["rawBody"]>().toEqualTypeOf<string>()
  })
})
