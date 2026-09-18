# canvas-cairo-pdf

[简体中文](README.zh-CN.md)

Local document-to-PDF rendering with TypeScript document adapters and a Rust Cairo/Pango backend. Browser layout produces versioned Canvas recordings; the native renderer turns supported text, vectors and images into multi-page PDFs. The project does not submit print jobs or promise complete Microsoft Office/WPS layout fidelity.

## Current functionality

| Input | Path and limits |
| --- | --- |
| DOCX | Independent OOXML adapter: multi-page documents, per-page sizes, text, tables and images, subject to supported drawing operations. |
| PPTX | Independent OOXML adapter: one output page per slide. Unsupported drawing operations fail explicitly. |
| XLSX | Independent OOXML adapter: used-range pagination on landscape A4, width fitting or actual scale, and worksheet selection. Not a complete Excel print engine. |
| Markdown; PNG, JPEG, WebP, GIF, BMP | Require the optional local Pliflo integration adapter below. These adapters are not standalone. |
| PDF | `prepareDocument` returns the original file unchanged; page count is `null` if parsing fails. This does not certify readability or printability. The `render` command does not accept PDF input. |
| Canvas recording JSON | Standalone Rust CLI or library; no browser, Node or Bun required at runtime. Native libraries are still required. |

The development hosts are system WKWebView on macOS and Playwright Chromium. CI covers Linux/macOS builds and tests, a Linux Chromium smoke run, and Windows native tests. Font behavior across target machines, full desktop integration and clean-machine distribution still require validation.

## Build from a fresh clone

Install Node **24.12 or newer**, Bun **1.4.2**, Rust stable with Cargo/rustfmt, and the native dependencies below. Bun installs locked JavaScript dependencies; Node runs TypeScript host scripts. Python is only required for fixtures and diagnostic tools.

```sh
git clone https://github.com/Murlors/canvas-cairo-pdf.git
cd canvas-cairo-pdf

# macOS
brew install pkgconf cairo pango
# Install Xcode Command Line Tools if missing: xcode-select --install

# Debian/Ubuntu alternative:
# sudo apt-get update
# sudo apt-get install -y pkg-config libcairo2-dev libpango1.0-dev fonts-noto-cjk

bun install --frozen-lockfile
bun run build
bun run check
bun run test
```

Cairo/Pango must be discoverable through `pkg-config`; no fixed Homebrew prefix is required. Install fonts appropriate to the document's languages.

**Run the full build before rendering or running `bun run test`.** It creates the browser modules, version/hash-checked OOXML runtime, release Rust renderer, and (on macOS) Swift WKWebView host. Cross-language tests invoke that release renderer. `bun run build:browser` alone does not build the renderer or OOXML runtime.

Install Chromium separately when using that host:

```sh
bunx --no-install playwright-core install chromium
# Linux, including browser system dependencies:
# bunx --no-install playwright-core install --with-deps chromium
```

Windows native work uses an MSYS2 UCRT64 shell with `mingw-w64-ucrt-x86_64-rust`, `mingw-w64-ucrt-x86_64-pkgconf`, `mingw-w64-ucrt-x86_64-cairo` and `mingw-w64-ucrt-x86_64-pango`, followed by `cargo test --workspace --locked`. Do not mix MSVC and MinGW libraries. The complete TypeScript/Chromium workflow on Windows needs separate validation; see [CI](.github/workflows/check.yml).

## Render documents

From the repository root, after the full build:

```sh
bun run render /absolute/path/report.docx
bun run render /absolute/path/slides.pptx chromium
PLIFLO_XLSX_SCALE=fit PLIFLO_XLSX_SHEET=0 bun run render /absolute/path/workbook.xlsx
```

The default engine is `webkit` on macOS and `chromium` elsewhere. Output is a unique `output/bridge-pages/<session>/pages/document.pdf`. The final JSON line reports the session directory, engine, page count and rendering time. Diagnostics are enabled by default and include page recordings, Canvas PNGs and page PDFs; `PLIFLO_DIAGNOSTICS=0` disables those extra artifacts.

The development preparation API provides timeout, cancellation and single-task admission:

```ts
import { prepareDocument } from './scripts/prepare.ts';

const result = await prepareDocument('/absolute/path/report.docx', {
  timeoutMs: 120000,
  signal: new AbortController().signal,
});
console.log(result.pdfPath, result.pages, result.generated);
```

Run a script using this API with Node from the checkout. Non-PDF inputs require the full build and a host. It disables page diagnostics, retains successful generated PDFs, and reports `BUSY`, `CANCELLED`, `TIMEOUT` or `RENDER_FAILED` for managed preparation failures. The single-task guard is module-local, not a cross-process lock.

### Optional Pliflo integration adapter

`scripts/build-pliflo-reference.ts` builds an adapter from a separate local Pliflo checkout's `src/lib/documents.ts`. It is optional for independent Office rendering and native replay, but currently required for Markdown/images and Office worker-reference comparisons. Install that checkout's own dependencies first; the host serves its `marked` module at runtime.

```sh
# First install dependencies in /absolute/path/Pliflo using that project's instructions.
PLIFLO_SOURCE_ROOT=/absolute/path/Pliflo bun run build:reference
PLIFLO_SOURCE_ROOT=/absolute/path/Pliflo bun run render /absolute/path/notes.md
PLIFLO_SOURCE_ROOT=/absolute/path/Pliflo bun run render /absolute/path/photo.png
```

The generated module and source hash live in `output/pliflo-reference/`. Keep `PLIFLO_SOURCE_ROOT` set during rendering. The builder fails when expected source boundaries do not match; arbitrary Pliflo revisions are not guaranteed to work. Rebuild after source changes. Local Markdown image access is restricted to supported image files within the source document's directory tree. See [third-party notices](THIRD_PARTY_NOTICES.md) for adapter ownership.

### Environment options

The `PLIFLO_*` names are the current configuration interface.

| Variable | Meaning |
| --- | --- |
| `PLIFLO_ENGINE` | `webkit` or `chromium`; explicit argument/API option takes precedence. WKWebView requires macOS. |
| `PLIFLO_DIAGNOSTICS` | `0` disables page diagnostics. `prepareDocument` always sets it to `0`. |
| `PLIFLO_XLSX_SCALE` | `fit` (default), `fit-width` (same width-fitting path), or `actual`. |
| `PLIFLO_XLSX_SHEET` | Unset selects all visible worksheets; a zero-based numeric index selects one, including a hidden sheet. |
| `PLIFLO_IMAGE_SIZING` | `fit` (default) or `actual`, through the integration adapter. |
| `PLIFLO_SOURCE_ROOT` | Local Pliflo checkout; defaults to sibling `../Pliflo`. |
| `PLIFLO_WORKER_REFERENCE` | `1` routes Office input through the integration adapter's reference functions. |
| `PLIFLO_FONT_DIAGNOSTICS` | Presence enables native CLI requested/actual font diagnostics, without document text. |
| `PLIFLO_FONT_ALIASES` | JSON file mapping requested font names to replacements in the native CLI. |
| `PLAYWRIGHT_MODULE` | Chromium module import override; default `playwright-core`. |

## Standalone native replay

With Rust and Cairo/Pango installed:

```sh
cargo build --release --locked
# Existing recording/manifest and a new PDF filename:
./target/release/canvas-cairo-pdf /absolute/path/commands.json /absolute/path/new.pdf
```

Windows uses an `.exe` suffix. The output parent must exist and the output path must not exist. Input is a single recording or page manifest; see the [protocol](docs/protocol.md). The CLI does not parse Office files. Rust embedders use `canvas_cairo_replay::render_file` or `render_input` with explicit `RenderOptions`.

## Verification and limitations

Install Python 3.12+ and Poppler (`brew install poppler` or `sudo apt-get install poppler-utils`), then:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python tools/make-fixtures.py
.venv/bin/python tools/make-representative.py
.venv/bin/python tools/make-office-fixtures.py
bun run test:lifecycle
.venv/bin/python tools/acceptance.py
.venv/bin/python tools/check-xlsx-fit.py
```

Document checks also require the full build and selected host. Use the Chromium setup on Linux; `PLIFLO_ENGINE=chromium` selects it on macOS too. Keep diagnostics enabled for page comparisons. See [CONTRIBUTING.md](CONTRIBUTING.md) for other tools.

- Only a subset of Canvas is supported; complex Office content can fail even when the browser displays it.
- XLSX uses landscape A4 and used-range/row-height pagination, not full Excel print settings, print areas or horizontal page tiling. Actual-scale wide content can clip. Chart sheets, dialog sheets and sheets reporting parse errors are skipped.
- Browser and Pango font resolution are separate; available fonts affect layout and output.
- Images use Base64 PNG. Sequential page spooling does not bound all source/recording memory; the integration adapter can retain multiple page canvases.
- Windows cancellation targets active child-process trees. Crash-orphaned sessions are retained conservatively; reliable automatic reclamation is not implemented there.
- Synthetic fixtures/browser comparisons are not Office layout goldens. Descendant RSS excludes some system-managed WebKit helpers.
- Native packaging is macOS-only. Clean-machine acceptance, distribution signing and a complete bundled-library license audit remain outstanding.

## Project map and license

`browser/`: TypeScript adapters/recording; `crates/replay/`: Rust library/CLI; `scripts/`: build and development orchestration; `hosts/macos/`: WKWebView; `compat/ooxml/`: pinned extensions; `tools/`: Python checks. Generated files live in `output/`, synthetic inputs in `fixtures/`.

[Agent rules](AGENTS.md) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/architecture.md) · [Protocol](docs/protocol.md) · [Release preparation](docs/releasing.md)

Project-owned code uses [MIT](LICENSE). Dependencies, adapter-derived code, fonts and documents retain their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The package is private and has no npm publishing workflow.
