import { describe, expect, it } from "bun:test"
import { PetstoreClientAxios } from "../petstore-client-axios"

describe("PetstoreClientAxios", () => {
  const origin = "https://api.test.com"

  it("listPets without parameters", async () => {
    const mockPets = [
      { id: 1, name: "Fluffy", tag: "cat" },
      { id: 2, name: "Rex", tag: "dog" },
    ]
    const tracker = createAxiosTracker(() => ({
      status: 200,
      statusText: "OK",
      data: mockPets,
    }))
    const client = new PetstoreClientAxios(origin, tracker.stub)

    const result = await client.listPets()

    expect(result).toEqual(mockPets)
    expect(tracker.calls[0]?.config.url).toBe(`${origin}/pets`)
    expect(tracker.calls[0]?.config.method).toBe(undefined)
    expect(tracker.calls[0]?.config.headers?.["Content-Type"]).toBe(
      "application/json"
    )
  })

  it("listPets with limit parameter", async () => {
    const mockPets = [{ id: 1, name: "Fluffy", tag: "cat" }]
    const tracker = createAxiosTracker(() => ({
      status: 200,
      statusText: "OK",
      data: mockPets,
    }))
    const client = new PetstoreClientAxios(origin, tracker.stub)

    const result = await client.listPets(10)

    expect(result).toEqual(mockPets)
    expect(tracker.calls[0]?.config.url).toBe(`${origin}/pets?limit=10`)
  })

  it("handles API errors with structured payload", async () => {
    const tracker = createAxiosTracker(() => ({
      status: 400,
      statusText: "Bad Request",
      data: { code: 400, message: "Bad Request" },
    }))
    const client = new PetstoreClientAxios(origin, tracker.stub)

    await expect(client.listPets()).rejects.toThrow(
      "API Error: Bad Request (400)"
    )
  })

  it("handles HTTP errors without proper error format", async () => {
    const tracker = createAxiosTracker(() => ({
      status: 500,
      statusText: "Internal Server Error",
      data: "Internal Server Error",
    }))
    const client = new PetstoreClientAxios(origin, tracker.stub)

    await expect(client.listPets()).rejects.toThrow(
      "HTTP Error: 500 Internal Server Error"
    )
  })

  it("createPets posts JSON payload", async () => {
    const tracker = createAxiosTracker(() => ({
      status: 201,
      statusText: "Created",
      data: "",
    }))
    const client = new PetstoreClientAxios(origin, tracker.stub)
    const newPet = { name: "Buddy", tag: "dog" }

    await client.createPets(newPet)

    expect(tracker.calls[0]?.config.url).toBe(`${origin}/pets`)
    expect(tracker.calls[0]?.config.method).toBe("post")
    expect(tracker.calls[0]?.config.data).toEqual(newPet)
  })

  it("createPets surfaces API errors", async () => {
    const tracker = createAxiosTracker(() => ({
      status: 422,
      statusText: "Unprocessable Entity",
      data: { code: 422, message: "Unprocessable Entity" },
    }))
    const client = new PetstoreClientAxios(origin, tracker.stub)

    await expect(
      client.createPets({ name: "Buddy", tag: "dog" })
    ).rejects.toThrow("API Error: Unprocessable Entity (422)")
  })

  it("showPetById returns the expected pet", async () => {
    const mockPet = { id: 1, name: "Fluffy", tag: "cat" }
    const tracker = createAxiosTracker(() => ({
      status: 200,
      statusText: "OK",
      data: mockPet,
    }))
    const client = new PetstoreClientAxios(origin, tracker.stub)

    const result = await client.showPetById("1")

    expect(result).toEqual(mockPet)
    expect(tracker.calls[0]?.config.url).toBe(`${origin}/pets/1`)
  })

  it("showPetById surfaces not found errors", async () => {
    const tracker = createAxiosTracker(() => ({
      status: 404,
      statusText: "Not Found",
      data: { code: 404, message: "Not Found" },
    }))
    const client = new PetstoreClientAxios(origin, tracker.stub)

    await expect(client.showPetById("999")).rejects.toThrow(
      "API Error: Not Found (404)"
    )
  })
})

type AxiosLike = { request: (config: Record<string, any>) => Promise<any> }

type RequestCall = {
  config: Record<string, any>
}

type MockResponse = {
  status: number
  statusText: string
  data: unknown
}

function createAxiosTracker(responder: (call: RequestCall) => MockResponse) {
  const calls: RequestCall[] = []

  const stub: AxiosLike = {
    request: async (config) => {
      calls.push({ config })
      return responder({ config })
    },
  }

  return { calls, stub: stub as any }
}
