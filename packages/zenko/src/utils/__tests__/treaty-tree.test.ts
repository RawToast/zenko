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

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("Expected unsupported method to fail")
    }

    expect(result.error).toMatchObject({
      message: "Unsupported method BREW for getBoard",
    })
  })

  test("buildTreatyRouteTree returns an error for empty paths", () => {
    const result = buildTreatyRouteTree({
      getRoot: { method: "GET", path: "/" },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("Expected empty path to fail")
    }

    expect(result.error).toMatchObject({
      message: "Empty path for getRoot",
    })
  })

  test("buildTreatyRouteTree returns an error for duplicate operations", () => {
    const result = buildTreatyRouteTree({
      getBoard: { method: "GET", path: "/board" },
      getBoardAgain: { method: "GET", path: "/board" },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("Expected duplicate operation to fail")
    }

    expect(result.error).toMatchObject({
      message: 'Duplicate get on board for getBoardAgain vs "getBoard"',
    })
  })
})
