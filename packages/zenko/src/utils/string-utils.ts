/**
 * Converts a string with hyphens to camelCase.
 * Example: "Links-Self" -> "LinksSelf"
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/-([a-zA-Z])/g, (_, letter) => letter.toUpperCase())
    .replace(/-+$/, "") // Remove trailing hyphens
}

/**
 * Capitalizes the first letter of a string.
 * Example: "linksSelf" -> "LinksSelf"
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
