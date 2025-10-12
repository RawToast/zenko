import { describe, test, expect } from "bun:test"
import { isValidJSIdentifier, formatPropertyName } from "../property-name"

describe("isValidJSIdentifier", () => {
  test("should return true for valid identifiers", () => {
    expect(isValidJSIdentifier("validName")).toBe(true)
    expect(isValidJSIdentifier("_underscore")).toBe(true)
    expect(isValidJSIdentifier("$dollar")).toBe(true)
    expect(isValidJSIdentifier("camelCase")).toBe(true)
    expect(isValidJSIdentifier("snake_case")).toBe(true)
    expect(isValidJSIdentifier("name123")).toBe(true)
    expect(isValidJSIdentifier("a")).toBe(true)
    expect(isValidJSIdentifier("ABC")).toBe(true)
    expect(isValidJSIdentifier("_")).toBe(true)
    expect(isValidJSIdentifier("$")).toBe(true)
  })

  test("should return false for names starting with numbers", () => {
    expect(isValidJSIdentifier("6pay_capture_fee_percentage")).toBe(false)
    expect(isValidJSIdentifier("123invalid")).toBe(false)
    expect(isValidJSIdentifier("0start")).toBe(false)
    expect(isValidJSIdentifier("9test")).toBe(false)
  })

  test("should return false for names with special characters", () => {
    expect(isValidJSIdentifier("invalid-name")).toBe(false)
    expect(isValidJSIdentifier("invalid.name")).toBe(false)
    expect(isValidJSIdentifier("invalid@name")).toBe(false)
    expect(isValidJSIdentifier("invalid name")).toBe(false)
    expect(isValidJSIdentifier("invalid+name")).toBe(false)
    expect(isValidJSIdentifier("invalid/name")).toBe(false)
    expect(isValidJSIdentifier("invalid\\name")).toBe(false)
    expect(isValidJSIdentifier("invalid:name")).toBe(false)
    expect(isValidJSIdentifier("invalid;name")).toBe(false)
    expect(isValidJSIdentifier("invalid,name")).toBe(false)
    expect(isValidJSIdentifier("invalid?name")).toBe(false)
    expect(isValidJSIdentifier("invalid!name")).toBe(false)
    expect(isValidJSIdentifier("invalid#name")).toBe(false)
    expect(isValidJSIdentifier("invalid%name")).toBe(false)
    expect(isValidJSIdentifier("invalid&name")).toBe(false)
    expect(isValidJSIdentifier("invalid*name")).toBe(false)
    expect(isValidJSIdentifier("invalid(name")).toBe(false)
    expect(isValidJSIdentifier("invalid)name")).toBe(false)
    expect(isValidJSIdentifier("invalid[name")).toBe(false)
    expect(isValidJSIdentifier("invalid]name")).toBe(false)
    expect(isValidJSIdentifier("invalid{name")).toBe(false)
    expect(isValidJSIdentifier("invalid}name")).toBe(false)
    expect(isValidJSIdentifier("invalid|name")).toBe(false)
    expect(isValidJSIdentifier("invalid=name")).toBe(false)
    expect(isValidJSIdentifier("invalid<name")).toBe(false)
    expect(isValidJSIdentifier("invalid>name")).toBe(false)
  })

  test("should return false for reserved words", () => {
    expect(isValidJSIdentifier("class")).toBe(false)
    expect(isValidJSIdentifier("function")).toBe(false)
    expect(isValidJSIdentifier("return")).toBe(false)
    expect(isValidJSIdentifier("const")).toBe(false)
    expect(isValidJSIdentifier("let")).toBe(false)
    expect(isValidJSIdentifier("var")).toBe(false)
    expect(isValidJSIdentifier("if")).toBe(false)
    expect(isValidJSIdentifier("else")).toBe(false)
    expect(isValidJSIdentifier("for")).toBe(false)
    expect(isValidJSIdentifier("while")).toBe(false)
    expect(isValidJSIdentifier("do")).toBe(false)
    expect(isValidJSIdentifier("switch")).toBe(false)
    expect(isValidJSIdentifier("case")).toBe(false)
    expect(isValidJSIdentifier("default")).toBe(false)
    expect(isValidJSIdentifier("break")).toBe(false)
    expect(isValidJSIdentifier("continue")).toBe(false)
    expect(isValidJSIdentifier("try")).toBe(false)
    expect(isValidJSIdentifier("catch")).toBe(false)
    expect(isValidJSIdentifier("finally")).toBe(false)
    expect(isValidJSIdentifier("throw")).toBe(false)
    expect(isValidJSIdentifier("new")).toBe(false)
    expect(isValidJSIdentifier("delete")).toBe(false)
    expect(isValidJSIdentifier("typeof")).toBe(false)
    expect(isValidJSIdentifier("instanceof")).toBe(false)
    expect(isValidJSIdentifier("in")).toBe(false)
    expect(isValidJSIdentifier("this")).toBe(false)
    expect(isValidJSIdentifier("super")).toBe(false)
    expect(isValidJSIdentifier("true")).toBe(false)
    expect(isValidJSIdentifier("false")).toBe(false)
    expect(isValidJSIdentifier("null")).toBe(false)
    expect(isValidJSIdentifier("import")).toBe(false)
    expect(isValidJSIdentifier("export")).toBe(false)
    expect(isValidJSIdentifier("extends")).toBe(false)
    expect(isValidJSIdentifier("implements")).toBe(false)
    expect(isValidJSIdentifier("interface")).toBe(false)
    expect(isValidJSIdentifier("enum")).toBe(false)
    expect(isValidJSIdentifier("abstract")).toBe(false)
    expect(isValidJSIdentifier("static")).toBe(false)
    expect(isValidJSIdentifier("private")).toBe(false)
    expect(isValidJSIdentifier("protected")).toBe(false)
    expect(isValidJSIdentifier("public")).toBe(false)
    expect(isValidJSIdentifier("async")).toBe(false)
    expect(isValidJSIdentifier("await")).toBe(false)
    expect(isValidJSIdentifier("yield")).toBe(false)
  })

  test("should return false for empty string", () => {
    expect(isValidJSIdentifier("")).toBe(false)
  })

  test("should handle edge cases", () => {
    expect(isValidJSIdentifier("_123")).toBe(true) // Valid: starts with underscore
    expect(isValidJSIdentifier("$123")).toBe(true) // Valid: starts with dollar
    expect(isValidJSIdentifier("a_b_c")).toBe(true) // Valid: underscores in middle
    expect(isValidJSIdentifier("a$b$c")).toBe(true) // Valid: dollars in middle
  })
})

describe("formatPropertyName", () => {
  test("should not quote valid identifiers", () => {
    expect(formatPropertyName("validName")).toBe("validName")
    expect(formatPropertyName("camelCase")).toBe("camelCase")
    expect(formatPropertyName("_underscore")).toBe("_underscore")
    expect(formatPropertyName("$dollar")).toBe("$dollar")
    expect(formatPropertyName("snake_case")).toBe("snake_case")
    expect(formatPropertyName("name123")).toBe("name123")
    expect(formatPropertyName("ABC")).toBe("ABC")
  })

  test("should quote names starting with numbers", () => {
    expect(formatPropertyName("6pay_capture_fee_percentage")).toBe(
      '"6pay_capture_fee_percentage"'
    )
    expect(formatPropertyName("123invalid")).toBe('"123invalid"')
    expect(formatPropertyName("0start")).toBe('"0start"')
    expect(formatPropertyName("9test")).toBe('"9test"')
  })

  test("should quote names with special characters", () => {
    expect(formatPropertyName("invalid-name")).toBe('"invalid-name"')
    expect(formatPropertyName("invalid.name")).toBe('"invalid.name"')
    expect(formatPropertyName("invalid@name")).toBe('"invalid@name"')
    expect(formatPropertyName("invalid name")).toBe('"invalid name"')
    expect(formatPropertyName("invalid+name")).toBe('"invalid+name"')
    expect(formatPropertyName("invalid/name")).toBe('"invalid/name"')
    expect(formatPropertyName("invalid:name")).toBe('"invalid:name"')
    expect(formatPropertyName("invalid-property")).toBe('"invalid-property"')
    expect(formatPropertyName("property.with.dots")).toBe(
      '"property.with.dots"'
    )
  })

  test("should quote reserved words", () => {
    expect(formatPropertyName("class")).toBe('"class"')
    expect(formatPropertyName("function")).toBe('"function"')
    expect(formatPropertyName("return")).toBe('"return"')
    expect(formatPropertyName("const")).toBe('"const"')
    expect(formatPropertyName("let")).toBe('"let"')
    expect(formatPropertyName("var")).toBe('"var"')
    expect(formatPropertyName("if")).toBe('"if"')
    expect(formatPropertyName("else")).toBe('"else"')
    expect(formatPropertyName("for")).toBe('"for"')
    expect(formatPropertyName("while")).toBe('"while"')
    expect(formatPropertyName("import")).toBe('"import"')
    expect(formatPropertyName("export")).toBe('"export"')
  })

  test("should handle empty string", () => {
    expect(formatPropertyName("")).toBe('""')
  })

  test("should handle real-world examples", () => {
    // Common OpenAPI property names that are invalid JS identifiers
    expect(formatPropertyName("6pay_capture_fee_percentage")).toBe(
      '"6pay_capture_fee_percentage"'
    )
    expect(formatPropertyName("created-at")).toBe('"created-at"')
    expect(formatPropertyName("updated-at")).toBe('"updated-at"')
    expect(formatPropertyName("content-type")).toBe('"content-type"')
    expect(formatPropertyName("x-api-key")).toBe('"x-api-key"')
    expect(formatPropertyName("api-version")).toBe('"api-version"')
    expect(formatPropertyName("user_id")).toBe("user_id") // Valid, no quotes needed
    expect(formatPropertyName("userId")).toBe("userId") // Valid, no quotes needed
    expect(formatPropertyName("API_KEY")).toBe("API_KEY") // Valid, no quotes needed
  })
})
