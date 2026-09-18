import { resolve } from "node:path";
import type { BrowserType } from "playwright-core";
export const root = resolve(import.meta.dirname, "..");
export const projectRoot = root;
export const replayPath = resolve(
  root,
  "target/release",
  process.platform === "win32" ? "canvas-cairo-pdf.exe" : "canvas-cairo-pdf",
);
export const harnessPath = resolve(root, "output/bin/wk-harness");
export const defaultEngine = process.platform === "darwin" ? "webkit" : "chromium";
export type Engine = "webkit" | "chromium";
/** 显式参数优先于环境变量；非法引擎不回退到其他后端。 */
export function resolveEngine(value: string | undefined = process.env.PLIFLO_ENGINE): Engine {
  const engine = value ?? defaultEngine;
  if (engine !== "webkit" && engine !== "chromium") throw new Error("Unsupported engine");
  if (engine === "webkit" && process.platform !== "darwin")
    throw new Error("WebKit host requires macOS");
  return engine;
}
// 仅主仓对照工具需要Pliflo源码；转换内核不依赖固定用户名或工作目录。
export const plifloRoot = resolve(
  process.env.PLIFLO_SOURCE_ROOT ?? resolve(projectRoot, "../Pliflo"),
);
export async function loadChromium(): Promise<BrowserType> {
  const loaded: unknown = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
  if (
    !loaded ||
    typeof loaded !== "object" ||
    !("chromium" in loaded) ||
    !loaded.chromium ||
    typeof loaded.chromium !== "object" ||
    !("launch" in loaded.chromium) ||
    typeof loaded.chromium.launch !== "function"
  )
    throw new Error("Invalid Playwright module");
  return loaded.chromium as BrowserType;
}
