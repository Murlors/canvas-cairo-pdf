import type { ViewportRange, XlsxRenderViewportOptions } from "@silurus/ooxml/xlsx";
import { parseSourceOptions, type PageSize } from "./protocol";

export interface SourceDocument {
  readonly pageCount: number;
  waitUntilLayoutComplete(): Promise<void>;
  pageSize(index: number): PageSize;
  pageCanvas?(index: number): HTMLCanvasElement;
  renderPage(
    canvas: HTMLCanvasElement,
    index: number,
    options: { width: number; dpr: number },
  ): Promise<void>;
  destroy(): void;
}
interface ReferencePage {
  canvas: HTMLCanvasElement;
  pageWidthPt: number;
  pageHeightPt: number;
}
interface WorksheetPage {
  index: number;
  viewport: ViewportRange;
  options: XlsxRenderViewportOptions;
}

/** Document adapters expose page geometry; OOXML performs Canvas drawing. */
export async function openSource(
  bytes: ArrayBuffer,
  options: unknown = {},
  onCanvas: (canvas: HTMLCanvasElement) => void = () => {},
): Promise<SourceDocument> {
  const { format, xlsxSheet, xlsxScale, imageSizing, sourcePath, workerReference } =
    parseSourceOptions(options);
  if (
    workerReference ||
    ["md", "markdown", "png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(format)
  ) {
    if (sourcePath === undefined) throw new Error("Missing sourcePath");
    const { renderMarkdown, renderImage, renderDocx, renderPptx, renderXlsx } =
      await import("/pliflo-documents.mjs");
    const pages: ReferencePage[] = [];
    const original = document.createElement.bind(document);
    // 保留 DOM 重载签名；只在实际创建 HTMLCanvasElement 时通知记录器。
    document.createElement = ((name: string, options?: ElementCreationOptions): HTMLElement => {
      const element = original(name, options);
      if (element instanceof HTMLCanvasElement) onCanvas(element);
      return element;
    }) as typeof document.createElement;
    const sink = async (page: ReferencePage): Promise<void> => {
      pages.push(page);
    };
    try {
      if (workerReference && ["docx", "pptx", "xlsx"].includes(format)) {
        if (format === "docx") await renderDocx(sourcePath, sink);
        if (format === "pptx") await renderPptx(sourcePath, sink);
        if (format === "xlsx") await renderXlsx(sourcePath, { xlsxSheet, xlsxScale }, sink);
      } else if (["md", "markdown"].includes(format)) await renderMarkdown(sourcePath, sink);
      else await renderImage(sourcePath, { imageSizing }, sink);
    } finally {
      document.createElement = original;
    }
    const pageAt = (index: number): ReferencePage => {
      const page = pages[index];
      if (!page) throw new Error(`Invalid page index: ${index}`);
      return page;
    };
    return {
      pageCount: pages.length,
      waitUntilLayoutComplete: async () => {},
      pageSize: (index) => ({
        widthPt: pageAt(index).pageWidthPt,
        heightPt: pageAt(index).pageHeightPt,
      }),
      pageCanvas: (index) => pageAt(index).canvas,
      renderPage: async () => {},
      destroy: () => {
        for (const page of pages) page.canvas.width = page.canvas.height = 0;
      },
    };
  }
  if (format === "docx") {
    const { DocxDocument } = await import("/ooxml/docx.mjs");
    return DocxDocument.load(bytes, { mode: "main", cjkFallback: "sc" });
  }
  if (format === "pptx") {
    const { PptxPresentation } = await import("/ooxml/pptx.mjs");
    const presentation = await PptxPresentation.load(bytes, { mode: "main" });
    await presentation.waitUntilLayoutComplete();
    return {
      pageCount: presentation.slideCount,
      waitUntilLayoutComplete: async () => {},
      pageSize: () => ({
        widthPt: presentation.slideWidth / 12700,
        heightPt: presentation.slideHeight / 12700,
      }),
      renderPage: (canvas, index) =>
        presentation.renderSlide(canvas, index, { width: 1600, dpr: 1 }),
      destroy: () => presentation.destroy(),
    };
  }
  if (format !== "xlsx") throw new Error(`Unsupported bridge format: ${format}`);
  const { fitWorksheetWidth } = await import("./xlsx-fit");
  const { XlsxWorkbook } = await import("/ooxml/xlsx.mjs");
  const workbook = await XlsxWorkbook.load(bytes, { mode: "main" });
  try {
    const pages: WorksheetPage[] = [],
      size = { widthPt: 841.89, heightPt: 595.28 };
    const width = Math.round(size.widthPt * 2),
      height = Math.round(size.heightPt * 2),
      margin = 48;
    const indexes =
      xlsxSheet === "all"
        ? Array.from({ length: workbook.sheetCount }, (_, i) => i).filter(
            (i) => !workbook.isHidden(i),
          )
        : [xlsxSheet];
    for (const index of indexes) {
      const sheet = await workbook.getWorksheet(index);
      if (sheet.isChartSheet || sheet.isDialogSheet || sheet.parseError) continue;
      let rows = 1,
        cols = 1;
      for (const row of sheet.rows)
        if (row.cells.length) {
          rows = Math.max(rows, row.index + 1);
          for (const cell of row.cells) cols = Math.max(cols, cell.col + 1);
        }
      const cellScale = xlsxScale === "actual" ? 1 : fitWorksheetWidth(sheet, cols, width, margin);
      const byIndex = new Map(sheet.rows.map((row) => [row.index, row]));
      let start = 0;
      while (start < rows) {
        let used = 0,
          end = start;
        while (end < rows) {
          const h = Math.max(
            12,
            ((byIndex.get(end)?.height ?? sheet.rowHeights[end] ?? sheet.defaultRowHeight) * 96) /
              72,
          );
          if (end > start && used + h > (height - margin * 2) / cellScale) break;
          used += h;
          end++;
        }
        pages.push({
          index,
          viewport: { row: start, col: 0, rows: Math.max(1, end - start), cols },
          options: {
            width,
            height,
            dpr: 1,
            cellScale,
            scrollOffsetX: -margin,
            scrollOffsetY: -margin,
          },
        });
        start = Math.max(end, start + 1);
      }
    }
    return {
      pageCount: pages.length,
      waitUntilLayoutComplete: async () => {},
      pageSize: () => size,
      renderPage: (canvas, index) => {
        const page = pages[index];
        if (!page) throw new Error(`Invalid page index: ${index}`);
        return workbook.renderViewport(canvas, page.index, page.viewport, page.options);
      },
      destroy: () => workbook.destroy(),
    };
  } catch (error) {
    workbook.destroy();
    throw error;
  }
}
