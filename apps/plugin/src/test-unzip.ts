import { crc32, inflateRawSync } from "node:zlib";
import { expect } from "vitest";

/** The files of a zip archive, read through its central directory, checking each one's checksum. */
export function unzip(archive: Buffer): Map<string, Buffer> {
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let index = 0; index < count; index++) {
    expect(archive.readUInt32LE(at)).toBe(0x02014b50);
    const method = archive.readUInt16LE(at + 10);
    const checksum = archive.readUInt32LE(at + 16);
    const size = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const local = archive.readUInt32LE(at + 42);
    const name = archive.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    expect(archive.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const data = archive.subarray(start, start + size);
    const bytes = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    expect(crc32(bytes)).toBe(checksum);
    files.set(name, bytes);
    at += 46 + nameLength;
  }
  return files;
}
