import { normalizePath } from "@arcue/core";

export type PathStyle = "posix" | "win32";

export const hostPathStyle: PathStyle = process.platform === "win32" ? "win32" : "posix";

/** A `Platform` path, with "/" separators, as the operating system writes it. */
export function toNativePath(path: string, style: PathStyle = hostPathStyle): string {
  const normalized = normalizePath(path);
  if (style === "posix") return normalized;
  const native = normalized.replaceAll("/", "\\");
  return /^[A-Z]:\\?$/.test(native) ? `${native.slice(0, 2)}\\` : native;
}

/** An absolute operating system path as a `Platform` path: "/" separators and an uppercase drive letter. */
export function fromNativePath(path: string, style: PathStyle = hostPathStyle): string {
  return normalizePath(style === "win32" ? path.replaceAll("\\", "/") : path);
}
