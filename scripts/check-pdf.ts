import { prepareDocument } from "./prepare.ts";
import { readFile, mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
await mkdir(resolve(import.meta.dirname, "../output"), { recursive: true });
const directory = await mkdtemp(resolve(import.meta.dirname, "../output/pdf-check-"));
try {
  const source = resolve(directory, "source.pdf");
  const document = await PDFDocument.create();
  for (let page = 0; page < 3; page++) document.addPage([595, 842]);
  await writeFile(source, await document.save());
  const hash = async (path: string) =>
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const before = await hash(source),
    result = await prepareDocument(source);
  assert.equal(result.pdfPath, source);
  assert.equal(result.generated, false);
  assert.equal(result.pages, 3);
  assert.equal(await hash(source), before);
  const broken = resolve(directory, "broken.pdf");
  await writeFile(broken, "not pdf");
  const brokenResult = await prepareDocument(broken);
  assert.equal(brokenResult.pages, null);
  assert.equal(brokenResult.pdfPath, broken);
  assert.equal(await readFile(broken, "utf8"), "not pdf");
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(
  "PASS: original PDF path and bytes preserved; 3 pages; unreadable PDF remains original with unknown count",
);
