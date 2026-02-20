#!/usr/bin/env bun

import type { Dirent } from "node:fs"
import {
  readdir,
  type readdir as readdirType,
  rm,
  type rm as rmType,
} from "node:fs/promises"
import { join, relative } from "node:path"

export const directoriesToNuke = new Set(["node_modules", "dist", "coverage"])

export type FsOperations = {
  readdir: typeof readdirType
  rm: typeof rmType
}

const defaultFs: FsOperations = { readdir, rm }

export async function scanDirectory(
  dir: string,
  fs: Pick<FsOperations, "readdir"> = defaultFs
): Promise<{ targets: string[]; subdirs: string[] }> {
  const targets: string[] = []
  const subdirs: string[] = []

  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => [] as Dirent[])

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = join(dir, entry.name)

      if (directoriesToNuke.has(entry.name)) {
        targets.push(fullPath)
      } else if (!entry.name.startsWith(".")) {
        subdirs.push(fullPath)
      }
    }
  }

  return { targets, subdirs }
}

/**
 * Recursively find all directories to nuke
 * @param root - The root directory to start from
 * @returns A list of directories to nuke
 */
export async function findAllTargets(
  root: string,
  fs: Pick<FsOperations, "readdir"> = defaultFs
): Promise<string[]> {
  const allTargets: string[] = []

  const processLevel = async (dirs: string[]): Promise<void> => {
    if (dirs.length === 0) {
      return
    }

    const results = await Promise.all(dirs.map((d) => scanDirectory(d, fs)))

    const nextDirs: string[] = []
    for (const { targets, subdirs } of results) {
      allTargets.push(...targets)
      nextDirs.push(...subdirs)
    }

    return processLevel(nextDirs)
  }

  await processLevel([root])
  return allTargets
}

/**
 * Find all .gen.ts files in packages/examples directory
 * @param root - The root directory to start from
 * @returns A list of generated file paths
 */
export async function findGeneratedFiles(root: string): Promise<string[]> {
  const generatedFiles: string[] = []
  const examplesDir = join(root, "packages", "examples")

  const walkDir = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(
      () => [] as Dirent[]
    )

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walkDir(fullPath)
      } else if (entry.isFile() && entry.name.endsWith(".gen.ts")) {
        generatedFiles.push(fullPath)
      }
    }
  }

  await walkDir(examplesDir).catch(() => {
    // Ignore errors - directory might not exist
  })

  return generatedFiles
}

export async function main(fs: FsOperations = defaultFs) {
  const [dirTargets, fileTargets] = await Promise.all([
    findAllTargets(".", fs),
    findGeneratedFiles("."),
  ])

  const allTargets = [...dirTargets, ...fileTargets]

  if (allTargets.length === 0) {
    console.log("Nothing to remove!")
    return
  }

  console.log(`Deleting ${allTargets.length} items...`)

  await Promise.all(
    allTargets.map(async (target) => {
      try {
        await fs.rm(target, { recursive: true, force: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stdout.write(`  Failed: ${target} - ${message}\n`)
      }
    })
  )

  console.log("Cleanup complete!")
}

if (import.meta.main) {
  await main()
}
