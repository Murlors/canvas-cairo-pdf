import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** 仅用于本工具以 detached 创建的子进程；Windows 不使用负 PID。 */
export async function terminateProcessTree(pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Invalid child PID");
  if (process.platform === "win32") {
    await promisify(execFile)("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    return;
  }
  const signal = (value: NodeJS.Signals) => {
    try {
      process.kill(-pid, value);
    } catch (error) {
      if (!hasErrorCode(error, "ESRCH")) throw error;
    }
  };
  signal("SIGTERM");
  await delay(500);
  signal("SIGKILL");
}
