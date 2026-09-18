import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["browser/browser.ts", "browser/source-adapter.ts", "browser/xlsx-fit.ts"],
    outDir: "output/browser",
    platform: "browser",
    target: "es2022",
    format: "esm",
    dts: false,
    deps: {
      neverBundle: [/^\/ooxml\//, "/pliflo-documents.mjs", "/source-adapter.mjs", "/xlsx-fit.mjs"],
    },
    outExtensions: () => ({ js: ".mjs" }),
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
