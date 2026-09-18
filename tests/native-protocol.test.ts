import { describe, expect, it } from "vite-plus/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { canvasCommand, type CanvasState, type PageRecording } from "../browser/protocol.ts";
import { replayPath } from "../scripts/paths.ts";

const state: CanvasState = {
  matrix: [1, 0, 0, 1, 0, 0],
  fill: "#000000",
  stroke: "#000000",
  alpha: 1,
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  dash: [],
  dashOffset: 0,
  font: "12px sans-serif",
  baseline: "alphabetic",
  align: "left",
  composite: "source-over",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowColor: "rgba(0, 0, 0, 0)",
};

describe("TypeScript producer to Rust renderer contract", () => {
  it("renders different page sizes, refuses overwrite and removes a partial failed document", async () => {
    const directory = await mkdtemp(join(tmpdir(), "canvas-cairo-contract-"));
    try {
      const input = join(directory, "manifest.json");
      const output = join(directory, "document.pdf");
      const page = (index: number, widthPt: number, heightPt: number): PageRecording => ({
        version: 1,
        index,
        sourcePages: 2,
        width: widthPt * 2,
        height: heightPt * 2,
        size: { widthPt, heightPt },
        unsupported: [],
        commands: [
          canvasCommand("fillRect", [10, 10, 30, 20], state),
          canvasCommand("fillText", ["Contract 中文", 10, 60], state),
        ],
      });
      const pages = [page(0, 595, 842), page(1, 792, 612)];
      await writeFile(input, JSON.stringify({ pages }));
      execFileSync(replayPath, [input, output], { stdio: "pipe" });
      const original = await readFile(output);
      const pdf = await PDFDocument.load(original);
      expect(pdf.getPages().map((p) => p.getSize())).toEqual([
        { width: 595, height: 842 },
        { width: 792, height: 612 },
      ]);
      expect(() => execFileSync(replayPath, [input, output], { stdio: "pipe" })).toThrow();
      expect(await readFile(output)).toEqual(original);
      await writeFile(input, JSON.stringify({ pages: [pages[0], { ...pages[1], width: 0 }] }));
      const failed = join(directory, "failed.pdf");
      expect(() => execFileSync(replayPath, [input, failed], { stdio: "pipe" })).toThrow();
      await expect(access(failed)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
