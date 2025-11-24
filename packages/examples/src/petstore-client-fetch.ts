import { paths, Pet, Pets, Error as ErrorSchema } from "./schema/petstore.gen"

type ZodSchema<T = any> = { parse: (json: unknown) => T }

export class PetstoreClientFetch {
  private baseUrl: string

  constructor(baseUrl: string = "http://petstore.swagger.io/v1") {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    options?: RequestInit
  ): Promise<T>

  private async request(
    path: string,
    responseSchema: undefined,
    options?: RequestInit
  ): Promise<void>

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T> | undefined,
    options?: RequestInit
  ): Promise<T | undefined> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const error = ErrorSchema.safeParse(errorData)
      if (error.success) {
        throw new Error(`API Error: ${error.data.message} (${error.data.code})`)
      }
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    if (response.status === 204) {
      return
    }

    if (responseSchema === undefined) {
      return
    }

    const json = await response.json()
    return responseSchema.parse(json)
  }

  async listPets(limit?: number): Promise<Pets> {
    const path = paths.listPets({ limit })
    return this.request(path, Pets)
  }

  async createPets(pet: Omit<Pet, "id">): Promise<void> {
    const path = paths.createPets()
    await this.request(path, undefined, {
      method: "POST",
      body: JSON.stringify(pet),
    })
  }

  async showPetById(petId: string): Promise<Pet> {
    const path = paths.showPetById({ petId })
    return this.request(path, Pet)
  }
}
