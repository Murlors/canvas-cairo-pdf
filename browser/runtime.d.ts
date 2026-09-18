// 浏览器资源地址由宿主提供；仅复用上游类型，不改变运行时绝对导入。
declare module "*/ooxml/docx.mjs" {
  export { DocxDocument } from "@silurus/ooxml/docx";
}
declare module "*/ooxml/pptx.mjs" {
  export { PptxPresentation } from "@silurus/ooxml/pptx";
}
declare module "*/ooxml/xlsx.mjs" {
  export { XlsxWorkbook } from "@silurus/ooxml/xlsx";
}
declare module "*/ooxml/xlsx-print-geometry.mjs" {
  export function worksheetRenderWidth(
    sheet: import("@silurus/ooxml/xlsx").Worksheet,
    columns: number,
    scale: number,
  ): number;
}
declare module "*/pliflo-documents.mjs" {
  interface ReferencePage {
    canvas: HTMLCanvasElement;
    pageWidthPt: number;
    pageHeightPt: number;
  }
  type PageSink = (page: ReferencePage) => Promise<void>;
  export function renderMarkdown(path: string, sink: PageSink): Promise<void>;
  export function renderImage(
    path: string,
    options: { imageSizing: "fit" | "actual" },
    sink: PageSink,
  ): Promise<void>;
  export function renderDocx(path: string, sink: PageSink): Promise<void>;
  export function renderPptx(path: string, sink: PageSink): Promise<void>;
  export function renderXlsx(
    path: string,
    options: { xlsxSheet: "all" | number; xlsxScale: "fit" | "fit-width" | "actual" },
    sink: PageSink,
  ): Promise<void>;
}
