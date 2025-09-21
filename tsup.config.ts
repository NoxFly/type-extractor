import { defineConfig } from "tsup";

const copyrights = `
/**
 * @copyright 2025 NoxFly
 * @license MIT
 * @author NoxFly
 */
`.trim()

export default defineConfig({
    entry: {
        typeExtractor: "src/index.ts"
    },
    keepNames: true,
    minifyIdentifiers: false,
    name: "type-extractor",
    format: ["cjs"],
    dts: false,
    sourcemap: true,
    clean: true,
    outDir: "dist",
    target: "es2020",
    minify: false,
    splitting: false,
    shims: false,
    treeshake: false,
    banner: {
        js: copyrights,
    }
});
