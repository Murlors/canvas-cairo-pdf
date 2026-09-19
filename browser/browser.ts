import { openSource } from "./source-adapter";
import { recordCanvas } from "./recorder";
import {
  parseBridgeOptions,
  validatePageAcknowledgement,
  validatePageGeometry,
  type PageRecording,
  type BridgeSummary,
  type BridgeOptions,
} from "./protocol";
function png(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
}
function runBridge(options?: Partial<BridgeOptions> & { allPages?: false }): Promise<PageRecording>;
function runBridge(options: Partial<BridgeOptions> & { allPages: true }): Promise<BridgeSummary>;
function runBridge(options: Partial<BridgeOptions>): Promise<PageRecording | BridgeSummary>;
async function runBridge(
  options: Partial<BridgeOptions> = {},
): Promise<PageRecording | BridgeSummary> {
  const { allPages, native, diagnostics } = parseBridgeOptions(options);
  const bytes = await (await fetch("/input")).arrayBuffer();
  const sourceOptions: unknown = await (await fetch("/source-options")).json();
  const doc = await openSource(bytes, sourceOptions, recordCanvas);
  try {
    await doc.waitUntilLayoutComplete();
    const pages: BridgeSummary["pages"] = [];
    for (let index = 0; index < (allPages ? doc.pageCount : 1); index++) {
      const size = doc.pageSize(index),
        canvas = doc.pageCanvas?.(index) ?? document.createElement("canvas");
      const { commands, unsupported } = recordCanvas(canvas);
      await doc.renderPage(canvas, index, { width: Math.round(size.widthPt * 2), dpr: 1 });
      const recording: PageRecording = {
        version: 1,
        index,
        sourcePages: doc.pageCount,
        size,
        width: canvas.width,
        height: canvas.height,
        commands,
        unsupported,
      };
      validatePageGeometry(recording);
      if (diagnostics) recording.reference = png(canvas);
      if (!allPages) return recording;
      // 等待原生页落盘再继续，避免在 JS 中累积全书命令与图片。
      let ack: unknown;
      if (native) {
        if (!window.webkit) throw new Error("Native page handler unavailable");
        ack = await window.webkit.messageHandlers.page.postMessage(recording);
      } else {
        ack = await (
          await fetch("/record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(recording),
          })
        ).json();
      }
      validatePageAcknowledgement(ack, index);
      pages.push({ index, size, commands: commands.length });
      canvas.width = canvas.height = 0;
    }
    return { sourcePages: doc.pageCount, pages, userAgent: navigator.userAgent };
  } finally {
    doc.destroy();
  }
}
window.runBridge = runBridge;
