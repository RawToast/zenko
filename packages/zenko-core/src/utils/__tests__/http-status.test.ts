import { describe, expect, test } from "bun:test"
import {
  getStatusCategory,
  isErrorStatus,
  mapStatusToIdentifier,
} from "../http-status"

describe("http-status utilities", () => {
  test("maps status codes to readable identifiers", () => {
    expect(mapStatusToIdentifier("404")).toBe("notFound")
    expect(mapStatusToIdentifier("500")).toBe("internalServerError")
    expect(mapStatusToIdentifier("default")).toBe("defaultError")
    expect(mapStatusToIdentifier("599")).toBe("status599")
  })

  test("categorizes status codes", () => {
    expect(getStatusCategory("400")).toBe("client")
    expect(getStatusCategory("404")).toBe("client")
    expect(getStatusCategory("500")).toBe("server")
    expect(getStatusCategory("default")).toBe("default")
    expect(getStatusCategory("302")).toBe("unknown")
    expect(getStatusCategory("abc")).toBe("unknown")
  })

  test("determines whether a status code represents an error", () => {
    expect(isErrorStatus("400")).toBe(true)
    expect(isErrorStatus("500")).toBe(true)
    expect(isErrorStatus("default")).toBe(true)
    expect(isErrorStatus("200")).toBe(false)
    expect(isErrorStatus("abc")).toBe(false)
  })
})
