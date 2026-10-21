import { randomBytes } from "node:crypto";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fromNativePath, NodePlatform } from "@arcue/platform-node";
import type { LockRecord } from "@arcue/protocol";
import { LOCKS_FOLDER } from "@arcue/protocol";

function lockFiles(userData: string): string[] {
  try {
    return readdirSync(join(userData, LOCKS_FOLDER)).filter((name) => name.endsWith(".lock"));
  } catch {
    return [];
  }
}

/**
 * Writes the lock `name` of `folder` as another Arcue holds it, one whose process this one cannot judge, so the cores
 * of this process wait for it and time out on it as on another process. Only its release, or a minute without a
 * heartbeat, lets them in.
 */
export async function holdLockElsewhere(
  userData: string,
  folder: string,
  name: string,
): Promise<{ file: string; release(): void }> {
  const platform = new NodePlatform({
    appDataDir: fromNativePath(userData),
    startImportWorker: () => {
      throw new Error("This platform imports nothing.");
    },
  });
  const before = new Set(lockFiles(userData));
  const unlock = await platform.lock(fromNativePath(folder), name);
  const created = lockFiles(userData).find((file) => !before.has(file));
  await unlock();
  if (created === undefined) throw new Error(`The lock ${name} of ${folder} made no lock file.`);
  const file = join(userData, LOCKS_FOLDER, created);
  const record: LockRecord = {
    arcueLock: 1,
    token: randomBytes(16).toString("hex"),
    instance: randomBytes(16).toString("hex"),
    pid: process.pid,
    host: hostname().slice(0, 255),
    ns: null,
    acquiredAt: Date.now(),
  };
  writeFileSync(file, JSON.stringify(record));
  return { file, release: () => rmSync(file, { force: true }) };
}

/** The lock files in the data folder's `locks` folder. */
export function heldLockFiles(userData: string): string[] {
  return lockFiles(userData);
}
