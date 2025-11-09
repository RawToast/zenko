import { describe, it, expect } from "bun:test"
import { toCamelCase, capitalize } from "../string-utils"

describe("string-utils", () => {
  describe("toCamelCase", () => {
    it("should convert hyphenated strings to camelCase", () => {
      expect(toCamelCase("Links-Self")).toBe("LinksSelf")
      expect(toCamelCase("Links-Destination")).toBe("LinksDestination")
      expect(toCamelCase("Links-Origin")).toBe("LinksOrigin")
      expect(toCamelCase("Links-Pagination")).toBe("LinksPagination")
      expect(toCamelCase("Wrapper-Collection")).toBe("WrapperCollection")
      expect(toCamelCase("Links-Booking")).toBe("LinksBooking")
    })

    it("should handle strings without hyphens", () => {
      expect(toCamelCase("Station")).toBe("Station")
      expect(toCamelCase("Trip")).toBe("Trip")
      expect(toCamelCase("Booking")).toBe("Booking")
    })

    it("should handle multiple hyphens", () => {
      expect(toCamelCase("multi-hyphen-string")).toBe("multiHyphenString")
      expect(toCamelCase("a-b-c-d")).toBe("aBCD")
    })

    it("should handle empty strings", () => {
      expect(toCamelCase("")).toBe("")
    })

    it("should handle edge cases", () => {
      expect(toCamelCase("-leading")).toBe("Leading")
      expect(toCamelCase("trailing-")).toBe("trailing")
      expect(toCamelCase("a")).toBe("a")
    })
  })

  describe("capitalize", () => {
    it("should capitalize the first letter", () => {
      expect(capitalize("linksSelf")).toBe("LinksSelf")
      expect(capitalize("station")).toBe("Station")
      expect(capitalize("trip")).toBe("Trip")
    })

    it("should handle empty strings", () => {
      expect(capitalize("")).toBe("")
    })

    it("should handle single character strings", () => {
      expect(capitalize("a")).toBe("A")
      expect(capitalize("A")).toBe("A")
    })

    it("should not change already capitalized strings", () => {
      expect(capitalize("Station")).toBe("Station")
      expect(capitalize("LinksSelf")).toBe("LinksSelf")
    })
  })
})
