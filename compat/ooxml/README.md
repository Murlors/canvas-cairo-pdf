# OOXML worksheet geometry adapter

The pinned @silurus/ooxml 0.87.0 package does not expose the worksheet geometry required for fit-to-page calculations. This build-time extension reuses its renderer's font metrics, column ranges and pixel rounding instead of duplicating the algorithm.

`scripts/build-ooxml-runtime.ts` verifies the upstream version and module SHA-256, copies the runtime and license notices to `output/ooxml-runtime/`, and appends this extension. It does not modify node_modules or rewrite modules during HTTP requests.

Consumers use `worksheetRenderWidth(sheet, columns, scale)` from the generated `xlsx-print-geometry.mjs`. The result includes the row header. Internal upstream symbols are confined to this directory.

When changing the pinned dependency, review this extension and its hash, then run `bun run test` and `python tools/check-xlsx-fit.py`. This is a project-maintained adapter, not an upstream public API. Keep the .js format because the fragment is appended directly to a JavaScript module.
