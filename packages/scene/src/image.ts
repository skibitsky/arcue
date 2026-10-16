const SIGNATURES: readonly { mimeType: string; offset: number; bytes: readonly number[] }[] = [
  { mimeType: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mimeType: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mimeType: "image/webp", offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { mimeType: "image/ktx2", offset: 0, bytes: [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb] },
  { mimeType: "image/vnd-ms.dds", offset: 0, bytes: [0x44, 0x44, 0x53, 0x20] },
  { mimeType: "image/vnd.adobe.photoshop", offset: 0, bytes: [0x38, 0x42, 0x50, 0x53] },
  { mimeType: "image/x-exr", offset: 0, bytes: [0x76, 0x2f, 0x31, 0x01] },
  { mimeType: "image/tiff", offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mimeType: "image/tiff", offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { mimeType: "image/vnd.radiance", offset: 0, bytes: [0x23, 0x3f, 0x52] },
  { mimeType: "image/bmp", offset: 0, bytes: [0x42, 0x4d] },
];

const EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["bmp", "image/bmp"],
  ["tga", "image/x-tga"],
  ["tif", "image/tiff"],
  ["tiff", "image/tiff"],
  ["dds", "image/vnd-ms.dds"],
  ["ktx2", "image/ktx2"],
  ["exr", "image/x-exr"],
  ["hdr", "image/vnd.radiance"],
  ["psd", "image/vnd.adobe.photoshop"],
]);

/** The file name at the end of a path written with either separator. */
export function fileNameOf(path: string): string {
  const slashed = path.replaceAll("\\", "/");
  return slashed.slice(slashed.lastIndexOf("/") + 1);
}

/** The image type from the bytes' signature, falling back to the path's extension. */
export function imageMimeType(bytes: Uint8Array, path: string): string {
  const signature = SIGNATURES.find(({ offset, bytes: expected }) =>
    expected.every((byte, index) => bytes[offset + index] === byte),
  );
  if (signature) return signature.mimeType;
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return (dot === -1 ? undefined : EXTENSIONS.get(name.slice(dot + 1).toLowerCase())) ?? "application/octet-stream";
}
