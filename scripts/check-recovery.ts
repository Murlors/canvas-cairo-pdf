import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { readdir, readFile, access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareDocument } from "./prepare.ts";
import { recoverSessions } from "./session-store.ts";
import { hasErrorCode } from "./process-tree.ts";
const root = resolve(import.meta.dirname, ".."),
  sessions = resolve(root, "output/bridge-pages");
await mkdir(sessions, { recursive: true });
if (process.argv[2] === "child") {
  await prepareDocument(resolve(root, "fixtures/stress-40.docx"));
} else {
  const child = fork(import.meta.filename, ["child"], { stdio: "ignore" });
  assert.ok(child.pid, "Recovery test child must start");
  let found: { name: string; pid: number } | undefined;
  try {
    for (let i = 0; i < 100 && !found; i++) {
      for (const name of await readdir(sessions)) {
        try {
          const marker: { state?: unknown; pid?: unknown; ownerPid?: unknown } = JSON.parse(
            await readFile(resolve(sessions, name, "session.json"), "utf8"),
          );
          if (
            marker.ownerPid === child.pid &&
            marker.state === "running" &&
            typeof marker.pid === "number" &&
            Number.isSafeInteger(marker.pid) &&
            marker.pid > 1
          )
            found = { name, pid: marker.pid };
        } catch {}
      }
      if (!found) await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(found, "Managed running session must be observable");
    assert.ok(
      !(await recoverSessions(sessions, child.pid)).includes(found.name),
      "Live session must be preserved",
    );
    child.kill("SIGKILL");
    let gone = false;
    for (let i = 0; i < 100 && !gone; i++) {
      try {
        process.kill(process.platform === "win32" ? found.pid : -found.pid, 0);
      } catch (e) {
        if (hasErrorCode(e, "ESRCH")) gone = true;
        else throw e;
      }
      if (!gone) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(gone, "Parent death must stop render process group");
    if (process.platform === "win32") {
      assert.ok(!(await recoverSessions(sessions, child.pid)).includes(found.name));
      await access(resolve(sessions, found.name));
    } else {
      assert.ok((await recoverSessions(sessions, child.pid)).includes(found.name));
      await assert.rejects(access(resolve(sessions, found.name)), { code: "ENOENT" });
    }
    console.log(
      "PASS: own live session retained; parent death stops renderer; conservative platform recovery",
    );
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
