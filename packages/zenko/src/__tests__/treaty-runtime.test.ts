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

describe("createTreatyClient (operations) — branch coverage", () => {
  const Pet = z.object({ id: z.number(), name: z.string() })

  test("returns unexpectedError other when metadata method is not a supported HTTP verb", async () => {
    const fetchMock = mock<typeof fetch>()
    const getThing = {
      method: "get" as const,
      path: () => "/thing",
      response: Pet,
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { getThing },
      operationMetadata: {
        getThing: {
          method: "not-a-real-method",
          path: "/thing",
          successResponses: { "200": "Pet" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.getThing()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "other",
    })
    if (result.kind === "unexpectedError" && result.subtype === "other") {
      expect(String(result.error)).toContain("Unsupported method")
    }
  })

  test("serializes POST bodies: FormData, Blob with type, and JSON object", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: "a" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const createThing = {
      method: "post" as const,
      path: () => "/things",
      response: Pet,
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { createThing },
      operationMetadata: {
        createThing: {
          method: "post",
          path: "/things",
          successResponses: { "200": "Pet" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })

    const fd = new FormData()
    fd.append("a", "b")
    await client.createThing({ body: fd })
    const formCall = fetchMock.mock.calls[0]
    expect(formCall?.[1]?.body).toBe(fd)

    const blob = new Blob(["{}"], { type: "application/json" })
    await client.createThing({ body: blob })
    const blobCall = fetchMock.mock.calls[1]
    expect(blobCall?.[1]?.body).toBe(blob)
    const blobHeaders = blobCall?.[1]?.headers as Headers
    expect(blobHeaders?.get("content-type")).toMatch(/^application\/json/)

    await client.createThing({ body: { id: 2, name: "obj" } })
    const jsonCall = fetchMock.mock.calls[2]
    expect(jsonCall?.[1]?.body).toBe(JSON.stringify({ id: 2, name: "obj" }))
    const jsonHeaders = jsonCall?.[1]?.headers as Headers
    expect(jsonHeaders?.get("content-type")).toBe("application/json")
  })

  test("returns success with undefined data when the operation has no response schema", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ extra: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const noop = {
      method: "get" as const,
      path: () => "/noop",
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { noop },
      operationMetadata: {
        noop: { method: "get", path: "/noop" },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.noop()
    expect(result).toMatchObject({ kind: "success", status: 200 })
    if (result.kind === "success") {
      expect(result.data).toBeUndefined()
    }
  })

  test("returns kind=error with specStatus unlisted and raw parsed body when no error schema applies", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ reason: "nope" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    )
    const fragile = {
      method: "get" as const,
      path: () => "/fragile",
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { fragile },
      operationMetadata: {
        fragile: { method: "get", path: "/fragile" },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.fragile()
    expect(result).toMatchObject({
      kind: "error",
      specStatus: "unlisted",
      status: 503,
    })
    if (result.kind === "error") {
      expect(result.error).toEqual({ reason: "nope" })
    }
  })

  test("returns unexpectedError parse when an error response body is JSON content-type but invalid JSON", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response("not-json{", {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    )
    const fragile = {
      method: "get" as const,
      path: () => "/fragile",
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { fragile },
      operationMetadata: {
        fragile: { method: "get", path: "/fragile" },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.fragile()
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "parse",
      status: 502,
    })
  })
})

describe("createTreatyClient (route tree) — error & parse branches", () => {
  const routes = {
    api: {
      get: {
        method: "get",
        path: () => "/api/x",
      },
    },
  } as const

  test("returns kind=error with specStatus unlisted when the response is not ok", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ msg: "bad" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.api.get()
    expect(result).toMatchObject({
      kind: "error",
      specStatus: "unlisted",
      status: 422,
    })
    if (result.kind === "error") {
      expect(result.error).toEqual({ msg: "bad" })
    }
  })

  test("returns unexpectedError parse when JSON body is invalid on the route-tree client", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response("oops{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.api.get()
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "parse",
    })
  })
})
