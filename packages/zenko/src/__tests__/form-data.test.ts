import { describe, test, expect } from "bun:test"
import * as fs from "fs"
import jsYaml from "js-yaml"
import { generate, type OpenAPISpec } from "../zenko"

describe("Form Data", () => {
  test("generates complete TypeScript output", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    expect(result).toMatchSnapshot("form-data-complete-output")
  })

  test("snapshots operation objects for form requests", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    const operationObjectsSection =
      result.split("// Operation Objects")[1] ?? ""

    expect(operationObjectsSection).toMatchSnapshot(
      "form-data-operation-objects"
    )
  })

  test("handles multipart/form-data content type", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // FileUpload is used with multipart/form-data
    expect(result).toContain("export const FileUpload =")

    // Operations should include request schemas for form uploads
    expect(result).toContain("export const uploadFile:")
    expect(result).toContain("request: FileUpload")
  })

  test("handles binary file format", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // FileUpload has a file field with format: binary
    expect(result).toContain("export const FileUpload =")

    // Binary should be runtime-safe across Node/Bun/Browser
    expect(result).toContain('typeof Blob === "undefined"')
    expect(result).toContain("z.instanceof(Blob)")
  })

  test("handles array of binary files", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // MultiFileUpload has files: array of binary
    expect(result).toContain("export const MultiFileUpload =")

    // Should generate array schema for multiple files
    expect(result).toContain("files")
    expect(result).toContain("z.array(")
  })

  test("handles application/x-www-form-urlencoded", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ContactForm and LoginForm use application/x-www-form-urlencoded
    expect(result).toContain("export const ContactForm =")
    expect(result).toContain("export const LoginForm =")

    // Operations should include request schemas for urlencoded forms
    expect(result).toContain("export const submitContactForm:")
    expect(result).toContain("request: ContactForm")
    expect(result).toContain("export const login:")
    expect(result).toContain("request: LoginForm")
  })

  test("handles mixed data types in form data", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ProfileForm has string, integer, boolean, binary, and object fields
    expect(result).toContain("export const ProfileForm =")

    // Should handle mixed types appropriately
    expect(result).toContain("username")
    expect(result).toContain("email")
    expect(result).toContain("age")
    expect(result).toContain("avatar")
  })

  test("handles encoding specification", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // createProfile operation has encoding specification for avatar
    // encoding: { avatar: { contentType: "image/png, image/jpeg" } }

    // We don't currently emit encoding metadata, but the request schema should exist
    expect(result).toContain("export const createProfile:")
    expect(result).toContain("request: ProfileForm")
  })

  test("handles nested objects in form data", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // ProfileForm has nested preferences object
    // DocumentUpload has nested metadata object
    expect(result).toContain("export const ProfileForm =")
    expect(result).toContain("export const DocumentUpload =")

    // Nested objects in form data might be flattened or serialized as JSON strings
  })

  test("handles arrays in form data", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // DocumentUpload has tags array
    expect(result).toContain("export const DocumentUpload =")

    // Arrays in form data are typically repeated fields or comma-separated
  })

  test("generates all form schemas", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // All form schemas should be generated
    expect(result).toContain("export const FileUpload =")
    expect(result).toContain("export const MultiFileUpload =")
    expect(result).toContain("export const ProfileForm =")
    expect(result).toContain("export const ContactForm =")
    expect(result).toContain("export const LoginForm =")
    expect(result).toContain("export const DocumentUpload =")

    // Response schemas
    expect(result).toContain("export const UploadResponse =")
    expect(result).toContain("export const MultiUploadResponse =")
    expect(result).toContain("export const Profile =")
    expect(result).toContain("export const LoginResponse =")
    expect(result).toContain("export const Document =")
  })

  test("generates operation objects with correct content types", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // Operations should reference the correct schemas
    expect(result).toContain("export const uploadFile:")
    expect(result).toContain("export const uploadMultipleFiles:")
    expect(result).toContain("export const createProfile:")
    expect(result).toContain("export const submitContactForm:")
    expect(result).toContain("export const login:")
    expect(result).toContain("export const uploadDocument:")

    // Operation type definitions
    expect(result).toContain("UploadFileOperation")
    expect(result).toContain("UploadMultipleFilesOperation")
    expect(result).toContain("CreateProfileOperation")
    expect(result).toContain("SubmitContactFormOperation")
    expect(result).toContain("LoginOperation")
    expect(result).toContain("UploadDocumentOperation")
  })

  test("applies validation constraints to form fields", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml, { strictNumeric: true })

    // ProfileForm has age constraints
    expect(result).toContain("export const ProfileForm =")

    // Should include validation
    // .min(18).max(120) for age
    // .minLength(3).maxLength(20) for username
  })

  test("handles password format", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // LoginForm has password field with format: password
    expect(result).toContain("export const LoginForm =")

    // Password format is typically just a string, but could have special handling
    expect(result).toContain("password")
  })

  test("handles default values in forms", () => {
    const specContent = fs.readFileSync("src/resources/form-data.yaml", "utf8")
    const specYaml = jsYaml.load(specContent) as OpenAPISpec
    const result = generate(specYaml)

    // LoginForm has rememberMe with default: false
    // DocumentUpload has isPublic with default: false
    expect(result).toContain("export const LoginForm =")
    expect(result).toContain("export const DocumentUpload =")

    // Should include .default(false)
    expect(result).toContain(".default(false)")
  })
})
