import { defineConfig } from "tsup"

export default defineConfig({
  // Main library entry point
  entry: {
    // index: "index.ts",
    cli: "src/cli.ts",
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
  splitting: false,

  // Target Node.js environment
  target: "node18",

  // Enable shims for better CJS/ESM compatibility
  shims: true,

  // External dependencies (don't bundle them)
  external: ["fs", "js-yaml", "zod"],

  // CJS interop for better compatibility
  cjsInterop: true,

  // Minify output for smaller bundles
  minify: false, // Keep readable for now

  // Custom output extensions - use .cjs for CommonJS to avoid module conflicts
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    }
  },
})
