import { afterEach, describe, expect, it, mock } from "bun:test"
import { createClient } from "~/schema/train-travel.treaty.gen"

describe("TrainTravel treaty client (fetch)", () => {
  const origin = "https://api.test.com"
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("lists stations without query and returns success", async () => {
    const fetchMock = setupFetchMock()
    const mockPayload = {
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "Central",
          address: "1 Main St",
          country_code: "US",
          timezone: "America/New_York",
        },
      ],
      links: { self: "https://api.example.com/stations" },
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.getStations()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/stations`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toMatchObject(mockPayload)
      expect(result.status).toBe(200)
    }
  })

  it("appends query params for GET via treaty request", async () => {
    const fetchMock = setupFetchMock()
    const mockPayload = { data: [], links: {} }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.getStations({
      query: { limit: 10, page: 2, country: "DE" },
    })

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string
    const u = new URL(calledUrl)
    expect(u.pathname).toBe("/stations")
    expect(u.searchParams.get("limit")).toBe("10")
    expect(u.searchParams.get("page")).toBe("2")
    expect(u.searchParams.get("country")).toBe("DE")
    expect(fetchMock).toHaveBeenCalledWith(
      calledUrl,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toEqual(mockPayload)
    }
  })

  it("returns http branch for non-OK responses", async () => {
    const fetchMock = setupFetchMock()
    const errorBody = { message: "Too many requests" }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(errorBody), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.getStations()

    expect(result.kind).toBe("http")
    if (result.kind === "http") {
      expect(result.status).toBe(429)
      expect(result.specStatus).toBe(429)
    }
  })

  it("supports nested $routes alias", async () => {
    const fetchMock = setupFetchMock()
    const mockPayload = { data: [], links: {} }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.$routes.stations.get()
    expect(result.kind).toBe("success")
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
