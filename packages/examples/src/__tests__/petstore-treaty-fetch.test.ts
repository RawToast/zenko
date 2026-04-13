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
    const result = await client.listPets()

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toEqual(mockPets)
      expect(result.status).toBe(200)
    }
  })

  it("appends query params for listPets via treaty request", async () => {
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

    const result = await client.listPets({ query: { limit: 10 } })

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets?limit=10`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toEqual(mockPets)
    }
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
    const result = await client.createPets({ body: payload })

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    )
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.status).toBe(201)
    }
  })

  it("fetches a pet by id via path params", async () => {
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
    const result = await client.showPetById({ params: { petId: "42" } })

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets/42`,
      expect.objectContaining({ method: "GET" })
    )
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toEqual(mockPet)
    }
  })

  it("returns http branch for non-OK responses with typed error body", async () => {
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
    const result = await client.showPetById({ params: { petId: "missing" } })

    expect(result.kind).toBe("http")
    if (result.kind === "http") {
      expect(result.specStatus).toBe("default")
      expect(result.error).toEqual(errorBody)
      expect(result.status).toBe(404)
    }
  })

  it("passes headers and RequestInit without changing the body contract", async () => {
    const fetchMock = setupFetchMock()
    const payload = { id: 9, name: "Mimi", tag: "cat" }
    const controller = new AbortController()

    fetchMock.mockResolvedValue(
      new Response("", {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    await client.createPets({
      body: payload,
      headers: { authorization: "Bearer test" },
      init: { signal: controller.signal },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/pets`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
        signal: controller.signal,
        headers: expect.any(Headers),
      })
    )
    const call = fetchMock.mock.calls[0]
    const headers = call?.[1]?.headers as Headers
    expect(headers?.get("authorization")).toBe("Bearer test")
  })

  it("supports legacy nested $routes alias", async () => {
    const fetchMock = setupFetchMock()
    const mockPet = { id: 1, name: "A", tag: "cat" }
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPet), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.$routes.pets({ petId: "1" }).get()
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toEqual(mockPet)
    }
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

const _client = createClient("http://petstore.swagger.io/v1", {
  fetch: mock<typeof fetch>() as unknown as typeof fetch,
})
