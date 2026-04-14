import { describe, expect, mock, test } from "bun:test"
import { z } from "zod"

import { createTreatyClient, unwrap } from "../treaty"
import type { TreatyResult } from "../treaty-types"

type TreatySuccessResult = Extract<TreatyResult, { kind: "success" }>
type TreatyErrorBranch = Extract<TreatyResult, { kind: "error" }>
type TreatyUnexpectedOther = Extract<
  TreatyResult,
  { kind: "unexpectedError"; subtype: "other" }
>

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
    const success = result as TreatySuccessResult
    expect(success.data).toEqual({ winner: "." })
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
    const unexpectedOther = result as TreatyUnexpectedOther
    expect(unexpectedOther.error).toBeInstanceOf(Error)
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
    const success = result as TreatySuccessResult
    expect(success.data).toEqual({ id: 42, name: "Neko" })
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
    const unexpectedOther = result as TreatyUnexpectedOther
    expect(String(unexpectedOther.error)).toContain("Unsupported method")
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
    const success = result as TreatySuccessResult
    expect(success.data).toBeUndefined()
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
    const err = result as TreatyErrorBranch
    expect(err.error).toEqual({ reason: "nope" })
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
    const err = result as TreatyErrorBranch
    expect(err.error).toEqual({ msg: "bad" })
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

  test("appends query string for GET via buildQueryString (dates, objects, bigint)", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const when = new Date("2020-01-01T00:00:00.000Z")
    await client.api.get({
      query: {
        when,
        meta: { k: 1 },
        id: 42n,
        ok: true,
        skip: undefined,
        empty: null,
        odd: Symbol("x") as unknown as string,
      },
    })
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain("when=2020-01-01T00%3A00%3A00.000Z")
    expect(url).toContain("meta=")
    expect(url).toContain("id=42")
    expect(url).toContain("ok=true")
    expect(url).toContain("odd=")
  })

  test("serializes POST body on route tree: FormData strips content-type, Blob sets type", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes: {
        upload: {
          post: {
            method: "post",
            path: () => "/upload",
          },
        },
      },
      fetch: fetchMock as unknown as typeof fetch,
    })
    const fd = new FormData()
    fd.append("f", "v")
    await client.upload.post(fd)
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeUndefined()

    const blob = new Blob(["{}"], { type: "application/json" })
    await client.upload.post(blob)
    const blobHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(blobHeaders?.get("content-type")).toMatch(/^application\/json/)
  })

  test("returns unexpectedError transport when route-tree fetch rejects", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockRejectedValue(new Error("leaf fetch failed"))
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.api.get()
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "transport",
    })
  })
})

describe("createTreatyClient (route tree) — proxy TypeErrors", () => {
  test("throws when calling a dynamic segment without a parameter object", () => {
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes: {
        board: {
          ":row": {
            get: {
              method: "get",
              path: ({ row }: { row: string }) => `/r/${row}`,
            },
          },
        },
      },
    })
    const rowProxy = client.board as unknown as (arg?: unknown) => unknown
    expect(() => rowProxy()).toThrow("Expected a path parameter object")
    expect(() => rowProxy(null)).toThrow("Expected a path parameter object")
  })

  test("throws when invoking call on a route with no :segment (no dynamic path)", () => {
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes: {
        onlyStatic: {
          get: {
            method: "get",
            path: () => "/only",
          },
        },
      },
    })
    const seg = client.onlyStatic as unknown as (
      arg: Record<string, string>
    ) => unknown
    expect(() => seg({})).toThrow("No dynamic path segment here")
  })

  test("throws when a dynamic segment points at a leaf instead of a nested route", () => {
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes: {
        bad: {
          ":id": {
            method: "get" as const,
            path: ({ id }: { id: string }) => `/u/${id}`,
          },
        },
      },
    })
    const bad = client.bad as unknown as (
      arg: Record<string, string>
    ) => unknown
    expect(() => bad({ id: "1" })).toThrow(
      "Unexpected leaf under dynamic segment"
    )
  })

  test("throws when a dynamic slot is missing its child route", () => {
    const routes = {
      hole: {
        ":row": undefined,
        get: {
          method: "get" as const,
          path: () => "/hole",
        },
      },
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
    })
    const hole = client.hole as unknown as (
      arg: Record<string, string>
    ) => unknown
    expect(() => hole({ row: "1" })).toThrow("Missing route segment :row")
  })
})

describe("createTreatyClient (operations) — more branch coverage", () => {
  const Pet = z.object({ id: z.number(), name: z.string() })
  const Err = z.object({ message: z.string() })

  test("joinUrl adds a leading slash when the path omits one", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: {
        rel: {
          method: "get" as const,
          path: () => "no-leading-slash",
          response: z.null(),
        },
      },
      operationMetadata: {
        rel: {
          method: "get",
          path: "/x",
          successResponses: { "200": "null" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    await client.rel()
    expect(fetchMock.mock.calls[0]?.[0] as string).toBe(
      "https://api.test.com/no-leading-slash"
    )
  })

  test("accepts a string path at runtime (non-callable op.path)", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: {
        lit: {
          method: "get" as const,
          path: "/static-segment" as unknown as (
            x?: Record<string, unknown>
          ) => string,
          response: z.null(),
        },
      },
      operationMetadata: {
        lit: {
          method: "get",
          path: "/static-segment",
          successResponses: { "200": "null" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    await client.lit()
    expect(fetchMock.mock.calls[0]?.[0] as string).toBe(
      "https://api.test.com/static-segment"
    )
  })

  test("returns unexpectedError other when the path function throws", async () => {
    const fetchMock = mock<typeof fetch>()
    const boom = {
      method: "get" as const,
      path: () => {
        throw new Error("path exploded")
      },
      response: Pet,
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { boom },
      operationMetadata: {
        boom: {
          method: "get",
          path: "/boom",
          successResponses: { "200": "Pet" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.boom()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "other",
    })
  })

  test("parses non-JSON success bodies as raw text when content-type is not JSON", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response("plain-ok", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    )
    const strOk = {
      method: "get" as const,
      path: () => "/text",
      response: z.string(),
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { strOk },
      operationMetadata: {
        strOk: {
          method: "get",
          path: "/text",
          successResponses: { "200": "string" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.strOk()
    expect(result).toMatchObject({ kind: "success" })
    const success = result as TreatySuccessResult
    expect(success.data).toBe("plain-ok")
  })

  test("returns unexpectedError parse when success JSON parses but fails the response schema", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ wrong: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: {
        strict: {
          method: "get" as const,
          path: () => "/strict",
          response: Pet,
        },
      },
      operationMetadata: {
        strict: {
          method: "get",
          path: "/strict",
          successResponses: { "200": "Pet" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.strict()
    expect(result).toMatchObject({
      kind: "unexpectedError",
      subtype: "parse",
      status: 200,
    })
  })

  test("uses specStatus default and defaultError when only default is listed in metadata", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    )
    const op = {
      method: "get" as const,
      path: () => "/limited",
      response: Pet,
      errors: { defaultError: Err },
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { limited: op },
      operationMetadata: {
        limited: {
          method: "get",
          path: "/limited",
          successResponses: { "200": "Pet" },
          errorResponses: { default: "Err" },
          errorStatusKeys: { default: "defaultError" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.limited()
    expect(result).toMatchObject({
      kind: "error",
      specStatus: "default",
      status: 429,
    })
    const err = result as TreatyErrorBranch
    expect(err.error).toEqual({ message: "rate limited" })
  })

  test("returns unlisted error when errorResponses has no key for status and no default entry", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "oops" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: {
        gap: {
          method: "get" as const,
          path: () => "/gap",
        },
      },
      operationMetadata: {
        gap: {
          method: "get",
          path: "/gap",
          errorResponses: { "404": "Err" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.gap()
    expect(result).toMatchObject({
      kind: "error",
      specStatus: "unlisted",
      status: 500,
    })
  })

  test("returns unlisted error when errorStatusKeys omits the status and has no default key", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "no key" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: {
        keyed: {
          method: "get" as const,
          path: () => "/keyed",
          errors: { only404: Err },
        },
      },
      operationMetadata: {
        keyed: {
          method: "get",
          path: "/keyed",
          errorResponses: { "503": "Err", "404": "Err" },
          errorStatusKeys: { "404": "only404" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.keyed()
    expect(result).toMatchObject({
      kind: "error",
      specStatus: 503,
      status: 503,
    })
    const err = result as TreatyErrorBranch
    expect(err.error).toEqual({ message: "no key" })
  })

  test("maps error status via errorStatusKeys[code] for a listed HTTP code", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "slow" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    )
    const op = {
      method: "get" as const,
      path: () => "/slow",
      response: Pet,
      errors: { defaultError: Err },
    } as const
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: { slow: op },
      operationMetadata: {
        slow: {
          method: "get",
          path: "/slow",
          successResponses: { "200": "Pet" },
          errorResponses: { "503": "Err", default: "Err" },
          errorStatusKeys: { "503": "defaultError", default: "defaultError" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.slow()
    expect(result).toMatchObject({ kind: "error", specStatus: 503 })
  })

  test("parses non-JSON error bodies as raw text for HTTP errors", async () => {
    const fetchMock = mock<typeof fetch>()
    fetchMock.mockResolvedValue(
      new Response("plain err", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })
    )
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: {
        fragile: {
          method: "get" as const,
          path: () => "/fragile",
        },
      },
      operationMetadata: {
        fragile: { method: "get", path: "/fragile" },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.fragile()
    expect(result).toMatchObject({
      kind: "error",
      specStatus: "unlisted",
      status: 500,
    })
    const err = result as TreatyErrorBranch
    expect(err.error).toBe("plain err")
  })

  test("treats readRawBody failure as empty string and still returns a result", async () => {
    const fetchMock = mock<typeof fetch>()
    const badBodyResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      clone() {
        return {
          text: () => Promise.reject(new Error("body read failed")),
        }
      },
    } as unknown as Response
    fetchMock.mockResolvedValue(badBodyResponse)
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      operations: {
        noRead: {
          method: "get" as const,
          path: () => "/nr",
          response: z.null(),
        },
      },
      operationMetadata: {
        noRead: {
          method: "get",
          path: "/nr",
          successResponses: { "200": "null" },
        },
      },
      options: { fetch: fetchMock as unknown as typeof fetch },
    })
    const result = await client.noRead()
    expect(result).toMatchObject({ kind: "success" })
    const success = result as TreatySuccessResult
    expect(success.data).toBeNull()
  })
})

describe("createTreatyClient (route tree) — proxy edge cases", () => {
  test("get trap ignores Symbol keys and then (non-promise shape)", () => {
    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes: {
        seg: {
          get: {
            method: "get",
            path: () => "/s",
          },
        },
      },
    })
    const sym = Symbol("meta")
    expect((client as Record<symbol, unknown>)[sym]).toBeUndefined()
    const branch = client.seg as { then?: unknown }
    expect(branch.then).toBeUndefined()
  })
})

describe("createTreatyClient (operations) — validation", () => {
  test("throws when operationMetadata omits an operations entry", () => {
    expect(() =>
      createTreatyClient({
        baseUrl: "https://api.test.com",
        operations: {
          only: {
            method: "get" as const,
            path: () => "/",
            response: z.null(),
          },
        },
        operationMetadata: {},
      } as never)
    ).toThrow('Missing operationMetadata for "only"')
  })
})

describe("unwrap", () => {
  test("returns data on success and throws on other kinds", () => {
    const ok: TreatyResult<number> = {
      kind: "success",
      status: 200,
      data: 7,
      response: {} as Response,
      headers: new Headers(),
    }
    expect(unwrap(ok)).toBe(7)
    expect(() =>
      unwrap({
        kind: "error",
        specStatus: 400,
        status: 400,
        error: {},
        response: {} as Response,
        headers: new Headers(),
      } as TreatyResult)
    ).toThrow("Treaty unwrap failed: error")
    expect(() =>
      unwrap({
        kind: "unexpectedError",
        subtype: "parse",
        status: 500,
        error: new Error("x"),
        rawBody: "",
        response: {} as Response,
        headers: new Headers(),
      } as never)
    ).toThrow("Treaty unwrap failed: unexpectedError")
  })
})
