import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { plifloRoot } from "./paths.ts";

// Build the optional integration adapter from read-only Pliflo source.
const source = resolve(plifloRoot, "src/lib/documents.ts");
const original = await readFile(source, "utf8");
let code = original;
function replaceOnce(before: string, after: string) {
  if (!code.includes(before)) throw Error("Pliflo source changed: adapter needs review");
  code = code.replace(before, after);
}
replaceOnce(
  'import { invoke } from "@tauri-apps/api/core";',
  `async function invoke(command, args) {
 if(command!=='read_local_file')throw Error('Unsupported reference command');
 const response=await fetch('/local-file?path='+encodeURIComponent(args.path));
 if(!response.ok)throw Error('Local image unavailable');return response.arrayBuffer();
}`,
);
replaceOnce('from "marked"', 'from "/marked.mjs"');
replaceOnce(
  'import { createRecordedCanvas, recordingPage } from "./cairo";',
  'function createRecordedCanvas() { return document.createElement("canvas"); }',
);
replaceOnce('from "canvas-cairo-pdf/xlsx-fit"', 'from "/xlsx-fit.mjs"');
for (const format of ["docx", "pptx", "xlsx"])
  replaceOnce(`import("@silurus/ooxml/${format}")`, `import("/ooxml/${format}.mjs")`);
const start = code.indexOf("async function canvasToPage(");
const end = code.indexOf("\nfunction pagePixels", start);
if (start < 0 || end < 0) throw Error("Missing canvas output boundary");
code =
  code.slice(0, start) +
  "async function canvasToPage(canvas, pageWidthPt, pageHeightPt) { return {canvas, pageWidthPt, pageHeightPt}; }\n" +
  code.slice(end);
code += "\nexport {renderMarkdown, renderImage, renderDocx, renderPptx, renderXlsx};\n";
const transpiler = new Bun.Transpiler({ loader: "ts" });
const out = resolve(import.meta.dirname, "../output/pliflo-reference");
await mkdir(out, { recursive: true });
await writeFile(resolve(out, "documents.mjs"), transpiler.transformSync(code));
await writeFile(
  resolve(out, "source.json"),
  JSON.stringify(
    {
      source,
      sha256: createHash("sha256").update(original).digest("hex"),
      changes: [
        "read_local_file shim",
        "page sink returns canvas",
        "export private render functions",
      ],
    },
    null,
    2,
  ),
);
console.log(out);
