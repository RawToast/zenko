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

  const lines: string[] = [
    `import { createTreatyClient, type TreatyClient } from "zenko/treaty";`,
    `import { ${exportNames.join(", ")} } from ${JSON.stringify(options.importPath)};`,
    "",
    "export const treatyRoutes = {",
    routeBody,
    "};",
    "",
    "export function createClient(",
    "  baseUrl: string,",
    "  init?: { fetch?: typeof fetch }",
    "): TreatyClient<typeof treatyRoutes> {",
    "  return createTreatyClient({",
    "    baseUrl,",
    "    routes: treatyRoutes,",
    "    fetch: init?.fetch,",
    "  })",
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
