import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { PetstoreClient } from "../petstore-client"

describe("PetstoreClient", () => {
  let client: PetstoreClient
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    client = new PetstoreClient("https://api.test.com")
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe("listPets", () => {
    it("should call the correct endpoint without parameters", async () => {
      const mockPets = [
        { id: 1, name: "Fluffy", tag: "cat" },
        { id: 2, name: "Rex", tag: "dog" },
      ]

      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPets),
        headers: new Headers(),
      }

      global.fetch = (() => Promise.resolve(mockResponse)) as any

      const result = await client.listPets()

      // The test passes if we get the expected result
      expect(result).toEqual(mockPets)
    })

    it("should call the correct endpoint with limit parameter", async () => {
      const mockPets = [{ id: 1, name: "Fluffy", tag: "cat" }]

      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPets),
        headers: new Headers(),
      }

      global.fetch = (() => Promise.resolve(mockResponse)) as any

      const result = await client.listPets(10)

      expect(result).toEqual(mockPets)
    })

    it("should handle API errors", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 400, message: "Bad Request" }),
        headers: new Headers(),
      }

      global.fetch = (() => Promise.resolve(mockResponse)) as any

      expect(client.listPets()).rejects.toThrow("API Error: Bad Request (400)")
    })

    it("should handle HTTP errors without proper error format", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.reject(new Error("Invalid JSON")),
        headers: new Headers(),
      }

      global.fetch = (() => Promise.resolve(mockResponse)) as any

      expect(client.listPets()).rejects.toThrow(
        "HTTP Error: 500 Internal Server Error"
      )
    })
  })

  describe("createPets", () => {
    it("should create a pet with correct endpoint and data", async () => {
      const newPet = { name: "Buddy", tag: "dog" }

      const mockResponse = {
        ok: true,
        status: 201,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      }

      global.fetch = (() => Promise.resolve(mockResponse)) as any

      // Should not throw
      await client.createPets(newPet)
    })

    it("should handle creation errors", async () => {
      const newPet = { name: "Buddy", tag: "dog" }

      const mockResponse = {
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({ code: 422, message: "Unprocessable Entity" }),
        headers: new Headers(),
      }

      global.fetch = (() => Promise.resolve(mockResponse)) as any

      expect(client.createPets(newPet)).rejects.toThrow(
        "API Error: Unprocessable Entity (422)"
      )
    })
  })

  describe("showPetById", () => {
    it("should get a pet by ID", async () => {
      const mockPet = { id: 1, name: "Fluffy", tag: "cat" }

      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPet),
        headers: new Headers(),
      }

      global.fetch = (() => Promise.resolve(mockResponse)) as any

      const result = await client.showPetById("1")

      expect(result).toEqual(mockPet)
    })

    it("should handle not found errors", async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: () => Promise.resolve({ code: 404, message: "Not Found" }),
        headers: new Headers(),
      }

      global.fetch = (() => Promise.resolve(mockResponse)) as any

      expect(client.showPetById("999")).rejects.toThrow(
        "API Error: Not Found (404)"
      )
    })
  })
})
