import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CoreKind, LastCore } from "@arcue/protocol";
import { LAST_CORE_FILE, lastCoreSchema } from "@arcue/protocol";

/** What `last-core.json` says: which kind of core started, stopped cleanly or was being started last. */
export async function readLastCore(userData: string): Promise<LastCore | null> {
  try {
    const parsed = lastCoreSchema.safeParse(JSON.parse(await readFile(join(userData, LAST_CORE_FILE), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Records the kind of core in `last-core.json`, keeping the address Arcue in the browser served at unless `url` gives
 * a new one. Callers hold the start lock. It never rejects: a record it cannot write is left as it was.
 */
export async function writeLastCore(userData: string, kind: CoreKind, url?: string): Promise<void> {
  const file = join(userData, LAST_CORE_FILE);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    const serveUrl = url ?? (await readLastCore(userData))?.serveUrl;
    const record: LastCore = { version: 1, kind, ...(serveUrl !== undefined ? { serveUrl } : {}) };
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await rename(temporary, file);
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

/**
 * Records the kind as `writeLastCore` does, and returns a function that puts back what `last-core.json` held before,
 * or removes it when it held nothing, while the file is still the one this wrote. Callers hold the start lock for
 * both. Neither rejects.
 */
export async function replaceLastCore(userData: string, kind: CoreKind, url?: string): Promise<() => Promise<void>> {
  const file = join(userData, LAST_CORE_FILE);
  const before = await readFile(file).catch(() => null);
  await writeLastCore(userData, kind, url);
  const written = await identity(file);
  return async () => {
    if (written === null || (await identity(file)) !== written) return;
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      if (before === null) await rm(file, { force: true });
      else {
        await writeFile(temporary, before, { mode: 0o600 });
        await rename(temporary, file);
      }
    } catch {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  };
}

/** Tells a file from one written in its place since, which every writer does through a new temporary file. */
async function identity(path: string): Promise<string | null> {
  const found = await stat(path, { bigint: true }).catch(() => null);
  return found ? `${found.dev}:${found.ino}:${found.mtimeNs}` : null;
}
