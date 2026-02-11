import { describe, expect, it } from "bun:test"
import { PetstoreClientUndici } from "~/petstore-client-undici"

describe("PetstoreClientUndici", () => {
  const origin = "https://api.test.com"

  it("listPets without parameters", async () => {
    const mockPets = [
      { id: 1, name: "Fluffy", tag: "cat" },
      { id: 2, name: "Rex", tag: "dog" },
    ]
    const tracker = createRequestTracker(() => ({
      statusCode: 200,
      body: mockPets,
    }))
    const client = new PetstoreClientUndici(origin, undefined, tracker.stub)

    const result = await client.listPets()

    expect(result).toEqual(mockPets)
    expect(tracker.calls[0]?.url).toBe(`${origin}/pets`)
    const headers = tracker.calls[0]?.options.headers
    expect(
      headers && typeof headers === "object" && !Array.isArray(headers)
        ? (headers as Record<string, string>)["content-type"]
        : undefined
    ).toBe("application/json")
  })

  it("listPets with limit parameter", async () => {
    const mockPets = [{ id: 1, name: "Fluffy", tag: "cat" }]
    const tracker = createRequestTracker(() => ({
      statusCode: 200,
      body: mockPets,
    }))
    const client = new PetstoreClientUndici(origin, undefined, tracker.stub)

    const result = await client.listPets(10)

    expect(result).toEqual(mockPets)
    expect(tracker.calls[0]?.url).toBe(`${origin}/pets?limit=10`)
  })

  it("handles API errors with structured payload", () => {
    const tracker = createRequestTracker(() => ({
      statusCode: 400,
      body: { code: 400, message: "Bad Request" },
    }))
    const client = new PetstoreClientUndici(origin, undefined, tracker.stub)

    expect(client.listPets()).rejects.toThrow("API Error: Bad Request (400)")
  })

  it("handles HTTP errors without JSON payload", () => {
    const tracker = createRequestTracker(() => ({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      jsonError: new Error("not json"),
    }))
    const client = new PetstoreClientUndici(origin, undefined, tracker.stub)

    expect(client.listPets()).rejects.toThrow("HTTP Error: 500")
  })

  it("createPets posts JSON payload", async () => {
    const tracker = createRequestTracker(() => ({
      statusCode: 201,
    }))
    const client = new PetstoreClientUndici(origin, undefined, tracker.stub)
    const newPet = { name: "Buddy", tag: "dog" }

    await client.createPets(newPet)

    expect(tracker.calls[0]?.options.method).toBe("POST")
    expect(tracker.calls[0]?.options.body).toBe(JSON.stringify(newPet))
  })

  it("createPets surfaces API errors", () => {
    const tracker = createRequestTracker(() => ({
      statusCode: 422,
      body: { code: 422, message: "Unprocessable Entity" },
    }))
    const client = new PetstoreClientUndici(origin, undefined, tracker.stub)

    expect(client.createPets({ name: "Buddy", tag: "dog" })).rejects.toThrow(
      "API Error: Unprocessable Entity (422)"
    )
  })

  it("showPetById returns the expected pet", async () => {
    const mockPet = { id: 1, name: "Fluffy", tag: "cat" }
    const tracker = createRequestTracker(() => ({
      statusCode: 200,
      body: mockPet,
    }))
    const client = new PetstoreClientUndici(origin, undefined, tracker.stub)

    const result = await client.showPetById("1")

    expect(result).toEqual(mockPet)
    expect(tracker.calls[0]?.url).toBe(`${origin}/pets/1`)
  })

  it("showPetById surfaces not found errors", () => {
    const tracker = createRequestTracker(() => ({
      statusCode: 404,
      body: { code: 404, message: "Not Found" },
    }))
    const client = new PetstoreClientUndici(origin, undefined, tracker.stub)

    expect(client.showPetById("999")).rejects.toThrow(
      "API Error: Not Found (404)"
    )
  })
})

type UndiciRequest = typeof import("undici").request

type RequestCall = {
  url: string | import("url").URL | import("url").UrlObject
  options: NonNullable<Parameters<UndiciRequest>[1]> & { body?: string }
}

type MockResponse = {
  statusCode: number
  statusMessage?: string
  headers?: Record<string, string>
  body?: unknown
  jsonError?: Error
}

function createRequestTracker(responder: (call: RequestCall) => MockResponse) {
  const calls: RequestCall[] = []
  const stub = (async (url, options) => {
    const normalizedOptions = {
      ...options,
    } as RequestCall["options"]
    calls.push({ url, options: normalizedOptions })
    const response = responder({ url, options: normalizedOptions })

    return {
      statusCode: response.statusCode,
      statusText: response.statusMessage ?? "",
      headers: response.headers ?? {},
      body: createBody(
        response.body,
        response.jsonError,
        response.statusMessage
      ),
      trailers: {},
      opaque: null,
      context: {},
    }
  }) as UndiciRequest

  return { calls, stub }
}

function createBody(body: unknown, jsonError?: Error, statusMessage?: string) {
  return {
    async json() {
      if (jsonError) {
        throw jsonError
      }
      return body
    },
    async text() {
      if (body !== undefined) {
        return typeof body === "string" ? body : JSON.stringify(body)
      }
      return statusMessage ?? ""
    },
    resume() {},
  } as any
}
