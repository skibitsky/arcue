import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** The path in the archive, with forward slashes. */
  name: string;
  bytes: Uint8Array;
}

/** 1 January 1980, the earliest time a zip entry holds, so the same files always make the same archive. */
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;
const STORE = 0;
const VERSION = 20;
const MADE_ON_UNIX = 3 << 8;
const REGULAR_FILE = 0o100644;

/** A zip archive of the entries, in the order given, each deflated unless that makes it larger. */
export function zip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length > 0xffff) {
    throw new Error("The archive has too many files for a zip file without its 64-bit extension.");
  }
  const names = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (
      !entry.name ||
      entry.name.startsWith("/") ||
      entry.name.includes("\\") ||
      entry.name.split("/").includes("..")
    ) {
      throw new Error(`"${entry.name}" is not a path an archive can hold.`);
    }
    if (names.has(entry.name)) throw new Error(`The archive holds ${entry.name} twice.`);
    names.add(entry.name);
    const name = Buffer.from(entry.name, "utf8");
    const deflated = deflateRawSync(entry.bytes, { level: 9 });
    const stored = deflated.length >= entry.bytes.length;
    const data = stored ? Buffer.from(entry.bytes) : deflated;
    const method = stored ? STORE : DEFLATE;
    const checksum = crc32(entry.bytes);
    if (data.length > 0xffffffff || entry.bytes.length > 0xffffffff || offset > 0xffffffff) {
      throw new Error("The archive is too large for a zip file without its 64-bit extension.");
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(MADE_ON_UNIX | VERSION, 4);
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(REGULAR_FILE * 0x10000, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
