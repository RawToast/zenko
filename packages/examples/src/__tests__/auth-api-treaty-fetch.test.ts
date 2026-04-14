import { afterEach, describe, expect, it, mock } from "bun:test"
import { TreatyErrorResult } from "zenko"
import { TreatySuccess } from "zenko/treaty"
import { createClient } from "~/schema/auth-api.treaty.gen"

describe("Auth API treaty client (fetch)", () => {
  const origin = "https://api.test.com"
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("posts login and returns success", async () => {
    const fetchMock = setupFetchMock()
    const mockPayload = {
      accessToken: "tok",
      tokenType: "Bearer" as const,
      expiresIn: 3600,
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const body = {
      email: "a@b.com",
      password: "secret",
      staySignedIn: true,
    }
    const result = await client.loginUser({ body })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/auth/login`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      })
    )
    expect(result.kind).toBe("success")
    const success = result as TreatySuccess<number, typeof mockPayload>
    expect(success.data).toEqual(mockPayload)
    expect(success.status).toBe(200)
  })

  it("sends FormData for multipart feedback without forcing JSON content-type", async () => {
    const fetchMock = setupFetchMock()
    const mockPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      status: "received" as const,
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPayload), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    )

    const form = new FormData()
    form.set("category", "bug")
    form.set("message", "Something is wrong here ok")

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.submitFeedback({ body: form })

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/feedback`,
      expect.objectContaining({
        method: "POST",
        body: form,
      })
    )
    const call = fetchMock.mock.calls[0]
    const init = call?.[1] as RequestInit & { headers?: Headers }
    expect(init.headers).toBeUndefined()
    expect(result.kind).toBe("success")
    const success = result as TreatySuccess<number, typeof mockPayload>
    expect(success.data).toEqual(mockPayload)
    expect(success.status).toBe(201)
  })

  it("patches profile and returns updated user", async () => {
    const fetchMock = setupFetchMock()
    const mockPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "a@b.com",
      displayName: "Test",
    }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.updateProfile({ body: { displayName: "New" } })

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/settings/profile`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ displayName: "New" }),
      })
    )
    expect(result.kind).toBe("success")
    const success = result as TreatySuccess<number, typeof mockPayload>
    expect(success.data).toEqual(mockPayload)
    expect(success.status).toBe(200)
  })

  it("returns error branch for non-OK login", async () => {
    const fetchMock = setupFetchMock()
    const errorBody = { code: 401, message: "Invalid credentials" }

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(errorBody), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    )

    const client = createClient(origin, {
      fetch: fetchMock as unknown as typeof fetch,
    })
    const result = await client.loginUser({
      body: {
        email: "x@y.com",
        password: "bad",
      },
    })

    expect(result.kind).toBe("error")
    const error = result as TreatyErrorResult<number, typeof errorBody>
    expect(error.error).toEqual(errorBody)
    expect(error.status).toBe(401)
  })
})

function setupFetchMock() {
  const fetchMock = mock<typeof fetch>()
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
