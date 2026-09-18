import assert from "node:assert/strict";
import { readdir, readFile, stat, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareDocument } from "./prepare.ts";

const root = resolve(import.meta.dirname, ".."),
  sessions = resolve(root, "output/bridge-pages");
await mkdir(sessions, { recursive: true });
// 只断言本测试的会话，其他终端的诊断输出不参与集合比较。
const snapshot = async () => {
  const names = new Set<string>();
  for (const name of await readdir(sessions)) {
    try {
      const marker: { ownerPid?: unknown } = JSON.parse(
        await readFile(resolve(sessions, name, "session.json"), "utf8"),
      );
      if (marker.ownerPid === process.pid) names.add(name);
    } catch {}
  }
  return names;
};
const before = await snapshot();
const source = resolve(root, "fixtures/stress-40.docx");
const controller = new AbortController();
const pending = prepareDocument(source, { signal: controller.signal });
await assert.rejects(prepareDocument(source), { code: "BUSY" });
setTimeout(() => controller.abort(), 400);
await assert.rejects(pending, { code: "CANCELLED" });
assert.deepEqual(await snapshot(), before, "Cancelled session must be removed");
await assert.rejects(prepareDocument(source, { timeoutMs: 400 }), { code: "TIMEOUT" });
assert.deepEqual(await snapshot(), before, "Timed-out session must be removed");
const temporary = await mkdtemp(resolve(root, "output/broken-input-"));
try {
  const broken = resolve(temporary, "broken.docx");
  await writeFile(broken, "invalid docx");
  await assert.rejects(prepareDocument(broken), { code: "RENDER_FAILED" });
  assert.deepEqual(await snapshot(), before, "Failed session must be removed");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
const result = await prepareDocument(resolve(root, "fixtures/representative/office-report.docx"));
assert.equal(result.pages, 5);
assert.ok((await stat(result.pdfPath)).size > 0);
console.log(
  JSON.stringify(
    {
      checks: ["busy", "cancel", "timeout", "invalid input", "cleanup", "success after failures"],
      result,
    },
    null,
    2,
  ),
);
