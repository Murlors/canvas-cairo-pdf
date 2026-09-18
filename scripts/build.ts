import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { root, harnessPath } from "./paths.ts";
import { buildOoxmlRuntime } from "./build-ooxml-runtime.ts";
await buildOoxmlRuntime();
// 沿用调用者的 Cargo/pkg-config 环境，不绑定 Homebrew 安装前缀。
execFileSync("cargo", ["build", "--release", "--locked"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (process.platform === "darwin") {
  await mkdir(dirname(harnessPath), { recursive: true });
  execFileSync(
    "swiftc",
    [
      "-O",
      join(root, "hosts/macos/wk-harness.swift"),
      "-o",
      harnessPath,
      "-framework",
      "WebKit",
      "-framework",
      "AppKit",
    ],
    { cwd: root, stdio: "inherit" },
  );
}
