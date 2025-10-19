import { describe, it, expect, afterEach, mock } from "bun:test"
import { PetstoreClient } from "../petstore-client"

describe("PetstoreClient", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe("listPets", () => {
    it("should call the correct endpoint without parameters", async () => {
      const fetchMock = setupFetchMock()
      const client = new PetstoreClient("https://api.test.com")

      const mockPets = [
        { id: 1, name: "Fluffy", tag: "cat" },
        { id: 2, name: "Rex", tag: "dog" },
      ]

      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPets),
        headers: new Headers(),
      } as Response

      fetchMock.mockResolvedValue(mockResponse)

      const result = await client.listPets()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/pets",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )

      // The test passes if we get the expected result
      expect(result).toEqual(mockPets)
    })

    it("should call the correct endpoint with limit parameter", async () => {
      const mockPets = [{ id: 1, name: "Fluffy", tag: "cat" }]
      const fetchMock = setupFetchMock()
      const client = new PetstoreClient("https://api.test.com")

      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPets),
        headers: new Headers(),
      } as Response

      fetchMock.mockResolvedValue(mockResponse)

      const result = await client.listPets(10)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/pets?limit=10",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )

      expect(result).toEqual(mockPets)
    })

    it("should handle API errors", async () => {
      const fetchMock = setupFetchMock()
      const client = new PetstoreClient("https://api.test.com")

      const mockResponse = {
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: 400, message: "Bad Request" }),
        headers: new Headers(),
      } as Response

      fetchMock.mockResolvedValue(mockResponse)

      expect(client.listPets()).rejects.toThrow("API Error: Bad Request (400)")

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/pets",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
    })

    it("should handle HTTP errors without proper error format", async () => {
      const fetchMock = setupFetchMock()
      const client = new PetstoreClient("https://api.test.com")

      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.reject(new Error("Invalid JSON")),
        headers: new Headers(),
      } as Response

      fetchMock.mockResolvedValue(mockResponse)

      expect(client.listPets()).rejects.toThrow(
        "HTTP Error: 500 Internal Server Error"
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/pets",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
    })
  })

  describe("createPets", () => {
    it("should create a pet with correct endpoint and data", async () => {
      const fetchMock = setupFetchMock()
      const client = new PetstoreClient("https://api.test.com")

      const newPet = { name: "Buddy", tag: "dog" }

      const mockResponse = {
        ok: true,
        status: 201,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      } as Response

      fetchMock.mockResolvedValue(mockResponse)

      // Should not throw
      await client.createPets(newPet)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/pets",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
    })

    it("should handle creation errors", async () => {
      const fetchMock = setupFetchMock()
      const client = new PetstoreClient("https://api.test.com")

      const newPet = { name: "Buddy", tag: "dog" }

      const mockResponse = {
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({ code: 422, message: "Unprocessable Entity" }),
        headers: new Headers(),
      } as Response

      fetchMock.mockResolvedValue(mockResponse)

      expect(client.createPets(newPet)).rejects.toThrow(
        "API Error: Unprocessable Entity (422)"
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/pets",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
    })
  })

  describe("showPetById", () => {
    it("should get a pet by ID", async () => {
      const mockPet = { id: 1, name: "Fluffy", tag: "cat" }
      const fetchMock = setupFetchMock()
      const client = new PetstoreClient("https://api.test.com")

      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPet),
        headers: new Headers(),
      } as Response

      fetchMock.mockResolvedValue(mockResponse)

      const result = await client.showPetById("1")

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/pets/1",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )

      expect(result).toEqual(mockPet)
    })

    it("should handle not found errors", async () => {
      const fetchMock = setupFetchMock()
      const client = new PetstoreClient("https://api.test.com")

      const mockResponse = {
        ok: false,
        status: 404,
        json: () => Promise.resolve({ code: 404, message: "Not Found" }),
        headers: new Headers(),
      } as Response

      fetchMock.mockResolvedValue(mockResponse)

      expect(client.showPetById("999")).rejects.toThrow(
        "API Error: Not Found (404)"
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/pets/999",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
    })
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
