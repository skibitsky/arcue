import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/** Which arcue.js this is: the first 16 hex digits of the SHA-256 of the file, or null when it cannot be read. */
export async function buildId(script: string): Promise<string | null> {
  try {
    return createHash("sha256")
      .update(await readFile(script))
      .digest("hex")
      .slice(0, 16);
  } catch {
    return null;
  }
}
