import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { root, replayPath } from "./paths.ts";

if (process.platform !== "darwin")
  throw new Error("Native library bundling currently requires macOS");

// 只修改新目录里的副本；系统库保留系统路径，其余依赖必须完整闭合。
const destination = resolve(root, process.argv[2] ?? "output/native-bundle");
mkdirSync(destination); // 拒绝覆盖已有产物。
mkdirSync(join(destination, "lib"));
const run = (tool: string, args: string[]) => execFileSync(tool, args, { encoding: "utf8" }).trim();
const dependencies = (path: string) =>
  run("/usr/bin/otool", ["-L", path])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" (compatibility")[0]);
const system = (path: string) =>
  path.startsWith("/usr/lib/") || path.startsWith("/System/Library/");
interface BundleItem {
  source: string;
  target: string;
  executable: boolean;
  edges: { original: string; item: BundleItem }[];
}
const files = new Map<string, BundleItem>(),
  names = new Map<string, string>();
function collect(source: string, executable = false): BundleItem {
  const real = realpathSync(source);
  const existing = files.get(real);
  if (existing) return existing;
  const name = executable ? "canvas-cairo-pdf" : basename(source);
  if (names.has(name) && names.get(name) !== real) throw Error(`Library collision: ${name}`);
  names.set(name, real);
  const item: BundleItem = {
    source: real,
    target: join(destination, executable ? name : `lib/${name}`),
    executable,
    edges: [],
  };
  files.set(real, item);
  for (const dep of dependencies(real)) {
    if (system(dep)) continue;
    if (!dep.startsWith("/")) throw Error(`Unresolved dependency: ${dep}`);
    if (realpathSync(dep) === real) continue; // dylib install id
    item.edges.push({ original: dep, item: collect(dep) });
  }
  return item;
}
collect(replayPath, true);
for (const item of files.values()) copyFileSync(item.source, item.target);
for (const item of files.values()) {
  const args = [];
  if (!item.executable) args.push("-id", `@loader_path/${basename(item.target)}`);
  for (const edge of item.edges)
    args.push(
      "-change",
      edge.original,
      `@loader_path/${item.executable ? "lib/" : ""}${basename(edge.item.target)}`,
    );
  if (args.length) run("/usr/bin/install_name_tool", [...args, item.target]);
  run("/usr/bin/codesign", ["--force", "--sign", "-", item.target]);
  const unresolved = dependencies(item.target).filter(
    (path) => !system(path) && !path.startsWith("@loader_path/"),
  );
  if (unresolved.length) throw Error(`Unresolved packaged dependencies: ${unresolved.join(", ")}`);
}
const manifest = [...files.values()].map((item) => ({
  source: item.source,
  file: item.target.slice(destination.length + 1),
  bytes: statSync(item.target).size,
}));
writeFileSync(
  join(destination, "manifest.json"),
  JSON.stringify(
    {
      architecture: run("/usr/bin/uname", ["-m"]),
      files: manifest,
      bytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    destination,
    files: manifest.length,
    bytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
  }),
);
