/**
 * Checks if a string is a valid JavaScript identifier
 */
export function isValidJSIdentifier(name: string): boolean {
  // Check if name is empty
  if (!name) return false

  // Check if first character is valid (letter, underscore, or $)
  const firstChar = name.at(0)
  if (firstChar === undefined) return false
  if (!/[a-zA-Z_$]/.test(firstChar)) return false

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) return false

  // Check if it's a reserved word
  const reservedWords = new Set([
    "abstract",
    "arguments",
    "await",
    "boolean",
    "break",
    "byte",
    "case",
    "catch",
    "char",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "double",
    "else",
    "enum",
    "eval",
    "export",
    "extends",
    "false",
    "final",
    "finally",
    "float",
    "for",
    "function",
    "goto",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "int",
    "interface",
    "let",
    "long",
    "native",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "short",
    "static",
    "super",
    "switch",
    "synchronized",
    "this",
    "throw",
    "throws",
    "transient",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "volatile",
    "while",
    "with",
    "yield",
    "async",
  ])

  return !reservedWords.has(name)
}

/**
 * Formats a property name for use in JavaScript/TypeScript object literals
 * Quotes the name if it's not a valid JavaScript identifier
 */
export function formatPropertyName(name: string): string {
  return isValidJSIdentifier(name) ? name : `"${name}"`
}
