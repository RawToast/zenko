import { describe, test, expect, mock, afterEach } from "bun:test"
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

const originalFetch = global.fetch

describe("createTreatyClient", () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  test("calls GET leaves and returns a success envelope", async () => {
    const fetchMock = mock<typeof fetch>()
    global.fetch = fetchMock as unknown as typeof fetch

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ winner: "." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
    })
    const result = await client.board.get()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board",
      expect.objectContaining({ method: "GET" })
    )
    expect(result.error).toBeNull()
    expect(result.data).toEqual({ winner: "." })
  })

  test("walks dynamic segments and sends JSON bodies", async () => {
    const fetchMock = mock<typeof fetch>()
    global.fetch = fetchMock as unknown as typeof fetch

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createTreatyClient({
      baseUrl: "https://api.test.com",
      routes,
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
})
