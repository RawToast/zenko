import { beforeAll, describe, expect, test } from "bun:test"
import * as fs from "fs"
import { parseYaml } from "../utils/yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe("Non-JSON Responses", () => {
  let specYaml: OpenAPISpec
  let result: string

  beforeAll(() => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    specYaml = parseYaml(specContent) as OpenAPISpec
    result = generate(specYaml)
  })

  test("generates complete TypeScript output", () => {
    expect(result).toMatchSnapshot("non-json-responses-complete-output")
  })

  test("handles text/csv content type", () => {
    // exportUsersCsv returns text/csv
    expect(result).toContain("export const exportUsersCsv:")
    expect(result).toContain(
      "export const ExportUsersCsvResponse = z.string();"
    )
  })

  test("handles application/xml content type", () => {
    // exportDataXml returns application/xml
    expect(result).toContain("export const exportDataXml:")
    expect(result).toContain("export const ExportDataXmlResponse = z.string();")
  })

  test("handles application/octet-stream (binary)", () => {
    // downloadFile returns application/octet-stream
    expect(result).toContain("export const downloadFile:")
    expect(result).toContain(
      'export const DownloadFileResponse = (typeof Blob === "undefined" ? z.unknown() : z.instanceof(Blob));'
    )
    expect(result).toContain('typeof Blob === "undefined"')
    expect(result).toContain("z.instanceof(Blob)")
  })

  test("handles application/pdf content type", () => {
    // getDocumentPdf returns application/pdf
    expect(result).toContain("export const getDocumentPdf:")
    expect(result).toContain(
      'export const GetDocumentPdfResponse = (typeof Blob === "undefined" ? z.unknown() : z.instanceof(Blob));'
    )
    expect(result).toContain('typeof Blob === "undefined"')
    expect(result).toContain("z.instanceof(Blob)")
  })

  test("handles multiple image content types", () => {
    // getImage can return image/png, image/jpeg, or image/webp
    expect(result).toContain("export const getImage:")
    expect(result).toContain(
      'export const GetImageResponse = (typeof Blob === "undefined" ? z.unknown() : z.instanceof(Blob));'
    )
    expect(result).toContain('typeof Blob === "undefined"')
    expect(result).toContain("z.instanceof(Blob)")
  })

  test("handles text/plain content type", () => {
    // getLogs and getHealthText return text/plain
    expect(result).toContain("export const getLogs:")
    expect(result).toContain("export const getHealthText:")
    expect(result).toContain("export const GetLogsResponse = z.string();")
  })

  test("handles text/event-stream for SSE", () => {
    // streamEvents returns text/event-stream
    expect(result).toContain("export const streamEvents:")
    expect(result).toContain("export const StreamEventsResponse = z.string();")

    // SSE streams could be typed as AsyncIterable or similar
  })

  test("handles multiple response content types for same endpoint", () => {
    // getReport can return JSON, XML, CSV, or HTML
    expect(result).toContain("export const getReport:")
    expect(result).toContain("export const Report =")
    expect(result).toContain("response: Report,")

    // Should handle content negotiation
    // Response type could be a union or conditional based on Accept header
  })

  test("handles application/zip content type", () => {
    // downloadArchive returns application/zip
    expect(result).toContain("export const downloadArchive:")
    expect(result).toContain(
      'export const DownloadArchiveResponse = (typeof Blob === "undefined" ? z.unknown() : z.instanceof(Blob));'
    )
    expect(result).toContain('typeof Blob === "undefined"')
    expect(result).toContain("z.instanceof(Blob)")
  })

  test("handles text/markdown content type", () => {
    // getMarkdownDoc returns text/markdown
    expect(result).toContain("export const getMarkdownDoc:")
    expect(result).toContain(
      "export const GetMarkdownDocResponse = z.string();"
    )

    // Markdown should be z.string()
  })

  test("handles RSS/Atom feed content types", () => {
    // getRssFeed can return RSS or Atom XML
    expect(result).toContain("export const getRssFeed:")
    expect(result).toContain("export const GetRssFeedResponse = z.string();")

    // Should handle multiple XML-based formats
  })

  test("ignores response headers for binary downloads", () => {
    // downloadFile has Content-Disposition and Content-Length headers
    expect(result).toContain("export const downloadFile:")
    expect(result).toContain("downloadFile: z.object({}),")
    expect(result).not.toContain("Content-Disposition")
    expect(result).not.toContain("Content-Length")
  })

  test("handles enum values for text responses", () => {
    // getHealthText returns enum [OK, DEGRADED]
    expect(result).toContain("export const getHealthText:")
    expect(result).toContain(
      'export const GetHealthTextResponse = z.enum(["OK", "DEGRADED"]);'
    )
  })

  test("handles binary format specification", () => {
    // Several endpoints use format: binary
    expect(result).toContain(
      'export const DownloadFileResponse = (typeof Blob === "undefined" ? z.unknown() : z.instanceof(Blob));'
    )
    expect(result).toContain('typeof Blob === "undefined"')
    expect(result).toContain("z.instanceof(Blob)")
  })

  test("handles xml responses as strings", () => {
    // exportDataXml schema has xml metadata (name, wrapped)
    expect(result).toContain("export const ExportDataXmlResponse = z.string();")
  })

  test("generates all expected operation objects", () => {
    const operations = [
      "exportUsersCsv",
      "exportDataXml",
      "downloadFile",
      "getDocumentPdf",
      "getImage",
      "getLogs",
      "streamEvents",
      "getReport",
      "getHealthText",
      "downloadArchive",
      "getMarkdownDoc",
      "getRssFeed",
    ]

    for (const op of operations) {
      expect(result).toContain(`export const ${op}:`)
    }
  })

  test("generates Report schema", () => {
    // Report schema should be generated
    expect(result).toContain("export const Report =")
    expect(result).toContain("export type Report =")
  })

  test("handles query parameters with non-JSON responses", () => {
    // exportUsersCsv has format query param
    // getLogs has lines and level query params
    // getReport has format query param

    expect(result).toContain("exportUsersCsv")
    expect(result).toContain("getLogs")
    expect(result).toContain("getReport")
  })

  test("fallback to string or unknown for unsupported content types", () => {
    // For content types that can't be properly typed in Zod
    expect(result).toContain("export const GetRssFeedResponse = z.string();")
    expect(result).toContain(
      "export const GetMarkdownDocResponse = z.string();"
    )
    expect(result).toContain(
      'export const DownloadArchiveResponse = (typeof Blob === "undefined" ? z.unknown() : z.instanceof(Blob));'
    )
    expect(result).toContain('typeof Blob === "undefined"')

    // This is acceptable behavior - non-JSON types are inherently
    // less structured than JSON schemas
  })
})
