import { fork, type ChildProcess } from "node:child_process";
import { rm, realpath, readFile, stat, lstat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { recoverSessions } from "./session-store.ts";
import { root, resolveEngine } from "./paths.ts";
import { terminateProcessTree } from "./process-tree.ts";

let busy = false;
type FailureCode = "CANCELLED" | "BUSY" | "TIMEOUT" | "RENDER_FAILED";
interface Completion {
  type: "complete";
  run: string;
  pages: number;
  wallMs: number;
}
export interface PreparationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  engine?: "webkit" | "chromium";
}
export interface PreparedDocument {
  pdfPath: string;
  pages: number | null;
  wallMs?: number;
  generated: boolean;
}
export class PreparationError extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode, message: string) {
    super(message);
    this.name = "PreparationError";
    this.code = code;
  }
}

/** Development entry point: bounded single-task execution with process-tree cancellation. */
export async function prepareDocument(
  source: string,
  { signal, timeoutMs = 120000, engine }: PreparationOptions = {},
): Promise<PreparedDocument> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("Invalid timeoutMs");
  if (signal?.aborted) throw new PreparationError("CANCELLED", "Preparation cancelled");
  if (busy) throw new PreparationError("BUSY", "Another preparation is active");
  busy = true;
  let run: string | undefined,
    child: ChildProcess | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    result: Completion | undefined,
    reason: FailureCode | undefined;
  let stopping: Promise<void> | undefined,
    cleanupSafe = true;
  let stopped: () => void = () => {};
  const stoppedPromise = new Promise<null>((accept) => {
    stopped = () => accept(null);
  });
  const stop = (code: FailureCode) => {
    if (reason) return;
    reason = code;
    if (child?.pid) {
      stopping = terminateProcessTree(child.pid)
        .catch(() => {
          cleanupSafe = false;
        })
        .finally(stopped);
    }
  };
  const cancel = () => stop("CANCELLED");
  try {
    await recoverSessions(resolve(root, "output/bridge-pages"));
    const input = await realpath(source);
    if (signal?.aborted) throw new PreparationError("CANCELLED", "Preparation cancelled");
    if (extname(input).toLowerCase() === ".pdf") {
      const bytes = await readFile(input);
      let pages = null;
      try {
        const { PDFDocument } = await import("pdf-lib");
        pages = (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
      } catch {}
      if (signal?.aborted) throw new PreparationError("CANCELLED", "Preparation cancelled");
      // 与主仓原件直用规则一致；页数解析失败保留null，不重写或删除源文件。
      return { pdfPath: input, pages, generated: false };
    }
    child = fork(resolve(root, "scripts/run-pages.ts"), [input, resolveEngine(engine)], {
      cwd: root,
      detached: true,
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { ...process.env, PLIFLO_DIAGNOSTICS: "0" },
    });
    child.on("message", (message: unknown) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        !("run" in message) ||
        typeof message.run !== "string"
      )
        return;
      const candidate = resolve(message.run),
        sessions = resolve(root, "output/bridge-pages");
      if (
        !candidate.startsWith(sessions + sep) ||
        candidate.slice(sessions.length + 1).includes(sep) ||
        !/^(webkit|chromium)-/.test(candidate.slice(sessions.length + 1))
      )
        return;
      if (message.type === "session") run = candidate;
      if (
        message.type === "complete" &&
        candidate === run &&
        "pages" in message &&
        typeof message.pages === "number" &&
        Number.isSafeInteger(message.pages) &&
        message.pages > 0 &&
        "wallMs" in message &&
        typeof message.wallMs === "number" &&
        Number.isFinite(message.wallMs) &&
        message.wallMs >= 0
      )
        result = { type: "complete", run: candidate, pages: message.pages, wallMs: message.wallMs };
    });
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => stop("TIMEOUT"), timeoutMs);
    if (signal?.aborted) cancel();
    const activeChild = child;
    const code = await Promise.race([
      new Promise<number | null>((accept, reject) => {
        activeChild.once("error", reject);
        activeChild.once("close", accept);
      }),
      stoppedPromise,
    ]);
    if (reason) {
      // 先等强制终止窗口结束，再删除文件，防止后端写回已清理的目录。
      await stopping;
      throw new PreparationError(
        reason,
        reason === "TIMEOUT" ? "Preparation timed out" : "Preparation cancelled",
      );
    }
    if (code !== 0 || !result) {
      stop("RENDER_FAILED");
      await stopping;
      throw new PreparationError("RENDER_FAILED", "Document preparation failed");
    }
    const pdfPath = resolve(result.run, "pages/document.pdf");
    if ((await stat(pdfPath)).size === 0)
      throw new PreparationError("RENDER_FAILED", "Empty prepared PDF");
    return { pdfPath, pages: result.pages, wallMs: result.wallMs, generated: true };
  } catch (error) {
    if (child && !reason) {
      stop("RENDER_FAILED");
      await stopping;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    // Only clean the owned session created under this run's output root.
    try {
      if (
        cleanupSafe &&
        (reason || !result) &&
        run &&
        resolve(run).startsWith(resolve(root, "output/bridge-pages") + sep) &&
        !(await lstat(run)).isSymbolicLink()
      )
        await rm(run, { recursive: true, force: true });
    } finally {
      busy = false;
    }
  }
}
