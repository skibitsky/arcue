/** Makes the addresses the window's images show bytes at, such as comment screenshots and texture previews. */
export interface ImageUrls {
  /** Null where the page cannot make one. */
  create(bytes: Uint8Array, type: string): string | null;
  revoke(url: string): void;
}

/** Object URLs, the default. */
export const objectUrls: ImageUrls = {
  create: (bytes, type) =>
    typeof URL.createObjectURL === "function" ? URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type })) : null,
  revoke: (url) => URL.revokeObjectURL(url),
};

const CHUNK = 0x8000;

/** Data URLs, for a page whose content security policy allows no blob: images, as apps that show MCP Apps set. */
export const dataUrls: ImageUrls = {
  create: (bytes, type) => {
    let binary = "";
    for (let at = 0; at < bytes.byteLength; at += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
    }
    return `data:${type};base64,${btoa(binary)}`;
  },
  revoke: () => undefined,
};
