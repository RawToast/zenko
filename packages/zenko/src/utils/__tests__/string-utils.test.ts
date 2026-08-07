import { describe, it, expect } from "bun:test"
import { toCamelCase, capitalize, normalizeOperationId } from "../string-utils"

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

    it("should strip periods like hyphens", () => {
      expect(toCamelCase("Arbitrum.Withdrawal")).toBe("ArbitrumWithdrawal")
      expect(
        toCamelCase("BlockScoutWeb.API.V2.TransactionController.zksync_batch")
      ).toBe("BlockScoutWebAPIV2TransactionControllerZksync_batch")
      expect(toCamelCase("BlockScoutWeb.API.V2.foo")).toBe(
        "BlockScoutWebAPIV2Foo"
      )
    })

    it("should strip spaces and parentheses", () => {
      expect(toCamelCase("search (2)")).toBe("search2")
      expect(
        toCamelCase("BlockScoutWeb.API.V2.SearchController.search (2)")
      ).toBe("BlockScoutWebAPIV2SearchControllerSearch2")
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
      expect(toCamelCase(".leading")).toBe("Leading")
      expect(toCamelCase("trailing.")).toBe("trailing")
      expect(toCamelCase("a")).toBe("a")
    })
  })

  describe("normalizeOperationId", () => {
    it("should strip periods for matching", () => {
      expect(
        normalizeOperationId(
          "BlockScoutWeb.API.V2.TransactionController.zksync_batch"
        )
      ).toBe("BlockScoutWebAPIV2TransactionControllerzksync_batch")
      expect(
        normalizeOperationId(
          "BlockScoutWebAPIV2TransactionControllerzksync_batch"
        )
      ).toBe("BlockScoutWebAPIV2TransactionControllerzksync_batch")
    })

    it("should strip spaces and parentheses for matching", () => {
      expect(
        normalizeOperationId("BlockScoutWeb.API.V2.SearchController.search (2)")
      ).toBe("BlockScoutWebAPIV2SearchControllersearch2")
    })

    it("should leave ids without periods unchanged", () => {
      expect(normalizeOperationId("listPets")).toBe("listPets")
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
