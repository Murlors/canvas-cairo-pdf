import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { resolve, extname, sep, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { markSession } from "./session-store.ts";
import { runtimeDirectory } from "./build-ooxml-runtime.ts";
import { root, plifloRoot, loadChromium, replayPath, harnessPath, resolveEngine } from "./paths.ts";
import { terminateProcessTree } from "./process-tree.ts";
import {
  parseSourceOptions,
  validatePageGeometry,
  type PageRecording,
} from "../browser/protocol.ts";
import type { Browser } from "playwright-core";
const managed = typeof process.send === "function";
let browser: Browser | undefined;
const backendAbort = new AbortController();
let shuttingDown = false;
// 仅 prepareDocument 创建的独立进程组启用；父调度器消失后禁止继续写产物。
const parentGone = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  backendAbort.abort();
  const force = () => {
    if (process.platform === "win32")
      void terminateProcessTree(process.pid).finally(() => process.exit(1));
    else process.kill(-process.pid, "SIGKILL");
  };
  const timer = setTimeout(force, 350);
  void (browser?.close() ?? Promise.resolve())
    .catch(() => {})
    .finally(() => {
      clearTimeout(timer);
      force();
    });
};
if (managed) {
  process.on("disconnect", parentGone);
  process.on("SIGTERM", parentGone);
}
const exec = promisify(execFile);
const source = await realpath(process.argv[2] ?? resolve(root, "fixtures/multipage.docx"));
const engine = resolveEngine(process.argv[3]);
const diagnostics = process.env.PLIFLO_DIAGNOSTICS !== "0";
const sourceOptions = parseSourceOptions({
  workerReference: process.env.PLIFLO_WORKER_REFERENCE === "1",
  sourcePath: source,
  format: extname(source).slice(1).toLowerCase(),
  imageSizing: process.env.PLIFLO_IMAGE_SIZING ?? "fit",
  xlsxScale: process.env.PLIFLO_XLSX_SCALE ?? "fit",
  xlsxSheet: process.env.PLIFLO_XLSX_SHEET ? Number(process.env.PLIFLO_XLSX_SHEET) : "all",
});
await mkdir(resolve(root, "output/bridge-pages"), { recursive: true });
const run = await mkdtemp(resolve(root, "output/bridge-pages", engine + "-"));
if (managed) await markSession(run, "running");
process.send?.({ type: "session", run });
const out = resolve(run, "pages"),
  dist = await realpath(resolve(runtimeDirectory, "dist"));
let pageCount = 0,
  recordingPage = false;
const pagePaths: string[] = [];
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url ?? "/", "http://localhost").pathname;
    if (p === "/source-options") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(sourceOptions));
      return;
    }
    if (req.method === "POST" && p === "/record" && engine === "chromium") {
      if (recordingPage) throw new Error("Concurrent page stream");
      recordingPage = true;
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        const recording: PageRecording = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          !recording ||
          recording.version !== 1 ||
          !recording.size ||
          !Array.isArray(recording.commands) ||
          !Array.isArray(recording.unsupported)
        )
          throw new Error("Invalid page recording");
        validatePageGeometry(recording);
        if (recording.index !== pageCount) throw new Error("Page sequence mismatch");
        const prefix = resolve(out, `page-${String(pageCount + 1).padStart(3, "0")}`);
        if (diagnostics) {
          if (typeof recording.reference !== "string") throw new Error("Missing reference image");
          await writeFile(prefix + ".png", Buffer.from(recording.reference, "base64"));
        }
        delete recording.reference;
        await writeFile(prefix + ".json", JSON.stringify(recording));
        if (diagnostics)
          await exec(replayPath, [prefix + ".json", prefix + ".pdf"], {
            timeout: 30000,
            signal: backendAbort.signal,
            killSignal: "SIGKILL",
          });
        pagePaths.push(prefix + ".json");
        pageCount++;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ index: recording.index }));
        return;
      } finally {
        recordingPage = false;
      }
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (p === "/") {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:",
      );
      res.setHeader("Content-Type", "text/html");
      res.end('<script type="module" src="/browser.mjs"></script>');
      return;
    }
    let file;
    if (p === "/input") file = source;
    else if (p === "/local-file") {
      const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("path");
      if (!requested) throw new Error("Missing local file path");
      file = await realpath(requested);
      const sourceDir = await realpath(dirname(source));
      if (
        file !== source &&
        (!file.startsWith(sourceDir + sep) ||
          ![".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(extname(file).toLowerCase()))
      )
        throw Error("Resource outside source image directory");
    } else if (p === "/pliflo-documents.mjs")
      file = resolve(root, "output/pliflo-reference/documents.mjs");
    else if (p === "/marked.mjs")
      file = resolve(plifloRoot, "node_modules/marked/lib/marked.esm.js");
    else if (/^\/[\w.-]+\.mjs$/.test(p) || p.startsWith("/chunks/")) {
      const browserRoot = await realpath(resolve(root, "output/browser"));
      file = await realpath(resolve(browserRoot, decodeURIComponent(p.slice(1))));
      if (!file.startsWith(browserRoot + sep) || extname(file) !== ".mjs")
        throw new Error("Invalid browser resource path");
    } else if (p.startsWith("/ooxml/")) {
      file = await realpath(resolve(dist, decodeURIComponent(p.slice(7))));
      if (!file.startsWith(dist + sep)) throw new Error("Invalid resource path");
    } else {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      extname(file) === ".wasm" ? "application/wasm" : "text/javascript",
    );
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500).end(e instanceof Error ? e.message : String(e));
  }
});
await new Promise<void>((accept, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", accept);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Missing server address");
const origin = `http://127.0.0.1:${address.port}`;
try {
  if (engine === "webkit") {
    const result = await exec(harnessPath, [origin, out, replayPath], {
      timeout: 130000,
      maxBuffer: 4 * 1024 * 1024,
      signal: backendAbort.signal,
    });
    await writeFile(resolve(run, "native-stderr.txt"), result.stderr);
  } else {
    await mkdir(out);
    const chromium = await loadChromium();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route("**/*", (r) =>
      r
        .request()
        .url()
        .startsWith(origin + "/")
        ? r.continue()
        : r.abort(),
    );
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.runBridge === "function");
    const started = performance.now();
    const result = await page.evaluate(
      (diagnostics) => window.runBridge({ allPages: true, diagnostics }),
      diagnostics,
    );
    if (
      !("pages" in result) ||
      result.sourcePages !== pageCount ||
      result.pages.length !== pageCount ||
      pageCount === 0
    )
      throw new Error("Incomplete page stream");
    // 顺序落盘后的页清单由同一个 Cairo surface 合并，避免在前端保留全书。
    const manifest = resolve(out, "manifest.json");
    await writeFile(manifest, JSON.stringify({ pages: pagePaths }));
    await exec(replayPath, [manifest, resolve(out, "document.pdf")], {
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      signal: backendAbort.signal,
      killSignal: "SIGKILL",
    });
    if (!diagnostics) {
      for (const path of pagePaths) await rm(path);
      await rm(manifest);
    }
    await writeFile(
      resolve(out, "result.json"),
      JSON.stringify(
        { ...result, engine, wallMs: performance.now() - started, diagnostics },
        null,
        2,
      ),
    );
  }
  const result: { sourcePages: number; wallMs: number } = JSON.parse(
    await readFile(resolve(out, "result.json"), "utf8"),
  );
  if (
    !Number.isSafeInteger(result.sourcePages) ||
    result.sourcePages <= 0 ||
    !Number.isFinite(result.wallMs) ||
    result.wallMs < 0
  )
    throw new Error("Invalid render result");
  await writeFile(
    resolve(run, "source.json"),
    JSON.stringify(
      {
        source,
        sha256: createHash("sha256")
          .update(await readFile(source))
          .digest("hex"),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ run, engine, pages: result.sourcePages, wallMs: result.wallMs }));
  if (managed) await markSession(run, "complete");
  process.send?.({
    type: "complete",
    run,
    engine,
    pages: result.sourcePages,
    wallMs: result.wallMs,
  });
} finally {
  backendAbort.abort();
  try {
    await browser?.close();
  } finally {
    await new Promise<void>((accept, reject) =>
      server.close((error) => (error ? reject(error) : accept())),
    );
  }
  if (managed) {
    process.removeListener("disconnect", parentGone);
    process.removeListener("SIGTERM", parentGone);
    if (process.connected) process.disconnect?.();
  }
}
