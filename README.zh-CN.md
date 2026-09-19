# canvas-cairo-pdf

[English](README.md)

使用 TypeScript 文档适配器与 Rust Cairo/Pango 后端在本地生成 PDF。浏览器完成布局并记录带版本的 Canvas 指令，原生后端将支持的文字、矢量和图片输出为多页 PDF。本项目不提交打印任务，也不承诺完整的 Microsoft Office/WPS 排版兼容性。

## 当前功能

| 输入 | 路径与限制 |
| --- | --- |
| DOCX | 独立 OOXML 适配器，支持多页、逐页尺寸、文字、表格和图片；受支持的绘图操作范围限制。 |
| PPTX | 独立 OOXML 适配器，每张幻灯片对应一页；不支持的绘图明确失败。 |
| XLSX | 独立 OOXML 适配器，按使用范围在横向 A4 上分页，支持适合宽度、原始比例和工作表选择；不是完整 Excel 打印引擎。 |
| Markdown；PNG、JPEG、WebP、GIF、BMP | 当前需要下述可选 Pliflo 集成适配器，尚不能独立使用。 |
| PDF | 通过 `prepareDocument` 原件透传；解析失败时页数为 `null`，不代表已验证可读或可打印。`render` 命令不接受 PDF。 |
| Canvas 录制 JSON | 独立 Rust CLI 或库；运行时无需浏览器、Node、Bun，但仍需要原生依赖库。 |

开发宿主为 macOS 系统 WKWebView 和 Playwright Chromium。CI 覆盖 Linux/macOS 构建与测试、Linux Chromium 渲染及 Windows 原生测试。不同机器的字体表现、完整桌面集成和干净机器分发仍需单独验证。

## 从全新克隆构建

需要 Node **24.12 或更新版本**、Bun **1.4.2**、Rust stable（含 Cargo/rustfmt）及原生依赖。Bun 安装锁定的 JavaScript 依赖，Node 执行 TypeScript 宿主脚本。Python 仅用于样本生成和诊断。

```sh
git clone https://github.com/Murlors/canvas-cairo-pdf.git
cd canvas-cairo-pdf

# macOS
brew install pkgconf cairo pango
# 缺少 Xcode Command Line Tools 时运行：xcode-select --install

# Debian/Ubuntu 替代安装命令：
# sudo apt-get update
# sudo apt-get install -y pkg-config libcairo2-dev libpango1.0-dev fonts-noto-cjk

bun install --frozen-lockfile
bun run build
bun run check
bun run test
```

Cairo/Pango 通过 `pkg-config` 定位，不要求固定 Homebrew 路径。请安装覆盖文档语言的字体。

**渲染或运行 `bun run test` 前必须完整构建。** 构建生成浏览器模块、版本与哈希校验的 OOXML runtime、release Rust 渲染器，并在 macOS 编译 Swift WKWebView 宿主。跨语言测试会调用 release 渲染器；仅运行 `bun run build:browser` 不会生成原生渲染器或 OOXML runtime。

使用 Chromium 时另行安装浏览器：

```sh
bunx --no-install playwright-core install chromium
# Linux 同时安装浏览器系统依赖：
# bunx --no-install playwright-core install --with-deps chromium
```

Windows 原生开发使用 MSYS2 UCRT64 shell，安装 `mingw-w64-ucrt-x86_64-rust`、`mingw-w64-ucrt-x86_64-pkgconf`、`mingw-w64-ucrt-x86_64-cairo` 和 `mingw-w64-ucrt-x86_64-pango`，再运行 `cargo test --workspace --locked`。不要混用 MSVC 与 MinGW 库。Windows 完整 TypeScript/Chromium 流程仍需单独验证，原生配置见 [CI](.github/workflows/check.yml)。

## 渲染文档

完整构建后，在仓库根目录运行：

```sh
bun run render /absolute/path/report.docx
bun run render /absolute/path/slides.pptx chromium
PLIFLO_XLSX_SCALE=fit PLIFLO_XLSX_SHEET=0 bun run render /absolute/path/workbook.xlsx
```

macOS 默认使用 `webkit`，其他平台默认使用 `chromium`。输出位于独立的 `output/bridge-pages/<session>/pages/document.pdf`。最后一行 JSON 返回会话目录、引擎、页数和渲染耗时。默认诊断包含逐页录制、Canvas PNG 和逐页 PDF；设置 `PLIFLO_DIAGNOSTICS=0` 可关闭这些额外产物。

开发准备 API 提供超时、取消和单任务准入：

```ts
import { prepareDocument } from './scripts/prepare.ts';

const result = await prepareDocument('/absolute/path/report.docx', {
  timeoutMs: 120000,
  signal: new AbortController().signal,
});
console.log(result.pdfPath, result.pages, result.generated);
```

在 checkout 中使用 Node 执行调用该 API 的脚本。非 PDF 输入需要完整构建和可用宿主。API 关闭逐页诊断、保留成功生成的 PDF，并通过 `BUSY`、`CANCELLED`、`TIMEOUT` 或 `RENDER_FAILED` 表示受管理的准备失败。单任务限制只在模块内生效，不是跨进程锁。

### 可选 Pliflo 集成适配器

`scripts/build-pliflo-reference.ts` 从独立的本地 Pliflo checkout 的 `src/lib/documents.ts` 构建适配器。独立 Office 渲染和原生重放不需要它；Markdown、图片和 Office worker-reference 对照当前需要它。先按 Pliflo 项目说明安装其依赖，宿主运行时会使用其中的 `marked` 模块。

```sh
# 先按 Pliflo 项目说明在 /absolute/path/Pliflo 安装依赖。
PLIFLO_SOURCE_ROOT=/absolute/path/Pliflo bun run build:reference
PLIFLO_SOURCE_ROOT=/absolute/path/Pliflo bun run render /absolute/path/notes.md
PLIFLO_SOURCE_ROOT=/absolute/path/Pliflo bun run render /absolute/path/photo.png
```

生成模块与源码哈希位于 `output/pliflo-reference/`。渲染时继续设置 `PLIFLO_SOURCE_ROOT`。源码边界不匹配时构建器明确失败，不保证任意 Pliflo 版本可用；源文件变化后应重新构建。Markdown 本地图片访问限于源文档目录树内受支持的图片文件。权属说明见[第三方声明](THIRD_PARTY_NOTICES.md)。

### 环境变量

`PLIFLO_*` 名称保持为当前配置接口。

| 变量 | 含义 |
| --- | --- |
| `PLIFLO_ENGINE` | `webkit` 或 `chromium`；显式参数/API 选项优先。WKWebView 仅限 macOS。 |
| `PLIFLO_DIAGNOSTICS` | `0` 关闭逐页诊断；`prepareDocument` 始终设为 `0`。 |
| `PLIFLO_XLSX_SCALE` | `fit`（默认）、`fit-width`（相同适合宽度路径）或 `actual`。 |
| `PLIFLO_XLSX_SHEET` | 不设置时选择全部可见工作表；数字为从零开始的索引，可显式选择隐藏工作表。 |
| `PLIFLO_IMAGE_SIZING` | 集成适配器中的 `fit`（默认）或 `actual`。 |
| `PLIFLO_SOURCE_ROOT` | 本地 Pliflo checkout，默认同级 `../Pliflo`。 |
| `PLIFLO_WORKER_REFERENCE` | `1` 使用集成适配器的 Office 对照函数。 |
| `PLIFLO_FONT_DIAGNOSTICS` | 只要设置即启用原生 CLI 请求/实际字体诊断，不记录正文。 |
| `PLIFLO_FONT_ALIASES` | 原生 CLI 字体名称替换映射 JSON 文件。 |
| `PLAYWRIGHT_MODULE` | Chromium 模块导入覆盖值，默认 `playwright-core`。 |

## 独立原生重放

安装 Rust 与 Cairo/Pango 后：

```sh
cargo build --release --locked
# 已有录制或清单；输出必须是新 PDF 路径：
./target/release/canvas-cairo-pdf /absolute/path/commands.json /absolute/path/new.pdf
```

Windows 可执行文件带 `.exe` 后缀。输出父目录必须存在，目标路径必须不存在。输入可以是单页录制或页面清单，见[协议](docs/protocol.md)。CLI 不解析 Office 文件。Rust 嵌入方可调用 `canvas_cairo_replay::render_file` 或 `render_input`，显式传入 `RenderOptions`。

## 验证与限制

安装 Python 3.12+ 和 Poppler（`brew install poppler` 或 `sudo apt-get install poppler-utils`）后：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python tools/make-fixtures.py
.venv/bin/python tools/make-representative.py
.venv/bin/python tools/make-office-fixtures.py
bun run test:lifecycle
.venv/bin/python tools/acceptance.py
.venv/bin/python tools/check-xlsx-fit.py
```

文档检查还需要完整构建与选定宿主。Linux 使用上述 Chromium 安装流程；macOS 也可通过 `PLIFLO_ENGINE=chromium` 切换。页面对照时保持诊断开启。其他保留工具及前提见[贡献指南](CONTRIBUTING.md)。

- 原生后端只支持 Canvas 子集；浏览器能显示的复杂 Office 内容仍可能无法输出。
- XLSX 使用横向 A4 和使用范围/行高分页，不实现完整 Excel 打印设置、打印区域或横向分片。原始比例的宽表可能裁切；图表工作表、对话框工作表及报告解析错误的工作表会跳过。
- 浏览器与 Pango 分别解析字体，可用字体会影响排版和输出。
- 开发 runner 使用 Base64 PNG；嵌入宿主可使用导出录制器的二进制 `CCP1` 页帧。顺序落盘不等于所有源码/录制内存都有严格上限，集成适配器可能保留多页 Canvas。
- Windows 取消终止当前子进程树；崩溃遗留会话保守保留，尚无可靠自动回收。
- 合成样本与浏览器对照不等于 Office 排版金标准。子进程 RSS 不包含部分系统管理的 WebKit 辅助进程。
- 原生打包当前仅限 macOS。干净机器验收、发行签名及完整动态库许可审计尚未完成。

## 目录与许可

`browser/` 为 TypeScript 适配/录制，`crates/replay/` 为 Rust 库/CLI，`scripts/` 为构建与开发调度，`hosts/macos/` 为 WKWebView 宿主，`compat/ooxml/` 为固定版本扩展，`tools/` 为 Python 检查。生成产物位于 `output/`，合成输入位于 `fixtures/`。

[维护规则](AGENTS.md) · [贡献指南](CONTRIBUTING.md) · [架构](docs/architecture.md) · [协议](docs/protocol.md) · [发布准备](docs/releasing.md)

项目自身代码使用 [MIT](LICENSE)。依赖、适配器派生代码、字体和文档保留各自许可，见[第三方声明](THIRD_PARTY_NOTICES.md)。package 保持 private，没有 npm 发布流程。
