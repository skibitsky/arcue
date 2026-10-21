import { readFile, rename, rm, writeFile } from "node:fs/promises";
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
