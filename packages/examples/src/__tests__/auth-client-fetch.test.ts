import { describe, it, expect, afterEach, mock } from "bun:test"
import { AuthClientFetch } from "~/auth-client-fetch"

describe("AuthClientFetch", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe("loginUser (URL-encoded form)", () => {
    it("should send URL-encoded form data with correct content type", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockResponse = {
        accessToken: "abc123",
        tokenType: "Bearer" as const,
        expiresIn: 3600,
        refreshToken: "refresh456",
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockResponse)))

      const result = await client.loginUser({
        email: "user@example.com",
        password: "secret123",
        staySignedIn: true,
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/auth/login",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
      )

      // Verify body is URL-encoded
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(options.body).toBe(
        "email=user%40example.com&password=secret123&staySignedIn=true"
      )

      expect(result).toEqual(mockResponse)
    })

    it("should handle login with only required fields", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockResponse = {
        accessToken: "token",
        tokenType: "Bearer" as const,
        expiresIn: 3600,
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockResponse)))

      await client.loginUser({
        email: "test@test.com",
        password: "pass",
      })

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      // staySignedIn defaults to false
      expect(options.body).toBe(
        "email=test%40test.com&password=pass&staySignedIn=false"
      )
    })

    it("should handle authentication errors", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ code: 401, message: "Invalid credentials" }),
          { status: 401 }
        )
      )

      await expect(
        client.loginUser({
          email: "user@example.com",
          password: "wrong",
        })
      ).rejects.toThrow("API Error: Invalid credentials (401)")
    })
  })

  describe("registerUser (URL-encoded form)", () => {
    it("should send registration data as URL-encoded form", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockUser = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "newuser@example.com",
        displayName: "New User",
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockUser)))

      const result = await client.registerUser({
        email: "newuser@example.com",
        password: "securepass123",
        displayName: "New User",
        acceptTerms: true,
        referralCode: "FRIEND10",
      })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/auth/register",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        })
      )

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = options.body as string
      expect(body).toContain("email=newuser%40example.com")
      expect(body).toContain("password=securepass123")
      expect(body).toContain("displayName=New+User")
      expect(body).toContain("acceptTerms=true")
      expect(body).toContain("referralCode=FRIEND10")

      expect(result).toEqual(mockUser)
    })

    it("should handle validation errors", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ code: 400, message: "Email already registered" }),
          { status: 400 }
        )
      )

      await expect(
        client.registerUser({
          email: "existing@example.com",
          password: "pass123",
          displayName: "User",
        })
      ).rejects.toThrow("API Error: Email already registered (400)")
    })
  })

  describe("uploadAvatar (multipart form)", () => {
    it("should send file as multipart/form-data", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockResponse = {
        avatarUrl: "https://cdn.example.com/avatars/123.jpg",
        thumbnailUrl: "https://cdn.example.com/avatars/123_thumb.jpg",
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockResponse)))

      const imageBlob = new Blob(["fake image data"], { type: "image/jpeg" })

      const result = await client.uploadAvatar({
        image: imageBlob,
        cropX: 10,
        cropY: 20,
        cropSize: 100,
      })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/settings/avatar",
        expect.objectContaining({
          method: "POST",
        })
      )

      // Verify FormData is sent (no Content-Type header - browser sets it with boundary)
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(options.body).toBeInstanceOf(FormData)

      const formData = options.body as FormData
      expect(formData.get("image")).toBeInstanceOf(Blob)
      expect(formData.get("cropX")).toBe("10")
      expect(formData.get("cropY")).toBe("20")
      expect(formData.get("cropSize")).toBe("100")

      expect(result).toEqual(mockResponse)
    })

    it("should send only required fields", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockResponse = {
        avatarUrl: "https://cdn.example.com/avatars/456.jpg",
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockResponse)))

      const imageBlob = new Blob(["image"], { type: "image/png" })

      await client.uploadAvatar({ image: imageBlob })

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      const formData = options.body as FormData

      expect(formData.get("image")).toBeInstanceOf(Blob)
      expect(formData.get("cropX")).toBeNull()
      expect(formData.get("cropY")).toBeNull()
      expect(formData.get("cropSize")).toBeNull()
    })
  })

  describe("updateProfile (multipart form)", () => {
    it("should send profile update with optional avatar", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockUser = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "user@example.com",
        displayName: "Updated Name",
        bio: "Hello world",
        website: "https://example.com",
        avatarUrl: "https://cdn.example.com/new-avatar.jpg",
        location: "San Francisco",
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockUser)))

      const avatarBlob = new Blob(["avatar"], { type: "image/jpeg" })

      const result = await client.updateProfile({
        displayName: "Updated Name",
        bio: "Hello world",
        website: "https://example.com",
        avatar: avatarBlob,
        location: "San Francisco",
        notifications: {
          emailUpdates: true,
          pushNotifications: false,
          weeklyDigest: true,
        },
      })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/settings/profile",
        expect.objectContaining({
          method: "PATCH",
        })
      )

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      const formData = options.body as FormData

      expect(formData.get("displayName")).toBe("Updated Name")
      expect(formData.get("bio")).toBe("Hello world")
      expect(formData.get("website")).toBe("https://example.com")
      expect(formData.get("avatar")).toBeInstanceOf(Blob)
      expect(formData.get("location")).toBe("San Francisco")
      expect(formData.get("notifications")).toBe(
        JSON.stringify({
          emailUpdates: true,
          pushNotifications: false,
          weeklyDigest: true,
        })
      )

      expect(result).toEqual(mockUser)
    })

    it("should send partial updates without avatar", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockUser = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "user@example.com",
        displayName: "Just Bio Update",
        bio: "New bio only",
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockUser)))

      await client.updateProfile({
        bio: "New bio only",
      })

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      const formData = options.body as FormData

      expect(formData.get("bio")).toBe("New bio only")
      expect(formData.get("avatar")).toBeNull()
      expect(formData.get("displayName")).toBeNull()
    })
  })

  describe("submitFeedback (multipart form with multiple files)", () => {
    it("should send feedback with screenshot", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockResponse = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "received" as const,
        ticketNumber: "TICKET-12345",
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockResponse)))

      const screenshot = new Blob(["screenshot"], { type: "image/png" })

      const result = await client.submitFeedback({
        category: "bug",
        message: "The button does not work when clicked",
        screenshot: screenshot,
        contactEmail: "reporter@example.com",
        priority: "high",
      })

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test.com/feedback",
        expect.objectContaining({
          method: "POST",
        })
      )

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      const formData = options.body as FormData

      expect(formData.get("category")).toBe("bug")
      expect(formData.get("message")).toBe(
        "The button does not work when clicked"
      )
      expect(formData.get("screenshot")).toBeInstanceOf(Blob)
      expect(formData.get("contactEmail")).toBe("reporter@example.com")
      expect(formData.get("priority")).toBe("high")

      expect(result).toEqual(mockResponse)
    })

    it("should send feedback with multiple attachments", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockResponse = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "received" as const,
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockResponse)))

      const attachment1 = new Blob(["log1"], { type: "text/plain" })
      const attachment2 = new Blob(["log2"], { type: "text/plain" })
      const attachment3 = new Blob(["log3"], { type: "text/plain" })

      await client.submitFeedback({
        category: "feature",
        message: "Please add dark mode support to the application",
        attachments: [attachment1, attachment2, attachment3],
      })

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      const formData = options.body as FormData

      expect(formData.get("category")).toBe("feature")
      expect(formData.get("attachments[0]")).toBeInstanceOf(Blob)
      expect(formData.get("attachments[1]")).toBeInstanceOf(Blob)
      expect(formData.get("attachments[2]")).toBeInstanceOf(Blob)
    })

    it("should use default priority when not specified", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      const mockResponse = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "received" as const,
      }

      fetchMock.mockResolvedValue(new Response(JSON.stringify(mockResponse)))

      await client.submitFeedback({
        category: "question",
        message: "How do I reset my password?",
      })

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
      const formData = options.body as FormData

      // Default priority is "medium" from schema
      expect(formData.get("priority")).toBe("medium")
    })

    it("should handle HTTP errors", async () => {
      const fetchMock = setupFetchMock()
      const client = new AuthClientFetch("https://api.test.com")

      fetchMock.mockResolvedValue(
        new Response("Service Unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        })
      )

      await expect(
        client.submitFeedback({
          category: "other",
          message: "Test message for error handling",
        })
      ).rejects.toThrow("HTTP Error: 503 Service Unavailable")
    })
  })

  describe("schema validation", () => {
    it("should validate email format on login", async () => {
      const client = new AuthClientFetch("https://api.test.com")

      await expect(
        client.loginUser({
          email: "invalid-email",
          password: "pass",
        })
      ).rejects.toThrow()
    })

    it("should validate email format on registration", async () => {
      const client = new AuthClientFetch("https://api.test.com")

      await expect(
        client.registerUser({
          email: "not-an-email",
          password: "pass123",
          displayName: "Test",
        })
      ).rejects.toThrow()
    })

    it("should validate category enum on feedback", async () => {
      const client = new AuthClientFetch("https://api.test.com")

      await expect(
        client.submitFeedback({
          category: "invalid" as "bug",
          message: "Test message",
        })
      ).rejects.toThrow()
    })

    it("should validate website URL format on profile update", async () => {
      const client = new AuthClientFetch("https://api.test.com")

      await expect(
        client.updateProfile({
          website: "not-a-valid-url",
        })
      ).rejects.toThrow()
    })
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
