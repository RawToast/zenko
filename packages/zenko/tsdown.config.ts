import { defineConfig } from "tsdown"

export default defineConfig({
  // Main library entry point
  entry: {
    index: "index.ts",
    cli: "src/cli.ts",
    treaty: "src/treaty.ts",
  },

  // Output both CJS and ESM formats
  format: ["cjs", "esm"],

  // Generate TypeScript declaration files
  dts: {
    compilerOptions: {
      incremental: false,
    },
  },

  // Clean dist folder before building
  clean: true,

  // Generate sourcemaps for debugging
  sourcemap: true,

  // Split dependencies into separate chunks when needed
  splitting: true,

  // Target Node.js environment
  target: "node20",

  // Enable shims for better CJS/ESM compatibility
  shims: true,

  // External dependencies (don't bundle them)
  // CJS interop for better compatibility
  cjsDefault: true,

  // Minify output for smaller bundles
  minify: true,

  // Custom output extensions - use .cjs for CommonJS to avoid module conflicts
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    }
  },
  deps: {
    neverBundle: ["fs"],
  },
})
