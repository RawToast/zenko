export function topologicalSort(schemas: Record<string, any>): string[] {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const result: string[] = []

  const visit = (name: string): void => {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      // Circular dependency detected, just add it anyway
      return
    }

    visiting.add(name)

    // Find dependencies of this schema
    const schema = schemas[name]
    const dependencies = extractDependencies(schema)

    // Visit dependencies first
    for (const dep of dependencies) {
      if (schemas[dep]) {
        visit(dep)
      }
    }

    visiting.delete(name)
    visited.add(name)
    result.push(name)
  }

  // Visit all schemas
  for (const name of Object.keys(schemas)) {
    visit(name)
  }

  return result
}

export function extractDependencies(schema: any): string[] {
  const dependencies: string[] = []

  const traverse = (obj: any): void => {
    if (typeof obj !== "object" || obj === null) return

    if (obj.$ref && typeof obj.$ref === "string") {
      const refName = extractRefName(obj.$ref)
      dependencies.push(refName)
      return
    }

    if (Array.isArray(obj)) {
      obj.forEach(traverse)
    } else {
      Object.values(obj).forEach(traverse)
    }
  }

  traverse(schema)
  return [...new Set(dependencies)] // Remove duplicates
}

export function extractRefName(ref: string): string {
  return ref.split("/").pop() || "Unknown"
}
