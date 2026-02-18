import { describe, test, expect, afterEach, mock } from "bun:test"
import { TicTacToeClientFetch } from "~/tictactoe-client-fetch"

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

const originalFetch = global.fetch

describe("TicTacToeClientFetch", () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  test("includes bearer token in Authorization header", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      bearerToken: "my-jwt-token",
    })

    const mockBoard = {
      winner: ".",
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBoard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.getBoard()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-jwt-token",
        }),
      })
    )
  })

  test("includes API key in custom header", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      apiKey: "test-api-key",
    })

    const mockBoard = {
      winner: ".",
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBoard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.getBoard()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board",
      expect.objectContaining({
        headers: expect.objectContaining({
          "api-key": "test-api-key",
        }),
      })
    )
  })

  test("sends both bearer token and API key when both are set", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      bearerToken: "jwt-token",
      apiKey: "api-key-value",
    })

    const mockBoard = {
      winner: ".",
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBoard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.getBoard()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.com/board",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
          "api-key": "api-key-value",
        }),
      })
    )
  })

  test("setBearerToken updates the token for subsequent requests", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com")

    const mockMark = "X"

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockMark), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    client.setBearerToken("new-token")
    await client.getSquare("1", "1")

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/board/1/1"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-token",
        }),
      })
    )
  })

  test("handles API error responses", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      bearerToken: "token",
    })

    fetchMock.mockResolvedValue(
      new Response("Illegal coordinates", {
        status: 400,
        statusText: "Bad Request",
      })
    )

    expect(client.getSquare("5", "5")).rejects.toThrow("API Error")
  })

  test("makes request without auth when no credentials set", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com")

    const mockBoard = {
      winner: ".",
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockBoard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.getBoard()

    const callHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit)
      ?.headers as Record<string, string>
    expect(callHeaders).not.toHaveProperty("Authorization")
    expect(callHeaders).not.toHaveProperty("api-key")
  })

  test("putSquare sends mark in request body", async () => {
    const fetchMock = setupFetchMock()
    const client = new TicTacToeClientFetch("https://api.test.com", {
      bearerToken: "token",
    })

    const mockStatus = {
      winner: ".",
      board: [
        ["X", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockStatus), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    await client.putSquare("1", "1", "X")

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/board/1/1"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify("X"),
      })
    )
  })
})
