import type { Dispatcher } from "undici"
import { request } from "undici"
import { paths, Pet, Pets, Error as ErrorSchema } from "./schema/petstore.gen"

type ZodSchema<T = any> = { parse: (json: unknown) => T }

type JsonRequestOptions = Omit<
  NonNullable<Parameters<typeof request>[1]>,
  "body" | "headers" | "dispatcher"
> & {
  body?: unknown
  headers?: Record<string, string>
  dispatcher?: Dispatcher
}

export class PetstoreClientUndici {
  private readonly baseUrl: string
  private readonly dispatcher?: Dispatcher
  private readonly requester: typeof request

  constructor(
    baseUrl: string = "http://petstore.swagger.io/v1",
    dispatcher?: Dispatcher,
    requester: typeof request = request
  ) {
    this.baseUrl = baseUrl
    this.dispatcher = dispatcher
    this.requester = requester
  }

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    options?: JsonRequestOptions
  ): Promise<T>

  private async request(
    path: string,
    responseSchema: undefined,
    options?: JsonRequestOptions
  ): Promise<void>

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T> | undefined,
    options?: JsonRequestOptions
  ): Promise<T | undefined> {
    const url = `${this.baseUrl}${path}`
    const {
      body,
      headers: incomingHeaders,
      dispatcher,
      ...restOptions
    } = options ?? {}

    const serializedBody = body === undefined ? undefined : JSON.stringify(body)

    const headers = {
      "content-type": "application/json",
      ...incomingHeaders,
    }

    const { statusCode, body: responseBody } = await this.requester(url, {
      ...restOptions,
      dispatcher: dispatcher ?? this.dispatcher,
      headers,
      ...(serializedBody !== undefined ? { body: serializedBody } : {}),
    })

    if (statusCode >= 400) {
      const errorData = await responseBody.json().catch(() => undefined)
      const error = ErrorSchema.safeParse(errorData)
      if (error.success) {
        throw new Error(`API Error: ${error.data.message} (${error.data.code})`)
      }
      throw new Error(`HTTP Error: ${statusCode} Unprocessable Entity`)
    }

    if (statusCode === 204 || responseSchema === undefined) {
      responseBody.resume()
      return
    }

    const json = await responseBody.json()
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
      body: pet,
    })
  }

  async showPetById(petId: string): Promise<Pet> {
    const path = paths.showPetById({ petId })
    return this.request(path, Pet)
  }
}
