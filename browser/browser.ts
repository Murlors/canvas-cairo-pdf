import { openSource } from "./source-adapter";
import {
  canvasCommand,
  parseBridgeOptions,
  validatePageAcknowledgement,
  validatePageGeometry,
  type CanvasRecording,
  type CanvasState,
  type CanvasOperation,
  type PageRecording,
  type BridgeSummary,
  type BridgeOptions,
} from "./protocol";

const recordings = new WeakMap<HTMLCanvasElement, CanvasRecording>();
const createElement = document.createElement.bind(document);
const draw = [
  "save",
  "restore",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "rect",
  "arc",
  "arcTo",
  "ellipse",
  "clip",
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "clearRect",
  "fillText",
  "strokeText",
  "drawImage",
] as const satisfies readonly CanvasOperation[];

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return ctx;
}
function png(canvas: HTMLCanvasElement): string {
  const data = canvas.toDataURL("image/png");
  const prefix = "data:image/png;base64,";
  if (!data.startsWith(prefix)) throw new Error("Canvas PNG unavailable");
  return data.slice(prefix.length);
}
function imageSource(
  value: unknown,
): value is CanvasImageSource & { width: number; height: number } {
  return (
    value instanceof HTMLCanvasElement ||
    value instanceof HTMLImageElement ||
    value instanceof HTMLVideoElement ||
    (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) ||
    (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas)
  );
}
function recordCanvas(canvas: HTMLCanvasElement): CanvasRecording {
  const existing = recordings.get(canvas);
  if (existing) return existing;
  const ctx = context(canvas);
  const recording: CanvasRecording = { commands: [], unsupported: [] };
  const state = (): CanvasState => {
    const { a, b, c, d, e, f } = ctx.getTransform();
    return {
      matrix: [a, b, c, d, e, f],
      fill: typeof ctx.fillStyle === "string" ? ctx.fillStyle : {},
      stroke: typeof ctx.strokeStyle === "string" ? ctx.strokeStyle : {},
      alpha: ctx.globalAlpha,
      lineWidth: ctx.lineWidth,
      lineCap: ctx.lineCap,
      lineJoin: ctx.lineJoin,
      miterLimit: ctx.miterLimit,
      dash: ctx.getLineDash(),
      dashOffset: ctx.lineDashOffset,
      font: ctx.font,
      baseline: ctx.textBaseline,
      align: ctx.textAlign,
      composite: ctx.globalCompositeOperation,
      shadowBlur: ctx.shadowBlur,
      shadowOffsetX: ctx.shadowOffsetX,
      shadowOffsetY: ctx.shadowOffsetY,
      shadowColor: ctx.shadowColor,
    };
  };
  for (const name of draw) {
    const original = ctx[name];
    // DOM 重载函数的动态拦截采用 unknown[]，校验后才进入序列化协议。
    Object.defineProperty(ctx, name, {
      configurable: true,
      writable: true,
      enumerable: true,
      value: (...args: unknown[]): void => {
        const saved = state();
        let serial = args;
        if (name === "drawImage") {
          const source = args[0],
            image = createElement("canvas");
          if (!imageSource(source)) throw new Error("Unsupported Canvas image source");
          image.width = source.width;
          image.height = source.height;
          context(image).drawImage(source, 0, 0);
          serial = [
            { png: png(image), width: image.width, height: image.height },
            ...args.slice(1),
          ];
          if (args.length === 3) serial.push(image.width, image.height);
        }
        if (serial.some((value) => value instanceof Path2D)) recording.unsupported.push("Path2D");
        const wireArgs = serial.map((value) => (value instanceof Path2D ? {} : value));
        recording.commands.push(canvasCommand(name, wireArgs, saved));
        Reflect.apply(original, ctx, args);
      },
    });
  }
  recordings.set(canvas, recording);
  return recording;
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
