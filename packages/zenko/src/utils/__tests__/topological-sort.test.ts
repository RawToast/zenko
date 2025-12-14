import { test, expect, describe } from "bun:test"
import {
  topologicalSort,
  extractDependencies,
  extractRefName,
} from "../topological-sort"
import * as fs from "fs"

describe("topologicalSort", () => {
  test("should handle simple dependency chain", () => {
    const schemas = {
      A: { type: "string" },
      B: {
        type: "object",
        properties: {
          a: { $ref: "#/components/schemas/A" },
        },
      },
      C: {
        type: "object",
        properties: {
          b: { $ref: "#/components/schemas/B" },
        },
      },
    }

    const result = topologicalSort(schemas)

    // A should come before B, B should come before C
    expect(result.indexOf("A")).toBeLessThan(result.indexOf("B"))
    expect(result.indexOf("B")).toBeLessThan(result.indexOf("C"))
    expect(result).toHaveLength(3)
  })

  test("should handle no dependencies", () => {
    const schemas = {
      SimpleString: { type: "string" },
      SimpleNumber: { type: "number" },
      SimpleBoolean: { type: "boolean" },
    }

    const result = topologicalSort(schemas)

    expect(result).toHaveLength(3)
    expect(result).toContain("SimpleString")
    expect(result).toContain("SimpleNumber")
    expect(result).toContain("SimpleBoolean")
  })

  test("should handle circular dependencies gracefully", () => {
    const schemas = {
      A: {
        type: "object",
        properties: {
          b: { $ref: "#/components/schemas/B" },
        },
      },
      B: {
        type: "object",
        properties: {
          a: { $ref: "#/components/schemas/A" },
        },
      },
    }

    const result = topologicalSort(schemas)

    expect(result).toHaveLength(2)
    expect(result).toContain("A")
    expect(result).toContain("B")
  })

  test("should work with petstore schema", () => {
    const petstoreContent = fs.readFileSync(
      "src/resources/petstore.yaml",
      "utf8"
    )
    const petstore = Bun.YAML.parse(petstoreContent) as any
    const schemas = petstore.components.schemas

    const result = topologicalSort(schemas)

    expect(result).toHaveLength(3)
    expect(result).toContain("Pet")
    expect(result).toContain("Pets")
    expect(result).toContain("Error")

    // Pet should come before Pets since Pets references Pet
    expect(result.indexOf("Pet")).toBeLessThan(result.indexOf("Pets"))
  })

  test("should handle array dependencies", () => {
    const schemas = {
      Item: { type: "string" },
      ItemList: {
        type: "array",
        items: { $ref: "#/components/schemas/Item" },
      },
    }

    const result = topologicalSort(schemas)

    expect(result.indexOf("Item")).toBeLessThan(result.indexOf("ItemList"))
  })

  test("should handle nested object dependencies", () => {
    const schemas = {
      Address: {
        type: "object",
        properties: {
          street: { type: "string" },
          city: { type: "string" },
        },
      },
      Person: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { $ref: "#/components/schemas/Address" },
        },
      },
      Company: {
        type: "object",
        properties: {
          name: { type: "string" },
          employees: {
            type: "array",
            items: { $ref: "#/components/schemas/Person" },
          },
        },
      },
    }

    const result = topologicalSort(schemas)

    expect(result.indexOf("Address")).toBeLessThan(result.indexOf("Person"))
    expect(result.indexOf("Person")).toBeLessThan(result.indexOf("Company"))
  })
})

describe("extractDependencies", () => {
  test("should extract single $ref dependency", () => {
    const schema = {
      type: "object",
      properties: {
        user: { $ref: "#/components/schemas/User" },
      },
    }

    const deps = extractDependencies(schema)
    expect(deps).toEqual(["User"])
  })

  test("should extract multiple dependencies", () => {
    const schema = {
      type: "object",
      properties: {
        user: { $ref: "#/components/schemas/User" },
        address: { $ref: "#/components/schemas/Address" },
      },
    }

    const deps = extractDependencies(schema)
    expect(deps).toHaveLength(2)
    expect(deps).toContain("User")
    expect(deps).toContain("Address")
  })

  test("should handle array item dependencies", () => {
    const schema = {
      type: "array",
      items: { $ref: "#/components/schemas/Item" },
    }

    const deps = extractDependencies(schema)
    expect(deps).toEqual(["Item"])
  })

  test("should handle no dependencies", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    }

    const deps = extractDependencies(schema)
    expect(deps).toEqual([])
  })

  test("should remove duplicate dependencies", () => {
    const schema = {
      type: "object",
      properties: {
        user1: { $ref: "#/components/schemas/User" },
        user2: { $ref: "#/components/schemas/User" },
      },
    }

    const deps = extractDependencies(schema)
    expect(deps).toEqual(["User"])
  })
})

describe("extractRefName", () => {
  test("should extract name from standard ref", () => {
    expect(extractRefName("#/components/schemas/User")).toBe("User")
  })

  test("should extract name from nested ref", () => {
    expect(extractRefName("#/definitions/models/User")).toBe("User")
  })

  test("should handle simple ref", () => {
    expect(extractRefName("User")).toBe("User")
  })

  test("should handle empty ref gracefully", () => {
    expect(extractRefName("")).toBe("Unknown")
  })

  test("should handle malformed ref", () => {
    expect(extractRefName("/")).toBe("Unknown")
  })
})
