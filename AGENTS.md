# Agent guide

## Scope and safety

- This project renders local documents and Canvas recordings to PDF. It does not print. Never submit real print jobs as verification.
- Keep source documents read-only. Do not upload private documents, fonts or diagnostic content. Keep generated development artifacts under `output/`; clean only sessions whose ownership is established. Native API/CLI output uses the caller's explicit new PDF path.
- Preserve unrelated working-tree changes. Edit and stage only authorized files; commits, pushes and releases require authorization. Use focused Chinese Conventional Commit messages.
- Do not claim full Office/WPS fidelity or platform acceptance from compilation or a subset of fixtures. Report the host, inputs and checks actually exercised.

## Architecture

- `browser/` owns strict TypeScript adapters, recording and protocol validation; `crates/replay/` owns Rust decoding, validation and Cairo/Pango output; `scripts/` owns build/development orchestration; `hosts/` isolates platform hosting; `tools/` owns Python verification.
- Browser adapters determine layout; Cairo/Pango replays drawing commands. Keep format-specific layout out of the native renderer and reuse existing boundaries.
- Keep TypeScript definitions/runtime validation, Rust decoding/rendering and cross-language tests consistent. Assertions do not validate external input. Unsupported drawing must fail explicitly, without silent omissions or automatic whole-page raster fallback.
- Keep OOXML extensions in `compat/ooxml/` and the build step. Preserve upstream version/hash checks and licenses. Do not edit installed dependencies or rewrite them during HTTP requests.
- Preserve `scripts/build-pliflo-reference.ts`: this optional integration adapter builder currently serves Markdown/images and Office worker-reference checks. Resolve its source through `PLIFLO_SOURCE_ROOT`.
- Preserve current `PLIFLO_*` configuration names and semantics. Avoid machine-specific source paths or native-library prefixes.
- Keep the standalone Rust library/CLI independent of Node and browser hosts. Document conversion currently requires a development host and is not a packaged desktop integration.
- Use Vite+ for TypeScript checks/tests/bundling, Bun's lockfile for JavaScript dependencies, and Cargo for Rust. Locate Cairo/Pango through `pkg-config`; isolate platform APIs.
- Keep strict types; do not suppress errors with `any` or `ts-nocheck`. Add concise Chinese comments for non-obvious boundaries and public APIs, matching the source convention.

## Correctness and verification

- Preserve source identity, page count, dimensions and text. Investigate missing/clipped content and text corruption separately from small raster/font-weight differences.
- Preserve output overwrite refusal and cleanup of newly created partial PDFs. Keep cancellation, timeout and incomplete work observable. The preparation guard is module-local, not a global lock.
- Run `bun run build` before tests that invoke the release renderer. Routine checks: `bun run check`, `bun run test`, `git diff --check`; add relevant document regressions from `CONTRIBUTING.md`.
- Layout/font/drawing changes require actual PDF text, dimensions and appropriate visual comparisons. Lifecycle changes require `bun run test:lifecycle` with its fixture and host prerequisites.
- Synthetic fixtures are not Office layout goldens; same-host relocation is not clean-machine validation; sampled descendant RSS is not total WebKit/application memory.
- Current limits include partial Canvas support, separate browser/native font resolution, Base64 images, adapter-dependent Markdown/images, Windows orphan-session recovery and macOS-only packaging. Verify behavior before changing these claims.

## Documentation and distribution

- Keep `README.md` as the primary English guide and `README.zh-CN.md` aligned. Architecture, protocol and release details belong in their respective `docs/` files.
- Update current documentation when behavior/setup changes. Document existing commands and state external prerequisites explicitly.
- Root MIT covers project-owned code only. Preserve upstream notices, review adapter-derived ownership, and collect licenses/source-access materials for the actual native bundle before distribution. Do not bundle system fonts or unauthorized documents.
