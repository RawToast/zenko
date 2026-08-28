/**
 * Converts a string with hyphens, periods, or spaces to a camelCase
 * JavaScript identifier. Invalid characters (e.g. parentheses) are removed.
 * Example: "Links-Self" -> "LinksSelf"
 * Example: "Arbitrum.Withdrawal" -> "ArbitrumWithdrawal"
 * Example: "BlockScoutWeb.API.V2.foo" -> "BlockScoutWebAPIV2Foo"
 * Example: "search (2)" -> "search2"
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[()]/g, "")
    .replace(/[.\-\s]+([a-zA-Z0-9])/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9_$]/g, "")
}

/**
 * Capitalizes the first letter of a string.
 * Example: "linksSelf" -> "LinksSelf"
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
