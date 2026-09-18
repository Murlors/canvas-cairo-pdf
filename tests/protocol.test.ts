import { describe, it, expect } from "vite-plus/test";
import {
  canvasCommand,
  parseBridgeOptions,
  parseSourceOptions,
  validateCanvasState,
  validatePageAcknowledgement,
  validatePageGeometry,
  type CanvasState,
  type CanvasOperation,
} from "../browser/protocol";

function state(): CanvasState {
  return {
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
    font: "10px sans-serif",
    baseline: "alphabetic",
    align: "start",
    composite: "source-over",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
  };
}

describe("source and invocation boundaries", () => {
  it("preserves defaults and accepts both historical and Pliflo fit names", () => {
    expect(parseSourceOptions()).toEqual({
      format: "docx",
      xlsxSheet: "all",
      xlsxScale: "fit",
      imageSizing: "fit",
      workerReference: false,
    });
    expect(parseBridgeOptions()).toEqual({ allPages: false, native: false, diagnostics: true });
    for (const xlsxScale of ["fit", "fit-width", "actual"]) {
      expect(parseSourceOptions({ format: "xlsx", xlsxSheet: 0, xlsxScale }).xlsxScale).toBe(
        xlsxScale,
      );
    }
    expect(parseBridgeOptions({ allPages: true, native: true, diagnostics: false })).toEqual({
      allPages: true,
      native: true,
      diagnostics: false,
    });
  });
  it("rejects malformed JSON options instead of silently defaulting or coercing", () => {
    for (const value of [
      null,
      [],
      "docx",
      { format: "pdf" },
      { format: null },
      { xlsxSheet: null },
      { xlsxSheet: -1 },
      { xlsxSheet: 1.5 },
      { xlsxSheet: "0" },
      { xlsxSheet: Infinity },
      { xlsxScale: "shrink" },
      { imageSizing: "stretch" },
      { workerReference: "false" },
    ]) {
      expect(() => parseSourceOptions(value)).toThrow();
    }
    for (const value of [null, [], { allPages: 1 }, { native: "true" }, { diagnostics: null }]) {
      expect(() => parseBridgeOptions(value)).toThrow();
    }
  });
  it("requires a source path only for adapters that consume a local path", () => {
    for (const format of ["md", "markdown", "png", "jpg", "jpeg", "webp", "gif", "bmp"]) {
      expect(() => parseSourceOptions({ format })).toThrow("Missing sourcePath");
      expect(parseSourceOptions({ format, sourcePath: "/local/example" }).sourcePath).toBe(
        "/local/example",
      );
    }
    expect(() => parseSourceOptions({ workerReference: true })).toThrow("Missing sourcePath");
    expect(() => parseSourceOptions({ sourcePath: "" })).toThrow("Invalid sourcePath");
    expect(
      parseSourceOptions({ workerReference: true, sourcePath: "/local/example.docx" })
        .workerReference,
    ).toBe(true);
  });
});

describe("page acknowledgement and geometry", () => {
  it("accepts only the exact numeric page acknowledgement", () => {
    expect(() => validatePageAcknowledgement({ index: 2 }, 2)).not.toThrow();
    for (const ack of [
      null,
      [],
      {},
      { index: "2" },
      { index: 1 },
      { index: 2.5 },
      { index: Infinity },
    ]) {
      expect(() => validatePageAcknowledgement(ack, 2)).toThrow();
    }
  });
  it("rejects invalid page counts, dimensions and nonfinite geometry", () => {
    const page = {
      index: 0,
      sourcePages: 2,
      size: { widthPt: 595.28, heightPt: 841.89 },
      width: 1191,
      height: 1684,
    };
    expect(() => validatePageGeometry(page)).not.toThrow();
    for (const delta of [
      { index: -1 },
      { index: 2 },
      { sourcePages: 0 },
      { sourcePages: 1.5 },
      { width: 0 },
      { height: 1.5 },
      { width: NaN },
      { size: { widthPt: Infinity, heightPt: 10 } },
    ]) {
      expect(() => validatePageGeometry({ ...page, ...delta })).toThrow();
    }
  });
});

describe("Canvas wire commands", () => {
  const image = { png: "aGVsbG8=", width: 10, height: 20 };
  const operations: Record<CanvasOperation, unknown[]> = {
    save: [],
    restore: [],
    beginPath: [],
    closePath: [],
    moveTo: [1, 2],
    lineTo: [1, 2],
    bezierCurveTo: [1, 2, 3, 4, 5, 6],
    quadraticCurveTo: [1, 2, 3, 4],
    rect: [1, 2, 3, 4],
    arc: [1, 2, 3, 4, 5],
    arcTo: [1, 2, 3, 4, 5],
    ellipse: [1, 2, 3, 4, 5, 6, 7],
    clip: ["evenodd"],
    fill: [],
    stroke: [],
    fillRect: [1, 2, 3, 4],
    strokeRect: [1, 2, 3, 4],
    clearRect: [1, 2, 3, 4],
    fillText: ["中文", 1, 2],
    strokeText: ["Text", 1, 2, 100],
    drawImage: [image, 1, 2, 3, 4],
  };
  it("preserves every recorded operation and its JSON payload", () => {
    for (const [op, args] of Object.entries(operations)) {
      const snapshot = state();
      expect(JSON.parse(JSON.stringify(canvasCommand(op, args, snapshot)))).toEqual({
        op,
        args,
        state: snapshot,
      });
    }
    expect(canvasCommand("drawImage", [image, 1, 2, 3, 4, 5, 6, 7, 8], state()).args).toHaveLength(
      9,
    );
    expect(canvasCommand("arc", [1, 2, 3, 4, 5, true], state()).args).toHaveLength(6);
    expect(canvasCommand("ellipse", [1, 2, 3, 4, 5, 6, 7, false], state()).args).toHaveLength(8);
  });
  it("keeps Path2D placeholders and unsupported paint/composite state for explicit native rejection", () => {
    for (const op of ["fill", "clip", "stroke"])
      expect(canvasCommand(op, [{}], state()).args).toEqual([{}]);
    expect(canvasCommand("clip", [{}, "evenodd"], state()).args).toEqual([{}, "evenodd"]);
    const unsupported = { ...state(), fill: {}, composite: "multiply" as const, shadowBlur: 5 };
    expect(canvasCommand("fill", [], unsupported).state).toEqual(unsupported);
  });
  it("fails on unknown operations, malformed tuples and nonserializable numbers", () => {
    const invalid: [string, unknown[]][] = [
      ["unknown", []],
      ["save", [1]],
      ["moveTo", [1]],
      ["lineTo", [1, Infinity]],
      ["fillRect", [0, 0, NaN, 1]],
      ["fillText", [42, 1, 2]],
      ["strokeText", ["text", 1]],
      ["arc", [1, 2, 3, 4, 5, 1]],
      ["fill", ["invalid"]],
      ["stroke", [{ custom: true }]],
      ["clip", [new Date()]],
      ["drawImage", [image, 1, 2]],
      ["drawImage", [{ png: "", width: 1, height: 1 }, 1, 2, 3, 4]],
      ["drawImage", [{ png: "abc", width: 0, height: 1 }, 1, 2, 3, 4]],
    ];
    for (const [op, args] of invalid) expect(() => canvasCommand(op, args, state())).toThrow();
  });
  it("validates state at the same command-construction boundary used by the recorder", () => {
    for (const delta of [
      { matrix: [1, 0, 0, 1, 0] },
      { matrix: [1, 0, 0, 1, 0, NaN] },
      { alpha: 2 },
      { lineWidth: 0 },
      { dash: [-1] },
      { shadowBlur: -1 },
      { font: null },
      { composite: "unknown" },
      { lineCap: "unknown" },
      { fill: { hidden: "paint" } },
    ]) {
      expect(() => validateCanvasState({ ...state(), ...delta })).toThrow();
    }
    expect(() => canvasCommand("save", [], { ...state(), alpha: NaN })).toThrow();
  });
});
