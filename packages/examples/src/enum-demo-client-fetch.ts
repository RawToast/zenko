import {
  paths,
  Product,
  CreateProductRequest,
  ProductStatus,
  Category,
  Error as ErrorSchema,
} from "./schema/enum-demo.gen"

type ZodSchema<T = any> = { parse: (json: unknown) => T }

export class EnumDemoClientFetch {
  private baseUrl: string

  constructor(baseUrl: string = "http://api.example.com/v1") {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    options?: Omit<RequestInit, "headers"> & {
      headers?: Record<string, string>
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const { headers: optHeaders, ...restOptions } = options || {}
    const response = await fetch(url, {
      ...restOptions,
      headers: {
        "Content-Type": "application/json",
        ...optHeaders,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const error = ErrorSchema.safeParse(errorData)
      if (error.success) {
        throw new Error(`API Error: ${error.data.message} (${error.data.code})`)
      }
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    return responseSchema.parse(json)
  }

  async listProducts(filters?: {
    status?: ProductStatus
    category?: Category
  }): Promise<Product[]> {
    const path = paths.listProducts(filters)
    return this.request(path, ProductSchema)
  }

  async createProduct(productData: CreateProductRequest): Promise<Product> {
    const path = paths.createProduct()
    return this.request(path, Product, {
      method: "POST",
      body: JSON.stringify(productData),
    })
  }
}

// Re-export the array schema for the list response
const ProductSchema = {
  parse: (json: unknown) => {
    const result = Product.array().parse(json)
    return result
  },
}
