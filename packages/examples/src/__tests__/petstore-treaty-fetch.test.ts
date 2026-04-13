import { afterEach, describe, expect, it, mock } from "bun:test"
import { createClient } from "~/schema/petstore.treaty.gen"

describe("Petstore treaty client (fetch)", () => {
  const origin = "https://api.test.com"
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("lists pets without query", async () => {
    const fetchMock = setupFetchMock()
    const mockPets = [{ id: 1, name: "Fluffy", tag: "cat" }]

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPets), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.pets.get()

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.error).toBeNull()
    expect(result.data).toEqual(mockPets)
    expect(result.status).toBe(200)
  })

  it("appends query params for listPets via treaty options", async () => {
    const fetchMock = setupFetchMock()
    const mockPets: { id: number; name: string; tag?: string }[] = []

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPets), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })

    const result = await client.pets.get({ query: { limit: 10 } })

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets?limit=10`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.error).toBeNull()
    expect(result.data).toEqual(mockPets)
  })

  it("creates a pet with POST JSON body", async () => {
    const fetchMock = setupFetchMock()
    const payload = { id: 3, name: "Neko", tag: "cat" }

    fetchMock.mockResolvedValue(
      new Response("", {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.pets.post(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    )
    expect(result.error).toBeNull()
    expect(result.status).toBe(201)
  })

  it("fetches a pet by id via dynamic segment", async () => {
    const fetchMock = setupFetchMock()
    const mockPet = { id: 42, name: "Spot", tag: "dog" }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPet), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.pets({ petId: "42" }).get()

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets/42`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.error).toBeNull()
    expect(result.data).toEqual(mockPet)
  })

  it("returns an error envelope for non-OK responses", async () => {
    const fetchMock = setupFetchMock()
    const errorBody = { code: 404, message: "Not found" }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(errorBody), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.pets({ petId: "missing" }).get()

    expect(result.data).toBeNull()
    expect(result.error).toEqual({ status: 404, body: errorBody })
    expect(result.status).toBe(404)
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

// example of oddness
const client = createClient("http://petstore.swagger.io/v1", {
  fetch: mock<typeof fetch>() as unknown as typeof fetch,
})
