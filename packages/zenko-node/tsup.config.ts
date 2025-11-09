import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "index.ts",
    cli: "src/cli.ts",
  },
  format: ["cjs", "esm"],
  dts: {
    compilerOptions: {
      incremental: false,
    },
  },
  clean: true,
  sourcemap: true,
  splitting: false,
  target: "node20",
  shims: true,
  external: ["fs", "js-yaml"],
  cjsInterop: true,
  minify: false,
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    }
  },
})
