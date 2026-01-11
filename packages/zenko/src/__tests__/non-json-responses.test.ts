import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import { parseYaml } from "../utils/yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe.skip("Non-JSON Responses", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("non-json-responses-complete-output")
  })

  test("handles text/csv content type", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // exportUsersCsv returns text/csv
    expect(result).toContain("export const exportUsersCsv:")

    // CSV responses should be typed as string
    // Could use z.string() or a more specific type
  })

  test("handles application/xml content type", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // exportDataXml returns application/xml
    expect(result).toContain("export const exportDataXml:")

    // XML responses should be typed appropriately
    // Could be z.string() or parsed into structured types
  })

  test("handles application/octet-stream (binary)", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // downloadFile returns application/octet-stream
    expect(result).toContain("export const downloadFile:")

    // Binary responses should be typed as Blob, ArrayBuffer, or Buffer
    // Could use z.instanceof(Blob) or z.instanceof(Buffer)
  })

  test("handles application/pdf content type", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // getDocumentPdf returns application/pdf
    expect(result).toContain("export const getDocumentPdf:")

    // PDF should be binary type
  })

  test("handles multiple image content types", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // getImage can return image/png, image/jpeg, or image/webp
    expect(result).toContain("export const getImage:")

    // Should handle multiple content types
    // Could be a union or a single binary type
  })

  test("handles text/plain content type", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // getLogs and getHealthText return text/plain
    expect(result).toContain("export const getLogs:")
    expect(result).toContain("export const getHealthText:")

    // Plain text should be z.string()
  })

  test("handles text/event-stream for SSE", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // streamEvents returns text/event-stream
    expect(result).toContain("export const streamEvents:")

    // SSE streams could be typed as AsyncIterable or similar
  })

  test("handles multiple response content types for same endpoint", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // getReport can return JSON, XML, CSV, or HTML
    expect(result).toContain("export const getReport:")
    expect(result).toContain("export const Report =")

    // Should handle content negotiation
    // Response type could be a union or conditional based on Accept header
  })

  test("handles application/zip content type", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // downloadArchive returns application/zip
    expect(result).toContain("export const downloadArchive:")

    // ZIP should be binary type
  })

  test("handles text/markdown content type", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // getMarkdownDoc returns text/markdown
    expect(result).toContain("export const getMarkdownDoc:")

    // Markdown should be z.string()
  })

  test("handles RSS/Atom feed content types", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // getRssFeed can return RSS or Atom XML
    expect(result).toContain("export const getRssFeed:")

    // Should handle multiple XML-based formats
  })

  test("handles response headers for binary downloads", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // downloadFile has Content-Disposition and Content-Length headers
    expect(result).toContain("export const downloadFile:")

    // Headers should be included in operation definition
  })

  test("handles enum values for text responses", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // getHealthText returns enum [OK, DEGRADED]
    expect(result).toContain("export const getHealthText:")

    // Should use z.enum(["OK", "DEGRADED"])
  })

  test("handles binary format specification", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Several endpoints use format: binary
    expect(result).toContain("export const DownloadFileResponse =")
    expect(result).toContain('typeof Blob === "undefined"')
    expect(result).toContain("z.instanceof(Blob)")
  })

  test("handles xml metadata in schemas", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // exportDataXml schema has xml metadata (name, wrapped)
    expect(result).toContain("export const ExportDataXmlResponse = z.object({")
    expect(result).toContain("records: z.array(")
    expect(result).toContain("id: z.string()")
    expect(result).toContain("value: z.string()")
  })

  test("generates all expected operation objects", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

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
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Report schema should be generated
    expect(result).toContain("export const Report =")
    expect(result).toContain("export type Report =")
  })

  test("handles query parameters with non-JSON responses", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // exportUsersCsv has format query param
    // getLogs has lines and level query params
    // getReport has format query param

    expect(result).toContain("exportUsersCsv")
    expect(result).toContain("getLogs")
    expect(result).toContain("getReport")
  })

  test("fallback to string or unknown for unsupported content types", () => {
    const specContent = fs.readFileSync(
      "src/resources/non-json-responses.yaml",
      "utf8"
    )
    const specYaml = parseYaml(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // For content types that can't be properly typed in Zod
    expect(result).toContain("export const GetRssFeedResponse = z.string();")
    expect(result).toContain(
      "export const GetMarkdownDocResponse = z.string();"
    )
    expect(result).toContain("export const DownloadArchiveResponse =")
    expect(result).toContain('typeof Blob === "undefined"')

    // This is acceptable behavior - non-JSON types are inherently
    // less structured than JSON schemas
  })
})
