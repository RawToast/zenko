import { describe, it, expect, afterEach, mock } from "bun:test"
import { EnumDemoClientFetch } from "../enum-demo-client-fetch"

describe("EnumDemoClientFetch", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe("listProducts", () => {
    it("should list products with known ProductStatus enum values", async () => {
      const fetchMock = setupFetchMock()
      const client = new EnumDemoClientFetch("https://api.test.com")

      const mockProducts = [
        {
          id: "1",
          name: "Laptop",
          status: "available" as const,
          category: "electronics" as const,
          price: 999.99,
        },
        {
          id: "2",
          name: "Novel",
          status: "discontinued" as const,
          category: "books" as const,
        },
      ]

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockProducts)))

      const result = await client.listProducts()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/products",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )

      expect(result[0].status).toBe("available")
      expect(result[1].status).toBe("discontinued")
    })

    it("should accept unknown ProductStatus values (open enum)", async () => {
      const fetchMock = setupFetchMock()
      const client = new EnumDemoClientFetch("https://api.test.com")

      // Server returns a future/unknown status value
      const mockProducts = [
        {
          id: "1",
          name: "Future Product",
          status: "pre_order", // This is NOT in the enum definition
          category: "electronics",
        },
      ]

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockProducts)))

      const result = await client.listProducts()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("1")
      expect(result[0].name).toBe("Future Product")
      // Open enum transforms unknown values to "Unknown:${value}"
      expect(result[0].status).toBe("Unknown:pre_order")
      expect(result[0].category).toBe("electronics")
    })

    it("should reject unknown Category values (closed enum)", async () => {
      const fetchMock = setupFetchMock()
      const client = new EnumDemoClientFetch("https://api.test.com")

      // Server returns an unknown category
      const mockProducts = [
        {
          id: "1",
          name: "Product",
          status: "available",
          category: "furniture", // NOT in the closed enum
        },
      ]

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockProducts)))

      // Should throw because Category is a closed enum
      await expect(client.listProducts()).rejects.toThrow()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("should filter by ProductStatus", async () => {
      const fetchMock = setupFetchMock()
      const client = new EnumDemoClientFetch("https://api.test.com")

      const mockProducts = [
        {
          id: "1",
          name: "Available Product",
          status: "available" as const,
          category: "electronics" as const,
        },
      ]

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockProducts)))

      const result = await client.listProducts({ status: "available" })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/products?status=available",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )

      expect(result[0].status).toBe("available")
    })

    it("should filter by both status and category", async () => {
      const fetchMock = setupFetchMock()
      const client = new EnumDemoClientFetch("https://api.test.com")

      const mockProducts = [
        {
          id: "1",
          name: "Book",
          status: "coming_soon" as const,
          category: "books" as const,
        },
      ]

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockProducts)))

      const result = await client.listProducts({
        status: "coming_soon",
        category: "books",
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/products?status=coming_soon&category=books",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )

      expect(result[0].status).toBe("coming_soon")
    })
  })

  describe("createProduct", () => {
    it("should create a product with known enum values", async () => {
      const fetchMock = setupFetchMock()
      const client = new EnumDemoClientFetch("https://api.test.com")

      const newProduct = {
        name: "New Laptop",
        status: "available" as const,
        category: "electronics" as const,
        price: 1299.99,
      }

      const createdProduct = {
        id: "123",
        ...newProduct,
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(createdProduct)))

      const result = await client.createProduct(newProduct)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/products",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(newProduct),
          headers: {
            "Content-Type": "application/json",
          },
        })
      )

      expect(result).toEqual(createdProduct)
    })

    it("should handle server returning unknown ProductStatus (open enum)", async () => {
      const fetchMock = setupFetchMock()
      const client = new EnumDemoClientFetch("https://api.test.com")

      const newProduct = {
        name: "New Product",
        status: "available" as const,
        category: "electronics" as const,
      }

      // Server returns product with a new status
      const createdProduct = {
        id: "123",
        name: "New Product",
        status: "pending_review", // Unknown status from server
        category: "electronics",
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(createdProduct)))

      const result = await client.createProduct(newProduct)

      expect(result.id).toBe("123")
      expect(result.name).toBe("New Product")
      // Open enum transforms unknown value
      expect(result.status).toBe("Unknown:pending_review")
      expect(result.category).toBe("electronics")
    })

    it("should handle API errors", async () => {
      const fetchMock = setupFetchMock()
      const client = new EnumDemoClientFetch("https://api.test.com")

      const newProduct = {
        name: "Invalid Product",
        status: "available" as const,
        category: "electronics" as const,
      }

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ code: 400, message: "Invalid product data" }),
          {
            status: 400,
          }
        )
      )

      await expect(client.createProduct(newProduct)).rejects.toThrow(
        "API Error: Invalid product data (400)"
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
