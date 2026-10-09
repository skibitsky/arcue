import type { Platform } from "@arcue/core";
import { numberedPath } from "../files";
import type { PlacedFile, SeedFile } from "../host-protocol";

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index++) if (a[index] !== b[index]) return false;
  return true;
}

/**
 * Writes a file at its path, or finds it there already with the same bytes. A different file at the path is never
 * replaced: the copy goes to the first free numbered path instead, such as "Sword-2.fbx".
 */
export async function placeFile(
  platform: Pick<Platform, "stat" | "readFile" | "writeFile">,
  file: SeedFile,
): Promise<PlacedFile> {
  for (let number = 1; ; number++) {
    const path = number === 1 ? file.path : numberedPath(file.path, number);
    const stat = await platform.stat(path);
    if (stat === null) {
      await platform.writeFile(path, file.bytes);
      return { path, created: true };
    }
    if (stat.kind === "file" && sameBytes(await platform.readFile(path), file.bytes)) return { path, created: false };
  }
}
