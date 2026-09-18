# Release preparation

The package is private and has no automatic publishing workflow. CI checks do not publish a package. The source repository is [canvas-cairo-pdf](https://github.com/Murlors/canvas-cairo-pdf).

## Source readiness

- Review the exact files to distribute: maintained source, documentation, lockfiles and synthetic fixture generators. Exclude private inputs, generated PDFs/screenshots, fonts and credentials.
- Follow the [README](../README.md) from a fresh checkout: install native/toolchain dependencies, install locked JavaScript dependencies, run the full build, checks and tests.
- Run the relevant document regressions from [CONTRIBUTING.md](../CONTRIBUTING.md), with a working host and generated fixtures. Verify PDF page count, geometry, text and affected visual content.
- Describe independent Office rendering separately from adapter-dependent Markdown/images and worker-reference checks.
- Confirm project ownership and third-party terms. Obtain explicit authorization for the intended push or publication.

## Native packages

The current packaging tool is macOS-only. After building the release renderer:

```sh
# Destination must not exist.
node scripts/package-native.ts output/native-bundle

# Use pages/ from an existing diagnostic render.
.venv/bin/python tools/check-bundle.py output/native-bundle /absolute/path/session/pages
```

The packager recursively copies non-system dynamic libraries, rewrites their load paths, applies ad-hoc signatures and records a file manifest. It packages the native replay executable and libraries, not the full document conversion host, browser assets or integration adapter.

The relocation check compares text, geometry and content streams on the same machine. System fonts remain available, so this does not establish clean-machine or minimum-OS compatibility.

Before distributing a native package:

- Validate each target architecture and minimum OS on clean machines, including dynamic-library loading, fonts and representative document output. Windows native CI uses MSYS2 UCRT64; Linux/Windows packaging is not implemented by this script.
- Collect versions, origins, license texts and any required source-access materials for the actual bundled dependency closure. The complete closure audit is outstanding.
- Apply distribution signing, required notarization and installation checks. Ad-hoc signing is not distribution signing.
- Verify font and asset redistribution rights. Do not copy local system fonts into the package.
- For a complete document conversion product, also validate host/resource discovery, the optional adapter when included, cancellation/recovery and memory use including system-managed browser helpers.

CI covers Linux/macOS builds/tests, Linux Chromium and Windows native tests. It does not replace these distribution checks. See [third-party notices](../THIRD_PARTY_NOTICES.md).
