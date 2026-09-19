# Canvas recording protocol v1

TypeScript definitions and boundary checks live in `browser/protocol.ts`; Rust decoding and validation live in `crates/replay/src/protocol.rs`. Cross-language tests in `tests/native-protocol.test.ts` send TypeScript-produced recordings to the native renderer.

## Input and coordinates

A single recording contains:

| Field | Meaning |
| --- | --- |
| `version` | Must be `1`. |
| `size.widthPt`, `size.heightPt` | Positive PDF dimensions in points (1/72 inch). |
| `width`, `height` | Positive Canvas dimensions. Browser recordings use integer pixels. |
| `commands` | Ordered drawing commands. |
| `unsupported` | Must be empty for native replay. |
| `index`, `sourcePages` | Browser page index/count; optional in native input. If a count is supplied it must be positive, and a supplied index must be below it. |
| `reference` | Optional diagnostic Base64 PNG; not used for native drawing. |

A multi-page manifest is `{ "pages": [recordingOrPath, ...] }`, with at least one inline recording or recording JSON path. Relative paths resolve against the process working directory, not the manifest directory. File entries are read page by page.

Each command has an `op`, an `args` tuple and drawing `state`. Native `save`/`restore` do not require state; other operations do. State includes the transform matrix, paint, alpha, line settings, font, text alignment/baseline, compositing and shadow values.

Coordinates use the uniform scale `size.widthPt / width`. Producers must provide matching Canvas/page aspect ratios; there is no independent vertical scale.

## Native operation subset

- State/path: `save`, `restore`, `beginPath`, `closePath`, `moveTo`, `lineTo`, `rect`.
- Drawing: `clip`, `fill` (default nonzero or explicit nonzero/evenodd), `stroke`, `fillRect`, `strokeRect`, `clearRect`.
- Text: `fillText(text, x, y)`; no `maxWidth`.
- Images: `drawImage(image, x, y, width, height)`; no source-cropping form.

Paint colors support `#RRGGBB`. Compositing is limited to `source-over`; nonzero shadow blur/offsets are rejected. Font sizes use `px` with the style syntax accepted by the native font parser. Supported text baselines are alphabetic/top/middle/bottom; alignments are left/start/right/center.

The TypeScript recorder recognizes more operations than Rust supports. Curves, arcs, ellipses, `strokeText`, Path2D, gradients and unsupported state/argument combinations fail rather than disappearing or triggering a raster fallback. Recording an operation is not a guarantee it can be replayed.

## Images, text and validation

JSON images contain Base64 `png`, `width` and `height`. Embedded hosts can instead call `recordCanvas(canvas, true)` and `encodePage(canvas, widthPt, heightPt)` from `canvas-cairo-pdf/recorder`. This produces a `CCP1` frame: four magic bytes, a little-endian u32 JSON length, JSON, a u32 image count, and length-prefixed raw PNGs. Image placeholders are `@binary:<index>`, used exactly once. `decode_recording` and manifest file entries accept this format. Truncated, trailing and unreferenced data are rejected; binary pages are limited to 256 MiB. PNG headers, declared dimensions and the 64-million-pixel limit are checked before drawing.

Rust hosts can use `render_input_cancellable` to check cancellation at page boundaries. Cancellation removes the newly created partial output, just like other rendering failures.

Numeric values have finite/range checks; transforms must be invertible, alpha must be in [0, 1], and save/restore must balance. Unknown operations and unknown fields in the decoded structures are rejected. These checks do not establish a complete resource sandbox for malicious documents.

Text stays as the original string for Pango/Cairo text mapping. Preserve whitespace in font-family candidate lists: normalizing it can change fallback selection. Font diagnostics contain requested/actual font names, not document text. Browser and native font resolution remain separate.

## Output and evolution

Both CLI and library require a new `.pdf` output path and an existing parent directory. Existing files, directories and symlinks are not overwritten. Failed rendering removes only the partial PDF created by that invocation. The CLI exits nonzero on errors.

Add capabilities consistently across TypeScript definitions/validation, Rust decoding/rendering and cross-language tests. Breaking changes require a protocol version change. Test page dimensions, content preservation, rejection paths, overwrite refusal and partial-output cleanup as applicable.

See [architecture](architecture.md) and [native CLI usage](../README.md#standalone-native-replay).
