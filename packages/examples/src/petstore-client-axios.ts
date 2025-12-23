import axios from "axios"
import type { AxiosInstance, Method } from "axios"
import { paths, Pet, Pets, Error as ErrorSchema } from "./schema/petstore.gen"

type ZodSchema<T = any> = { parse: (json: unknown) => T }

type AxiosRequestOptions = {
  method?: Method
  headers?: Record<string, string>
  body?: unknown
}

type AxiosJsonResponse = {
  status: number
  statusText: string
  data: unknown
}

export class PetstoreClientAxios {
  private readonly baseUrl: string
  private readonly requester: AxiosInstance

  constructor(
    baseUrl: string = "http://petstore.swagger.io/v1",
    requester: AxiosInstance = axios
  ) {
    this.baseUrl = baseUrl
    this.requester = requester
  }

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    options?: AxiosRequestOptions
  ): Promise<T>

  private async request(
    path: string,
    responseSchema: undefined,
    options?: AxiosRequestOptions
  ): Promise<void>

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T> | undefined,
    options?: AxiosRequestOptions
  ): Promise<T | undefined> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options?.headers,
    }

    const response = (await this.requester.request({
      url,
      method: options?.method,
      headers,
      data: options?.body,
      validateStatus: () => true,
    })) as unknown as AxiosJsonResponse

    if (response.status >= 400) {
      const errorData = safeJsonData(response.data)
      const error = ErrorSchema.safeParse(errorData)
      if (error.success) {
        throw new Error(`API Error: ${error.data.message} (${error.data.code})`)
      }

      const statusText = response.statusText?.trim() ?? ""
      const statusLabel =
        statusText.length > 0
          ? `${response.status} ${statusText}`
          : `${response.status}`
      throw new Error(`HTTP Error: ${statusLabel}`)
    }

    if (response.status === 204 || responseSchema === undefined) {
      return
    }

    return responseSchema.parse(safeJsonData(response.data))
  }

  async listPets(limit?: number): Promise<Pets> {
    const path = paths.listPets({ limit })
    return this.request(path, Pets)
  }

  async createPets(pet: Omit<Pet, "id">): Promise<void> {
    const path = paths.createPets()
    await this.request(path, undefined, {
      method: "post",
      body: pet,
    })
  }

  async showPetById(petId: string): Promise<Pet> {
    const path = paths.showPetById({ petId })
    return this.request(path, Pet)
  }
}

function safeJsonData(data: unknown): unknown {
  if (typeof data === "string") {
    return safeJsonParse(data)
  }
  return data
}

function safeJsonParse(text: string): unknown {
  if (text.trim().length === 0) {
    return undefined
  }

  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
