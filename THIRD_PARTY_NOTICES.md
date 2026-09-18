# Third-party notices

The root [LICENSE](LICENSE) applies to project-owned code only. It does not replace the terms of third-party software, fonts or input documents.

## Dependencies

The rendering path uses `@silurus/ooxml` 0.87.0, `pdf-lib`, Cairo, Pango and their transitive dependencies. JavaScript versions are recorded in `bun.lock`; Rust versions, including cairo-rs, pango, pangocairo and serde, are recorded in `Cargo.lock`. Native library versions depend on the build environment and actual package manifest. Vite+, TypeScript, Playwright and fixture-generation libraries are development dependencies with their own terms.

The OOXML runtime build preserves upstream `LICENSE` and `THIRD_PARTY_NOTICES.md` files. Local extensions in `compat/ooxml/` are applied to a version/hash-checked build copy; upstream notices must remain intact.

## Optional integration adapter

`scripts/build-pliflo-reference.ts` derives a module from an explicitly selected local Pliflo checkout and writes it under `output/pliflo-reference/`, together with source provenance. This adapter currently supplies Markdown/image rendering and Office worker-reference comparisons.

Generated adapter code is not automatically covered by this repository's MIT license. Inspect the selected checkout's license and ownership and secure the necessary rights before redistributing derived code. A local build or source hash does not grant redistribution permission.

## Native distribution and assets

The macOS native packager copies a dynamic-library dependency closure. Its manifest is an inventory, not a complete license bundle. License texts and required source-access materials for that closure have not been fully collected; public binary distribution requires the audit described in [release preparation](docs/releasing.md). Cairo/Pango and their dependencies must not be labeled solely with this repository's MIT license.

System fonts are not distributed with the repository. Private input documents and their generated outputs are not public fixtures. Confirm rights for any fonts, documents or assets included in a release.

This document describes dependency boundaries; it does not substitute for the third-party license texts that must accompany a distributed artifact.
