import { afterEach, describe, expect, it, mock } from "bun:test"
import { createClient } from "~/schema/train-travel.treaty.gen"

describe("TrainTravel treaty client (fetch)", () => {
  const origin = "https://api.test.com"
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("lists stations without query and returns a success envelope", async () => {
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
    const result = await client.stations.get()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/stations`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()
    expect(result.data).toMatchObject(mockPayload)
    expect(result.status).toBe(200)
  })

  it("appends query params for GET via treaty options", async () => {
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
    const result = await client.stations.get({
      query: { limit: 10, page: 2, country: "DE" },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/stations?limit=10&page=2&country=DE`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.error).toBeNull()
    expect(result.data).toEqual(mockPayload)
  })

  it("returns an error envelope for non-OK responses", async () => {
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
    const result = await client.stations.get()

    expect(result.data).toBeNull()
    expect(result.error).toEqual({ status: 429, body: errorBody })
    expect(result.status).toBe(429)
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
