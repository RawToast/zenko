import { describe, test, expect } from "bun:test"
import {
  buildTreatyRouteTree,
  emitTreatyRouteTree,
  pathTemplateToSegments,
} from "../treaty-tree"

describe("treaty-tree", () => {
  test("pathTemplateToSegments maps brace params", () => {
    expect(pathTemplateToSegments("/board/{row}/{column}")).toEqual([
      "board",
      ":row",
      ":column",
    ])
  })

  test("buildTreatyRouteTree merges static and dynamic segments", () => {
    const result = buildTreatyRouteTree({
      getBoard: { method: "get", path: "/board" },
      getSquare: { method: "get", path: "/board/{row}/{column}" },
      putSquare: { method: "put", path: "/board/{row}/{column}" },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw result.error
    }

    expect(result.value).toEqual({
      board: {
        get: "getBoard",
        ":row": {
          ":column": {
            get: "getSquare",
            put: "putSquare",
          },
        },
      },
    })
  })

  test("emitTreatyRouteTree emits quoted :param keys", () => {
    const result = buildTreatyRouteTree({
      getSquare: { method: "get", path: "/board/{row}/{column}" },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw result.error
    }
    const emitted = emitTreatyRouteTree(result.value)
    expect(emitted).toContain("board: {")
    expect(emitted).toContain('":row": {')
    expect(emitted).toContain("getSquare,")
  })

  test("buildTreatyRouteTree returns an error for unsupported methods", () => {
    const result = buildTreatyRouteTree({
      getBoard: { method: "BREW", path: "/board" },
    })

    expect(result).toEqual({
      ok: false,
      error: new Error("Unsupported method BREW for getBoard"),
    })
  })
})
