import { z } from "zod"
import {
  paths,
  LoginCredentials,
  RegistrationForm,
  AvatarUpload,
  ProfileUpdate,
  FeedbackForm,
  AuthToken,
  User,
  AvatarResponse,
  FeedbackResponse,
  Error as ErrorSchema,
} from "./schema/auth-api.gen"

type ZodSchema<T = unknown> = { parse: (json: unknown) => T }

// Input types allow optional fields with defaults
type LoginCredentialsInput = z.input<typeof LoginCredentials>
type FeedbackFormInput = z.input<typeof FeedbackForm>

export class AuthClientFetch {
  private baseUrl: string

  constructor(baseUrl: string = "https://api.example.com") {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    responseSchema: ZodSchema<T>,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, options)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const error = ErrorSchema.safeParse(errorData)
      if (error.success) {
        throw new Error(`API Error: ${error.data.message} (${error.data.code})`)
      }
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    const json = await response.json()
    return responseSchema.parse(json)
  }

  /**
   * Login with URL-encoded form data
   */
  async loginUser(credentials: LoginCredentialsInput): Promise<AuthToken> {
    const path = paths.loginUser()
    const validated = LoginCredentials.parse(credentials)

    const body = new URLSearchParams()
    body.append("email", validated.email)
    body.append("password", validated.password)
    if (validated.staySignedIn !== undefined) {
      body.append("staySignedIn", String(validated.staySignedIn))
    }

    return this.request(path, AuthToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })
  }

  /**
   * Register with URL-encoded form data
   */
  async registerUser(registration: RegistrationForm): Promise<User> {
    const path = paths.registerUser()
    const validated = RegistrationForm.parse(registration)

    const body = new URLSearchParams()
    body.append("email", validated.email)
    body.append("password", validated.password)
    body.append("displayName", validated.displayName)
    if (validated.acceptTerms !== undefined) {
      body.append("acceptTerms", String(validated.acceptTerms))
    }
    if (validated.referralCode !== undefined) {
      body.append("referralCode", validated.referralCode)
    }

    return this.request(path, User, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })
  }

  /**
   * Upload avatar with multipart form data
   */
  async uploadAvatar(upload: AvatarUpload): Promise<AvatarResponse> {
    const path = paths.uploadAvatar()
    const validated = AvatarUpload.parse(upload)

    const formData = new FormData()
    formData.append("image", validated.image as Blob)
    if (validated.cropX !== undefined) {
      formData.append("cropX", String(validated.cropX))
    }
    if (validated.cropY !== undefined) {
      formData.append("cropY", String(validated.cropY))
    }
    if (validated.cropSize !== undefined) {
      formData.append("cropSize", String(validated.cropSize))
    }

    return this.request(path, AvatarResponse, {
      method: "POST",
      body: formData,
    })
  }

  /**
   * Update profile with multipart form data (supports optional avatar)
   */
  async updateProfile(update: ProfileUpdate): Promise<User> {
    const path = paths.updateProfile()
    const validated = ProfileUpdate.parse(update)

    const formData = new FormData()
    if (validated.displayName !== undefined) {
      formData.append("displayName", validated.displayName)
    }
    if (validated.bio !== undefined) {
      formData.append("bio", validated.bio)
    }
    if (validated.website !== undefined) {
      formData.append("website", validated.website)
    }
    if (validated.avatar !== undefined) {
      formData.append("avatar", validated.avatar as Blob)
    }
    if (validated.location !== undefined) {
      formData.append("location", validated.location)
    }
    if (validated.notifications !== undefined) {
      formData.append("notifications", JSON.stringify(validated.notifications))
    }

    return this.request(path, User, {
      method: "PATCH",
      body: formData,
    })
  }

  /**
   * Submit feedback with multipart form data (supports file attachments)
   */
  async submitFeedback(feedback: FeedbackFormInput): Promise<FeedbackResponse> {
    const path = paths.submitFeedback()
    const validated = FeedbackForm.parse(feedback)

    const formData = new FormData()
    formData.append("category", validated.category)
    formData.append("message", validated.message)
    if (validated.screenshot !== undefined) {
      formData.append("screenshot", validated.screenshot as Blob)
    }
    if (validated.attachments !== undefined) {
      validated.attachments.forEach((file, index) => {
        formData.append(`attachments[${index}]`, file as Blob)
      })
    }
    if (validated.contactEmail !== undefined) {
      formData.append("contactEmail", validated.contactEmail)
    }
    if (validated.priority !== undefined) {
      formData.append("priority", validated.priority)
    }

    return this.request(path, FeedbackResponse, {
      method: "POST",
      body: formData,
    })
  }
}
