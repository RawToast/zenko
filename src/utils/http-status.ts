const statusNameMap: Record<string, string> = {
  "400": "badRequest",
  "401": "unauthorized",
  "402": "paymentRequired",
  "403": "forbidden",
  "404": "notFound",
  "405": "methodNotAllowed",
  "406": "notAcceptable",
  "407": "proxyAuthenticationRequired",
  "408": "requestTimeout",
  "409": "conflict",
  "410": "gone",
  "411": "lengthRequired",
  "412": "preconditionFailed",
  "413": "payloadTooLarge",
  "414": "uriTooLong",
  "415": "unsupportedMediaType",
  "416": "rangeNotSatisfiable",
  "417": "expectationFailed",
  "418": "imATeapot",
  "421": "misdirectedRequest",
  "422": "unprocessableEntity",
  "423": "locked",
  "424": "failedDependency",
  "425": "tooEarly",
  "426": "upgradeRequired",
  "428": "preconditionRequired",
  "429": "tooManyRequests",
  "431": "requestHeaderFieldsTooLarge",
  "451": "unavailableForLegalReasons",
  "500": "internalServerError",
  "501": "notImplemented",
  "502": "badGateway",
  "503": "serviceUnavailable",
  "504": "gatewayTimeout",
  "505": "httpVersionNotSupported",
  "506": "variantAlsoNegotiates",
  "507": "insufficientStorage",
  "508": "loopDetected",
  "510": "notExtended",
  "511": "networkAuthenticationRequired",
} as const

export type StatusCategory = "client" | "server" | "default" | "unknown"

export function mapStatusToIdentifier(status: string): string {
  if (status === "default") return "defaultError"

  const trimmed = status.trim()
  const mapped = statusNameMap[trimmed]
  if (mapped) return mapped

  if (/^\d{3}$/.test(trimmed)) {
    return `status${trimmed}`
  }

  const sanitized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

  if (!sanitized) return "unknownError"

  const parts = sanitized.split(/\s+/)
  const [first, ...rest] = parts
  const candidate =
    first +
    rest
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join("")

  if (!candidate) return "unknownError"

  return /^[a-zA-Z_$]/.test(candidate)
    ? candidate
    : `status${candidate.charAt(0).toUpperCase()}${candidate.slice(1)}`
}

export function getStatusCategory(status: string): StatusCategory {
  if (status === "default") return "default"

  const code = Number(status)
  if (!Number.isInteger(code)) return "unknown"

  if (code >= 400 && code <= 499) return "client"
  if (code >= 500 && code <= 599) return "server"

  return "unknown"
}

export function isErrorStatus(status: string): boolean {
  if (status === "default") return true
  const code = Number(status)
  if (!Number.isInteger(code)) return false
  return code >= 400
}
