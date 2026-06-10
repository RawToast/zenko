import {
  paths,
  Record as RecordSchema,
  RecordListResponse,
  GetRecordError,
  ListRecordsError,
  StatusUpdateRequest,
  UpdateRecordError,
} from "./schema/nullable-allof-errors.gen"

type ZodSchema<T = unknown> = { parse: (json: unknown) => T }
type ErrorSchema = {
  safeParse: (json: unknown) =>
    | {
        success: true
        data: { title: string; code: string }
      }
    | { success: false }
}

export class RecordsClientFetch {
  private baseUrl: string

  constructor(baseUrl: string = "http://api.example.com/v1") {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    errorSchema: ErrorSchema,
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
      const error = errorSchema.safeParse(errorData)
      if (error.success) {
        throw new Error(`API Error: ${error.data.title} (${error.data.code})`)
      }
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    return responseSchema.parse(json)
  }

  async listRecords(filters?: { page?: number }): Promise<RecordListResponse> {
    const path = paths.listRecords(filters)
    return this.request(path, RecordListResponse, ListRecordsError)
  }

  async getRecord(id: string): Promise<RecordSchema> {
    const path = paths.getRecord({ id })
    return this.request(path, RecordSchema, GetRecordError)
  }

  async updateRecordStatus(
    id: string,
    body: StatusUpdateRequest
  ): Promise<RecordSchema> {
    const path = paths.updateRecordStatus({ id })
    return this.request(path, RecordSchema, UpdateRecordError, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  }
}
