# Contributing

Start with the [README build instructions](README.md#build-from-a-fresh-clone). Reproduce problems with shareable synthetic documents. Include format, host engine, OS, dependency versions, expected/actual page counts and dimensions, and relevant visual or extracted-text evidence. Do not submit private documents, system fonts or generated diagnostic directories.

## Build and focused verification

```sh
bun install --frozen-lockfile
bun run build
bun run check
bun run test
git diff --check
```

The build requires Rust, Cairo/Pango and `pkg-config`, plus Xcode Command Line Tools on macOS. Cross-language tests invoke the release renderer; browser-only bundling is insufficient. Rebuild after native/browser/OOXML changes before document regressions.

For document checks, install Python 3.12+, `requirements-dev.txt` in `.venv`, Poppler (`pdftoppm`), and the selected host per the README. Generate fixtures in order:

```sh
.venv/bin/python tools/make-fixtures.py
.venv/bin/python tools/make-representative.py
.venv/bin/python tools/make-office-fixtures.py
```

Run `bun run test:lifecycle` for preparation/cancellation/recovery changes. It needs `stress-40.docx`, `representative/office-report.docx`, the full build and a working host. Use `.venv/bin/python tools/acceptance.py` for DOCX content/page regression and `.venv/bin/python tools/check-xlsx-fit.py` for worksheet geometry. `PLIFLO_ENGINE=chromium` selects Chromium; install its browser/system dependencies first.

## Tool reference

Run from the repository root using `.venv/bin/python tools/<name>.py`. Rendering tools need the full build and a host. Page/raster comparisons require diagnostics enabled. A `<pages-directory>` is the `pages/` directory in the session reported by `bun run render`.

| Tool | Purpose and prerequisites |
| --- | --- |
| `make-fixtures.py` | Creates base DOCX, multilingual/font, multi-size and 40-page stress inputs plus `fixtures/`. Run first. |
| `make-representative.py` | Creates `representative/office-report.docx`. Requires `fixtures/`. |
| `make-office-fixtures.py` | Creates PPTX, XLSX, Markdown and image inputs. Requires `fixtures/`. |
| `make-image-formats.py` | Creates portrait/landscape image-format inputs. Run after base fixture setup. |
| `make-image-report.py` | Creates the image-load DOCX benchmark input. Requires `fixtures/`. |
| `acceptance.py` | Renders base DOCX cases and the representative report; checks pages/content sentinels. Requires the first two generators and Poppler. |
| `check-pages.py <pages-directory>` | Compares PDF page count/geometry and rasterized pages with recorded Canvas diagnostics. Requires recordings/PNGs and Poppler. |
| `check-xlsx-fit.py` | Generates a workbook and checks fit-width output for missing cells. No integration adapter required. |
| `check-behavior.py` | Generates wide/hidden-sheet and Markdown inputs; checks pagination and Office worker-reference output. Requires `fixtures/representative/`, the integration adapter, `PLIFLO_SOURCE_ROOT` and diagnostics. |
| `check-image-formats.py` | Checks generated images in fit/actual modes. Requires `make-image-formats.py`, the integration adapter, `PLIFLO_SOURCE_ROOT`, diagnostics and Poppler. |
| `compare-raster.py <pages-directory> [filename.pdf]` | Creates a raster PDF from Canvas PNGs; compares size, pages, geometry, images and extractable text. Target must be new. Not an independent Office reference. |
| `benchmark-prepare.py` | Three runs each for office report, image report and stress fixtures; run their generators first. Uses POSIX `/bin/ps`; descendant RSS excludes non-descendant WebKit helpers. |
| `check-bundle.py <bundle-directory> <pages-directory> [...]` | macOS same-host relocation check using existing manifests, comparing text, geometry and content streams. Requires a native bundle and diagnostic renders. |

Markdown/image and worker-reference checks use the [optional integration adapter](README.md#optional-pliflo-integration-adapter). Build it from a compatible local Pliflo checkout with dependencies installed, and keep `PLIFLO_SOURCE_ROOT` set during checks. Independent Office adapter checks do not require that checkout.

## Review expectations

Coordinate TypeScript/Rust protocol changes and cover changed semantics with cross-language tests. Inspect generated PDF text, dimensions and affected visual regions for layout/font/drawing changes. Compare the same input with explicit engine and dependency versions; pixel differences alone do not establish a visible defect.

Preserve unrelated work and keep changes focused. Use Chinese Conventional Commit messages when commits are requested. PRs should explain the problem, scope, checks actually run and remaining limits. Never use printing as a test.

Keep both READMEs aligned and update the relevant architecture/protocol/release documentation when its contract changes. Review [third-party notices](THIRD_PARTY_NOTICES.md) for dependency/packaging changes.
