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
    const tree = buildTreatyRouteTree({
      getBoard: { method: "get", path: "/board" },
      getSquare: { method: "get", path: "/board/{row}/{column}" },
      putSquare: { method: "put", path: "/board/{row}/{column}" },
    })

    expect(tree).toEqual({
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
    const tree = buildTreatyRouteTree({
      getSquare: { method: "get", path: "/board/{row}/{column}" },
    })
    const emitted = emitTreatyRouteTree(tree)
    expect(emitted).toContain("board: {")
    expect(emitted).toContain('":row": {')
    expect(emitted).toContain("getSquare,")
  })
})
