import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildOoxmlRuntime, runtimeDirectory } from "./build-ooxml-runtime.ts";
const root = resolve(import.meta.dirname, ".."),
  source = resolve(root, "node_modules/@silurus/ooxml");
const original = await readFile(join(source, "dist/xlsx-CRcSzZNq.js"));
assert.equal(await buildOoxmlRuntime(), runtimeDirectory);
assert.equal(await buildOoxmlRuntime(), runtimeDirectory);
assert.deepEqual(await readFile(join(source, "dist/xlsx-CRcSzZNq.js")), original);
const temporary = await mkdtemp(resolve(root, "output/runtime-contract-"));
try {
  const fake = join(temporary, "source");
  await mkdir(join(fake, "dist"), { recursive: true });
  await copyFile(join(source, "package.json"), join(fake, "package.json"));
  await writeFile(
    join(fake, "dist/xlsx-CRcSzZNq.js"),
    Buffer.concat([original, Buffer.from("\n// changed upstream build")]),
  );
  await assert.rejects(
    buildOoxmlRuntime(fake, join(temporary, "rejected")),
    /Unsupported OOXML build/,
  );
  await writeFile(join(fake, "dist/xlsx-CRcSzZNq.js"), original);
  await writeFile(join(fake, "package.json"), JSON.stringify({ version: "0.88.0" }));
  await assert.rejects(
    buildOoxmlRuntime(fake, join(temporary, "rejected")),
    /Unsupported OOXML build/,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(
  "PASS: reproducible build, installed dependency unchanged, altered source and unsupported version rejected",
);
