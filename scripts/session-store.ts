import { readFile, writeFile, rename, readdir, lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { hasErrorCode } from "./process-tree.ts";

export async function markSession(directory: string, state: "running" | "complete") {
  const target = join(directory, "session.json");
  await writeFile(
    target + ".tmp",
    JSON.stringify({
      version: 1,
      kind: "pliflo-bridge",
      pid: process.pid,
      ownerPid: process.ppid,
      platform: process.platform,
      state,
    }),
  );
  await rename(target + ".tmp", target);
}

/** Reclaim only marked, abandoned sessions; preserve unmarked and completed outputs. */
export async function recoverSessions(root: string, ownerPid?: number): Promise<string[]> {
  // Windows 无法通过组长 PID 证明整个子树已退出，保留遗留会话以免删除仍在写入的文件。
  if (process.platform === "win32") return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (e) {
    if (hasErrorCode(e, "ENOENT")) return [];
    throw e;
  }
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^(webkit|chromium)-/.test(entry.name)) continue;
    const directory = join(root, entry.name),
      marker = join(directory, "session.json");
    let data: unknown;
    try {
      if (!(await lstat(marker)).isFile()) continue;
      data = JSON.parse(await readFile(marker, "utf8"));
    } catch {
      continue;
    }
    if (
      !data ||
      typeof data !== "object" ||
      !("version" in data) ||
      data.version !== 1 ||
      !("kind" in data) ||
      data.kind !== "pliflo-bridge" ||
      !("state" in data) ||
      data.state !== "running" ||
      !("pid" in data) ||
      typeof data.pid !== "number" ||
      !Number.isSafeInteger(data.pid) ||
      data.pid <= 1
    )
      continue;
    if (ownerPid !== undefined && (!("ownerPid" in data) || data.ownerPid !== ownerPid)) continue;
    if ("platform" in data && data.platform !== process.platform) continue;
    try {
      process.kill(-data.pid, 0);
      continue;
    } catch (e) {
      if (!hasErrorCode(e, "ESRCH")) continue;
    }
    await rm(directory, { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}
