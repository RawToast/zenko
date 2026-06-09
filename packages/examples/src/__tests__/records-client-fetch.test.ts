import { describe, it, expect, afterEach, mock } from "bun:test"
import { RecordsClientFetch } from "~/records-client-fetch"
import {
  ListRecordsError,
  Record as RecordSchema,
} from "~/schema/nullable-allof-errors.gen"

describe("RecordsClientFetch", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe("getRecord", () => {
    it("should parse a record with null nullable fields", async () => {
      const fetchMock = setupFetchMock()
      const client = new RecordsClientFetch("https://api.test.com")

      const mockRecord = {
        id: "rec_123",
        status: "draft" as const,
        notes: null,
        completed_at: null,
        archived_at: null,
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockRecord)))

      const result = await client.getRecord("rec_123")

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/records/rec_123",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
      expect(result.notes).toBeNull()
      expect(result.completed_at).toBeNull()
      expect(result.archived_at).toBeNull()
    })

    it("should parse a record with string nullable fields", async () => {
      const fetchMock = setupFetchMock()
      const client = new RecordsClientFetch("https://api.test.com")

      const mockRecord = {
        id: "rec_456",
        status: "active" as const,
        notes: "Needs review",
        completed_at: "2026-06-01T12:00:00.000Z",
        archived_at: null,
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockRecord)))

      const result = await client.getRecord("rec_456")

      expect(result.notes).toBe("Needs review")
      expect(result.completed_at).toBe("2026-06-01T12:00:00.000Z")
      expect(result.archived_at).toBeNull()
    })
  })

  describe("listRecords", () => {
    it("should parse a paginated list of records", async () => {
      const fetchMock = setupFetchMock()
      const client = new RecordsClientFetch("https://api.test.com")

      const mockResponse = {
        items: [
          {
            id: "rec_1",
            status: "draft" as const,
            notes: null,
            completed_at: null,
            archived_at: null,
          },
        ],
        total: 1,
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockResponse)))

      const result = await client.listRecords({ page: 2 })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/records?page=2",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        })
      )
      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
    })
  })

  describe("updateRecordStatus", () => {
    it("should update record status", async () => {
      const fetchMock = setupFetchMock()
      const client = new RecordsClientFetch("https://api.test.com")

      const updatedRecord = {
        id: "rec_123",
        status: "active" as const,
        notes: null,
        completed_at: "2026-06-01T12:00:00.000Z",
        archived_at: null,
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(updatedRecord)))

      const result = await client.updateRecordStatus("rec_123", {
        status: "active",
      })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/records/rec_123/status",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "active" }),
        })
      )
      expect(result.status).toBe("active")
    })
  })

  describe("error responses", () => {
    it("should reject error body missing required code field", () => {
      const errorBody = {
        status: "400",
        title: "Invalid request",
        description: "Bad query parameters",
        retryable: false,
      }

      expect(ListRecordsError.safeParse(errorBody).success).toBe(false)
    })

    it("should parse error body with valid code enum", () => {
      const errorBody = {
        status: "400",
        code: "record.invalid",
        title: "Invalid request",
        description: "Bad query parameters",
        retryable: false,
      }

      const result = ListRecordsError.safeParse(errorBody)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.code).toBe("record.invalid")
      }
    })

    it("should throw with parsed error details from API", () => {
      const fetchMock = setupFetchMock()
      const client = new RecordsClientFetch("https://api.test.com")

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "400",
            code: "record.invalid",
            title: "Invalid page",
            description: "Page must be positive",
            retryable: false,
          }),
          { status: 400 }
        )
      )

      expect(client.listRecords()).rejects.toThrow(
        "API Error: Invalid page (record.invalid)"
      )
    })
  })

  describe("schema validation", () => {
    it("should reject record with invalid nullable field type", () => {
      const invalidRecord = {
        id: "rec_bad",
        status: "draft",
        notes: 123,
        completed_at: null,
        archived_at: null,
      }

      expect(RecordSchema.safeParse(invalidRecord).success).toBe(false)
    })
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
