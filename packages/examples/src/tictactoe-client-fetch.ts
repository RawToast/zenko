import {
  paths,
  securitySchemes,
  status,
  mark,
  errorMessage,
  type status as Status,
  type mark as Mark,
} from "./schema/tictactoe.gen"

type ZodSchema<T = unknown> = { parse: (json: unknown) => T }

/**
 * TicTacToe API client demonstrating bearer auth usage with generated security metadata.
 *
 * The tictactoe spec defines multiple security schemes:
 * - defaultApiKey: API key in header
 * - bearerHttpAuthentication: Bearer token (JWT)
 * - app2AppOauth / user2AppOauth: OAuth2 flows
 *
 * This client demonstrates how to use the generated `securitySchemes` metadata
 * to build type-safe auth headers with any HTTP library.
 */
export class TicTacToeClientFetch {
  private baseUrl: string
  private bearerToken?: string
  private apiKey?: string

  constructor(
    baseUrl: string = "https://api.tictactoe.example.com",
    auth?: { bearerToken?: string; apiKey?: string }
  ) {
    this.baseUrl = baseUrl
    this.bearerToken = auth?.bearerToken
    this.apiKey = auth?.apiKey
  }

  /**
   * Set the bearer token for authenticated requests.
   * Used by operations requiring `bearerHttpAuthentication`.
   */
  setBearerToken(token: string) {
    this.bearerToken = token
  }

  /**
   * Set the API key for authenticated requests.
   * Used by operations requiring `defaultApiKey`.
   */
  setApiKey(key: string) {
    this.apiKey = key
  }

  /**
   * Build auth headers based on the security scheme type.
   * Uses the generated `securitySchemes` metadata to determine header format.
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.bearerToken) {
      // Use scheme metadata to build the correct Authorization header
      const bearerScheme = securitySchemes.bearerHttpAuthentication
      if (bearerScheme.scheme === "bearer") {
        headers["Authorization"] = `Bearer ${this.bearerToken}`
      }
    }

    if (this.apiKey) {
      // Use scheme metadata to determine header name
      const apiKeyScheme = securitySchemes.defaultApiKey
      if (apiKeyScheme.in === "header") {
        headers[apiKeyScheme.name] = this.apiKey
      }
    }

    return headers
  }

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const { headers: userHeaders, ...restOptions } = options || {}
    const response = await fetch(url, {
      ...restOptions,
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
        ...(userHeaders as Record<string, string>),
      },
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      const parsed = errorMessage.safeParse(errorText)
      if (parsed.success) {
        throw new Error(`API Error: ${parsed.data}`)
      }
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    return responseSchema.parse(json)
  }

  /**
   * Get the whole board.
   * Security: defaultApiKey OR app2AppOauth (board:read)
   */
  async getBoard(): Promise<Status> {
    return this.request(paths.getBoard(), status)
  }

  /**
   * Get a single board square.
   * Security: bearerHttpAuthentication OR user2AppOauth (board:read)
   */
  async getSquare(row: string, column: string): Promise<Mark> {
    return this.request(paths.getSquare({ row, column }), mark)
  }

  /**
   * Set a single board square.
   * Security: bearerHttpAuthentication OR user2AppOauth (board:write)
   */
  async putSquare(row: string, column: string, value: Mark): Promise<Status> {
    return this.request(paths.putSquare({ row, column }), status, {
      method: "PUT",
      body: JSON.stringify(value),
    })
  }
}
