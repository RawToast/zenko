import { HttpClient, HttpClientRequest } from "@effect/platform"
import type { HttpClientError } from "@effect/platform/HttpClientError"
import type { HttpBodyError } from "@effect/platform/HttpBody"
import type { HttpMethod } from "@effect/platform/HttpMethod"
import { Effect } from "effect"
import { paths, Pet, Pets, Error as ErrorSchema } from "./schema/petstore.gen"

type ZodSchema<T = any> = { parse: (json: unknown) => T }

type EffectRequestOptions = {
  method?: HttpMethod | string
  headers?: Record<string, string>
  body?: unknown
}

type ApiEffect<T> = Effect.Effect<
  T,
  Error | HttpClientError | HttpBodyError,
  HttpClient.HttpClient
>

export class PetstoreClientTsEffect {
  private readonly baseUrl: string

  constructor(baseUrl: string = "http://petstore.swagger.io/v1") {
    this.baseUrl = baseUrl
  }

  private request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    options?: EffectRequestOptions
  ): ApiEffect<T>

  private request(
    path: string,
    responseSchema: undefined,
    options?: EffectRequestOptions
  ): ApiEffect<void>

  private request<T>(
    path: string,
    responseSchema: ZodSchema<T> | undefined,
    options?: EffectRequestOptions
  ): ApiEffect<T | undefined> {
    const url = `${this.baseUrl}${path}`

    return Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options?.headers,
      }

      const method = (options?.method ?? "GET")
        .toString()
        .toUpperCase() as HttpMethod
      let httpRequest = HttpClientRequest.make(method)(url)
      httpRequest = HttpClientRequest.setHeaders(httpRequest, headers)

      if (options?.body !== undefined) {
        httpRequest = yield* HttpClientRequest.bodyJson(
          httpRequest,
          options.body
        )
      }

      const response = yield* client.execute(httpRequest)

      if (response.status >= 400) {
        const errorData = yield* response.json.pipe(
          Effect.orElseSucceed(() => undefined)
        )
        const error = ErrorSchema.safeParse(errorData)
        if (error.success) {
          return yield* Effect.fail(
            new Error(`API Error: ${error.data.message} (${error.data.code})`)
          )
        }
        const statusText =
          (response as { statusText?: string }).statusText?.trim() ?? ""
        const statusLabel =
          statusText.length > 0
            ? `${response.status} ${statusText}`
            : `${response.status}`
        return yield* Effect.fail(new Error(`HTTP Error: ${statusLabel}`))
      }

      if (response.status === 204 || responseSchema === undefined) {
        return undefined
      }

      const json = yield* response.json
      return responseSchema.parse(json)
    })
  }

  listPets(limit?: number): ApiEffect<Pets> {
    const path = paths.listPets({ limit })
    return this.request(path, Pets)
  }

  createPets(pet: Omit<Pet, "id">): ApiEffect<void> {
    const path = paths.createPets()
    return this.request(path, undefined, {
      method: "POST",
      body: pet,
    })
  }

  showPetById(petId: string): ApiEffect<Pet> {
    const path = paths.showPetById({ petId })
    return this.request(path, Pet)
  }
}
