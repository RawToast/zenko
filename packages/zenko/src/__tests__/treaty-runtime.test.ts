import { describe, expect, mock, test } from "bun:test"
import { z } from "zod"

import { createTreatyClient } from "../treaty"

const routes = {
  board: {
    get: {
      method: "get",
      path: () => "/board",
    },
    ":row": {
      ":column": {
        put: {
          method: "put",
          path: ({ row, column }: { row: string; column: string }) =>
            `/board/${row}/${column}`,
        },
      },
    },
  },
} as const

describe("createTreatyClient (route tree)", () => {
  test("calls GET leaves and returns a success envelope", async () => {
    const fetchMock = mock<typeof fetch>()

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ winner: "." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.board.get()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board",
      expect.objectContaining({ method: "GET" })
    )
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toEqual({ winner: "." })
    }
  })

  test("walks dynamic segments and sends raw string bodies", async () => {
    const fetchMock = mock<typeof fetch>()

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
      fetch: fetchMock as unknown as typeof fetch,
    })
    await client.board({ row: "1" })({ column: "2" }).put("X")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board/1/2",
      expect.objectContaining({
        method: "PUT",
        body: "X",
      })
    )
  })

  test("returns unexpectedError other when route path resolution throws", async () => {
    const fetchMock = mock<typeof fetch>()

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes: {
        broken: {
          get: {
            method: "get",
            path: () => {
              throw new Error("path boom")
            },
          },
        },
      },
      fetch: fetchMock as unknown as typeof fetch,
    })

    const result = await client.broken.get()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "other",
    })
    if (result.kind === "unexpectedError" && result.subtype === "other") {
      expect(result.error).toBeInstanceOf(Error)
    }
  })
})

describe("createTreatyClient (operations + metadata)", () => {
  const Pet = z.object({ id: z.number(), name: z.string() })
  const Err = z.object({ message: z.string() })

  const showPetById = {
    method: "get" as const,
    path: ({ petId }: { petId: string }) => `/pets/${petId}`,
    response: Pet,
    errors: { notFound: Err, defaultError: Err },
  } as const

  const operationMetadata = {
    showPetById: {
      method: "get",
      path: "/pets/{petId}",
      successResponses: { "200": "Pet" },
      errorResponses: { "404": "Err", default: "Err" },
      errorStatusKeys: { "404": "notFound", default: "defaultError" },
    },
  } as const

  test("returns kind=success for 200 JSON", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 42, name: "Neko" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { showPetById },
      operationMetadata,
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.showPetById({ params: { petId: "42" } })
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toEqual({ id: 42, name: "Neko" })
    }
  })

  test("returns kind=error with specStatus for known error responses", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "missing" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { showPetById },
      operationMetadata,
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.showPetById({ params: { petId: "missing" } })
    expect(result).toMatchObject({ kind: "error", specStatus: 404 })
  })

  test("returns unexpectedError parse when an error body fails the mapped schema", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ nope: true }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { showPetById },
      operationMetadata,
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.showPetById({ params: { petId: "missing" } })
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "parse",
      status: 404,
    })
  })

  test("returns unexpectedError transport when fetch rejects", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockRejectedValue(new TypeError("network down"))
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { showPetById },
      operationMetadata,
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.showPetById({ params: { petId: "42" } })
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "transport",
    })
  })

  test("returns unexpectedError parse when a typed JSON body cannot be parsed", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { showPetById },
      operationMetadata,
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.showPetById({ params: { petId: "42" } })
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "parse",
    })
  })
})
