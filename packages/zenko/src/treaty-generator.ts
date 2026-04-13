import { pathToFileURL } from "node:url"

import {
  buildTreatyRouteTree,
  emitTreatyRouteTree,
  type OperationMeta,
} from "./utils/treaty-tree"

export function generateTreatyModuleFromMetadata(
  metadata: Record<string, OperationMeta>,
  options: { importPath: string }
): string {
  const tree = buildTreatyRouteTree(metadata)
  if (!tree.ok) {
    throw tree.error
  }
  const exportNames = Object.keys(metadata).sort()
  const routeBody = emitTreatyRouteTree(tree.value)

  const metaLiteral = JSON.stringify(metadata)

  const lines: string[] = [
    `import {`,
    `  createTreatyClient,`,
    `  type TreatyOperationsClient,`,
    `  type TreatyOperationMeta,`,
    `  type TreatyRouteTreeClient,`,
    `} from "zenko/treaty";`,
    `import { ${exportNames.join(", ")} } from ${JSON.stringify(options.importPath)};`,
    "",
    `export const operations = {`,
    exportNames.map((n) => `  ${n},`).join("\n"),
    `} as const;`,
    "",
    `export const operationMetadata = ${metaLiteral} as const satisfies Record<keyof typeof operations, TreatyOperationMeta>;`,
    "",
    "export const treatyRoutes = {",
    routeBody,
    "};",
    "",
    "export function createClient(",
    "  baseUrl: string,",
    "  init?: { fetch?: typeof fetch }",
    "): TreatyOperationsClient<typeof operations, typeof operationMetadata> & {",
    "  /**",
    "   * Nested path aliases for Eden-style chaining. Lighter runtime than",
    "   * `operations` (no operationMetadata-aware Zod / specStatus handling).",
    "   */",
    "  $routes: TreatyRouteTreeClient<typeof treatyRoutes>;",
    "} {",
    "  const client = createTreatyClient({",
    "    baseUrl,",
    "    operations,",
    "    operationMetadata,",
    "    options: { fetch: init?.fetch },",
    "  })",
    "  const routes = createTreatyClient({",
    "    baseUrl,",
    "    routes: treatyRoutes,",
    "    fetch: init?.fetch,",
    "  })",
    "  return Object.assign(client, { $routes: routes })",
    "}",
    "",
  ]

  return lines.join("\n")
}

export async function generateTreatyModule(options: {
  inputFile: string
  importPath: string
}): Promise<string> {
  const url = pathToFileURL(options.inputFile).href
  const mod = await import(url)

  if (!mod.operationMetadata) {
    throw new Error(
      `Missing operationMetadata export in ${options.inputFile} — regenerate with the latest Zenko`
    )
  }

  const metadata = mod.operationMetadata as Record<string, OperationMeta>
  return generateTreatyModuleFromMetadata(metadata, {
    importPath: options.importPath,
  })
}
