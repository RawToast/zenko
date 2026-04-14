import { afterEach, describe, expect, it, mock } from "bun:test"
import { TreatyErrorResult, TreatySuccess } from "zenko/treaty"
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
    const result = await client.getStations()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/stations`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.kind).toBe("success")
    const success = result as TreatySuccess<number, typeof mockPayload>
    expect(success.data).toBeDefined()
    expect(success.data).toMatchObject(mockPayload)
    expect(success.status).toBe(200)
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
    const result = await client.getStations({
      query: { limit: 10, page: 2, country: "DE" },
    })

    const callUrl = fetchMock.mock.calls[0]?.[0] as string
    expect(callUrl.startsWith(`${origin}/stations?`)).toBe(true)
    expect(callUrl).toContain("limit=10")
    expect(callUrl).toContain("page=2")
    expect(callUrl).toContain("country=DE")
    expect(fetchMock).toHaveBeenCalledWith(
      callUrl,
      expect.objectContaining({ method: "GET" })
    )

    expect(result.kind).toBe("success")
    const success = result as TreatySuccess<number, typeof mockPayload>
    expect(success.data).toEqual(mockPayload)
    expect(success.status).toBe(200)
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
    const result = await client.getStations()

    expect(result.kind).toBe("error")

    const http = result as TreatyErrorResult<number, typeof errorBody>

    expect(http.error).toEqual(errorBody)
    expect(http.status).toBe(429)
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
