import { describe, test, expect } from "bun:test"
import {
  buildTreatyRouteTree,
  emitTreatyRouteTree,
  insertOperation,
  pathTemplateToSegments,
  type TreatyRouteTree,
} from "../treaty-tree"

describe("treaty-tree", () => {
  test("pathTemplateToSegments maps brace params", () => {
    expect(pathTemplateToSegments("/board/{row}/{column}")).toEqual([
      "board",
      ":row",
      ":column",
    ])
  })

  test("pathTemplateToSegments maps root path to empty segments", () => {
    expect(pathTemplateToSegments("/")).toEqual([])
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

  test("buildTreatyRouteTree accepts root path / as top-level method leaves", () => {
    const result = buildTreatyRouteTree({
      getRoot: { method: "GET", path: "/" },
      postRoot: { method: "POST", path: "/" },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw result.error
    }

    expect(result.value).toEqual({
      get: "getRoot",
      post: "postRoot",
    })
  })

  test("buildTreatyRouteTree returns an error for duplicate methods on root", () => {
    const result = buildTreatyRouteTree({
      getRoot: { method: "GET", path: "/" },
      getRootAgain: { method: "GET", path: "/" },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("Expected duplicate root GET to fail")
    }

    expect(result.error).toMatchObject({
      message: 'Duplicate get on root for getRootAgain vs "getRoot"',
    })
  })

  test("insertOperation errors when a non-object leaf blocks a longer path", () => {
    const tree: TreatyRouteTree = { api: "existingOperation" }
    const result = insertOperation(
      tree,
      ["api", "v1", "users"],
      "get",
      "getUsers"
    )

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("Expected primitive leaf collision to fail")
    }

    expect(result.error.message).toContain('"api"')
    expect(result.error.message).toContain("get")
    expect(result.error.message).toContain("getUsers")
    expect(result.error.message).toContain("existingOperation")
    expect(tree.api).toBe("existingOperation")
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
