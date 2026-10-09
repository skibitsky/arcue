/** A 64-bit hash of the bytes as 16 hex digits. Not cryptographic; it tells file versions apart. */
export function contentHash(bytes: Uint8Array): string {
  let h1 = 0x9e3779b9 ^ bytes.length;
  let h2 = 0x85ebca6b ^ bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const wordEnd = bytes.length - (bytes.length % 4);
  for (let offset = 0; offset < wordEnd; offset += 4) {
    const word = view.getUint32(offset, true);
    h1 = Math.imul(h1 ^ word, 2654435761);
    h2 = Math.imul(h2 ^ word, 1597334677);
    h1 = (h1 << 13) | (h1 >>> 19);
    h2 = (h2 << 17) | (h2 >>> 15);
  }
  for (let offset = wordEnd; offset < bytes.length; offset++) {
    const byte = bytes[offset] ?? 0;
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return hex32(h1) + hex32(h2);
}

/** The short id of a file version, such as "3f9a2c1": the first seven hex digits of its content hash. */
export function versionIdOf(bytes: Uint8Array): string {
  return contentHash(bytes).slice(0, 7);
}

function hex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}
