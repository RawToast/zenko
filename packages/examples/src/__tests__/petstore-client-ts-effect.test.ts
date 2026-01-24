import { Buffer } from "node:buffer"
import { describe, expect, it } from "bun:test"
import { HttpClient, HttpClientResponse } from "@effect/platform"
import type { HttpClientRequest } from "@effect/platform/HttpClientRequest"
import * as Headers from "@effect/platform/Headers"
import * as HttpBody from "@effect/platform/HttpBody"
import { Effect } from "effect"
import * as Option from "effect/Option"
import { PetstoreClientTsEffect } from "~/petstore-client-ts-effect"

describe("PetstoreClientTsEffect", () => {
  const origin = "https://api.test.com"

  it("listPets without parameters", async () => {
    const mockPets = [
      { id: 1, name: "Fluffy", tag: "cat" },
      { id: 2, name: "Rex", tag: "dog" },
    ]
    const tracker = createHttpClientTracker(
      () => new Response(JSON.stringify(mockPets))
    )
    const client = new PetstoreClientTsEffect(origin)

    const result = await tracker.run(client.listPets())

    expect(result).toEqual(mockPets)
    const request = tracker.lastRequest()
    expect(request?.url).toBe(`${origin}/pets`)
    expect(request?.method).toBe("GET")
  })

  it("listPets with limit parameter", async () => {
    const mockPets = [{ id: 1, name: "Fluffy", tag: "cat" }]
    const tracker = createHttpClientTracker(
      () => new Response(JSON.stringify(mockPets))
    )
    const client = new PetstoreClientTsEffect(origin)

    const result = await tracker.run(client.listPets(10))

    expect(result).toEqual(mockPets)
    const request = tracker.lastRequest()
    expect(request?.url).toBe(`${origin}/pets?limit=10`)
  })

  it("handles API errors", () => {
    const tracker = createHttpClientTracker(
      () =>
        new Response(JSON.stringify({ code: 400, message: "Bad Request" }), {
          status: 400,
        })
    )
    const client = new PetstoreClientTsEffect(origin)

    expect(tracker.run(client.listPets())).rejects.toThrow(
      "API Error: Bad Request (400)"
    )
  })

  it("handles HTTP errors without JSON body", () => {
    const tracker = createHttpClientTracker(
      () =>
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        })
    )
    const client = new PetstoreClientTsEffect(origin)

    expect(tracker.run(client.listPets())).rejects.toThrow("HTTP Error: 500")
  })

  it("createPets sends JSON payload", async () => {
    const tracker = createHttpClientTracker(
      () => new Response(null, { status: 201 })
    )
    const client = new PetstoreClientTsEffect(origin)
    const newPet = { name: "Buddy", tag: "dog" }

    await tracker.run(client.createPets(newPet))

    const request = tracker.lastRequest()
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe(`${origin}/pets`)
    const contentType = Headers.get(request!.headers, "content-type")
    expect(Option.getOrElse(contentType, () => "").toLowerCase()).toBe(
      "application/json"
    )
    expect(readBody(request?.body)).toBe(JSON.stringify(newPet))
  })

  it("createPets surfaces API errors", () => {
    const tracker = createHttpClientTracker(
      () =>
        new Response(
          JSON.stringify({ code: 422, message: "Unprocessable Entity" }),
          { status: 422 }
        )
    )
    const client = new PetstoreClientTsEffect(origin)

    expect(
      tracker.run(client.createPets({ name: "Buddy", tag: "dog" }))
    ).rejects.toThrow("API Error: Unprocessable Entity (422)")
  })

  it("showPetById returns the requested pet", async () => {
    const mockPet = { id: 1, name: "Fluffy", tag: "cat" }
    const tracker = createHttpClientTracker(
      () => new Response(JSON.stringify(mockPet))
    )
    const client = new PetstoreClientTsEffect(origin)

    const result = await tracker.run(client.showPetById("1"))

    expect(result).toEqual(mockPet)
    const request = tracker.lastRequest()
    expect(request?.url).toBe(`${origin}/pets/1`)
  })

  it("showPetById surfaces errors", () => {
    const tracker = createHttpClientTracker(
      () =>
        new Response(JSON.stringify({ code: 404, message: "Not Found" }), {
          status: 404,
        })
    )
    const client = new PetstoreClientTsEffect(origin)

    expect(tracker.run(client.showPetById("999"))).rejects.toThrow(
      "API Error: Not Found (404)"
    )
  })
})

function createHttpClientTracker(
  responder: (req: HttpClientRequest) => Response
) {
  let lastRequest: HttpClientRequest | undefined
  const httpClient = HttpClient.make((req) => {
    lastRequest = req
    return Effect.succeed(HttpClientResponse.fromWeb(req, responder(req)))
  })

  return {
    run: <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
      effect.pipe(
        Effect.provideService(HttpClient.HttpClient, httpClient),
        Effect.runPromise
      ),
    lastRequest: () => lastRequest,
  }
}

function readBody(body?: HttpBody.HttpBody) {
  if (!body) {
    return undefined
  }

  if (body._tag === "Uint8Array") {
    return Buffer.from(body.body).toString()
  }

  return undefined
}
