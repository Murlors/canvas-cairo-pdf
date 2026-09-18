# Architecture

## Rendering pipeline

Source document → TypeScript browser layout → versioned Canvas recordings → Rust validation → Cairo/Pango multi-page PDF.

| Responsibility | Entry point |
| --- | --- |
| Document adapters and page models | `browser/source-adapter.ts` |
| Canvas recording | `browser/browser.ts` |
| TypeScript protocol and boundary validation | `browser/protocol.ts` |
| Native decoding, drawing and output | `crates/replay/src/` |
| Preparation, cancellation and sessions | `scripts/prepare.ts`, `process-tree.ts`, `session-store.ts` |
| Development host orchestration | `scripts/run-pages.ts` |
| System WKWebView host | `hosts/macos/wk-harness.swift` |
| Pinned OOXML extensions | `compat/ooxml/`, `scripts/build-ooxml-runtime.ts` |
| Optional Pliflo integration adapter | `scripts/build-pliflo-reference.ts` |
| Native library packaging | `scripts/package-native.ts` (macOS only) |
| Fixtures and diagnostics | `tools/` |

## Ownership and interfaces

Browser adapters parse documents and determine layout. The Rust library and CLI consume drawing recordings, not Office documents, and do not depend on Node, Tauri or WebView. They share validation and drawing code. File outputs use exclusive creation, refuse existing paths, and remove the newly created partial PDF on failure. A single PDF surface handles all pages, with dimensions set per page. Manifest file entries are loaded sequentially.

DOCX and PPTX use the pinned OOXML package directly. XLSX uses its worksheet renderer with used-range/row-height pagination on landscape A4. Fit mode scales worksheet width; actual mode does not provide horizontal tiling. All-sheet selection excludes hidden sheets, while explicit indexes can select them. Chart/dialog sheets and sheets reporting parse errors are skipped.

Markdown and images currently use the optional integration adapter built from a separate local Pliflo checkout. The adapter also supplies Office worker-reference comparisons. It requires the checkout's dependencies at runtime and may retain multiple page canvases. It is not needed for the independent Office path or Rust replay.

## Hosts, build and lifecycle

Vite+ bundles browser TypeScript. The full build also prepares the hash-checked OOXML runtime and release Rust executable, and compiles the Swift host on macOS. Native dependencies are located through `pkg-config`. A browser-only build is insufficient for document rendering.

The development runner serves local assets on a loopback HTTP server. macOS defaults to WKWebView; other platforms default to Playwright Chromium. Chromium requires a separately installed browser binary. These development hosts are not a packaged desktop integration.

Pages are acknowledged and spooled sequentially to a unique session under `output/bridge-pages/`. Diagnostics retain recordings, reference PNGs and page PDFs; normal preparation disables them. Base64 image payloads and per-page/source allocations mean sequential spooling is not a total memory bound.

`prepareDocument` uses a module-local single-task guard, timeout and abort signal. PDF input is returned unchanged, with a nullable parsed page count. Non-PDF input runs in a managed child process; success retains its generated PDF. Failure cleanup waits for termination and only removes owned sessions when safe.

POSIX cancellation uses a dedicated process group; Windows targets the current child-process tree. Windows crash-orphaned sessions are conservatively retained because reliable automatic reclamation is not implemented. The standalone native API is independent of this host lifecycle.

## Current boundaries

Browser and Pango resolve fonts separately. Font availability can change layout and output. Unsupported Canvas drawing fails explicitly; there is no automatic whole-page raster fallback. Protocol validation is not a complete hostile-document sandbox.

CI covers Linux/macOS builds and tests, Linux Chromium rendering and Windows native tests. Cross-machine font behavior, full desktop integration and clean-machine packages require separate validation. Native packaging currently supports macOS only.

See [setup and usage](../README.md), [protocol](protocol.md), [verification](../CONTRIBUTING.md) and [release preparation](releasing.md).
