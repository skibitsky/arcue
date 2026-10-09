import type { FoundFile } from "@arcue/scene";
import { createFileSearch, isReadableImage } from "./file-search";
import { contentHash } from "./hash";
import { insideWithoutLinks } from "./links";
import { basename, dirname, joinPath, pathInside } from "./paths";
import type { Platform } from "./platform";

type FileRequest = { kind: "read" | "find" | "locate"; path: string };

export async function readReferencedFile(
  platform: Platform,
  assetPath: string,
  relativePath: string,
  readRoot: string = dirname(assetPath),
): Promise<Uint8Array | null> {
  const resolved = referencedPath(assetPath, relativePath, readRoot);
  if (resolved === null || !(await insideWithoutLinks(platform, readRoot, resolved))) return null;
  const stat = await platform.stat(resolved);
  return stat?.kind === "file" ? platform.readFile(resolved) : null;
}

function referencedPath(assetPath: string, relativePath: string, readRoot: string): string | null {
  const slashed = relativePath.replaceAll("\\", "/");
  if (slashed === "" || slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) return null;
  const resolved = joinPath(dirname(assetPath), slashed);
  return pathInside(readRoot, resolved) && isReadableImage(basename(resolved)) ? resolved : null;
}

export class ImportFiles {
  readonly watch = new Set<string>();
  readonly #platform: Platform;
  readonly #assetPath: string;
  readonly #readRoot: string;
  readonly #search: ReturnType<typeof createFileSearch>;
  readonly #records = new Map<string, { request: FileRequest; result: string | null }>();

  constructor(platform: Platform, assetPath: string, readRoot: string) {
    this.#platform = platform;
    this.#assetPath = assetPath;
    this.#readRoot = readRoot;
    this.#search = createFileSearch(platform, assetPath, readRoot, (path) => this.watch.add(path));
  }

  get identity(): string | null {
    if (this.#records.size === 0) return null;
    const entries = [...this.#records]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, { result }]) => [key, result]);
    return contentHash(new TextEncoder().encode(JSON.stringify(entries)));
  }

  async read(path: string): Promise<Uint8Array | null> {
    const resolved = referencedPath(this.#assetPath, path, this.#readRoot);
    if (resolved !== null && (await insideWithoutLinks(this.#platform, this.#readRoot, resolved)))
      this.watch.add(resolved);
    const bytes = await readReferencedFile(this.#platform, this.#assetPath, path, this.#readRoot);
    this.#record({ kind: "read", path }, bytes === null ? null : contentHash(bytes));
    return bytes;
  }

  async find(path: string): Promise<FoundFile | null> {
    const found = await this.#search.find(path);
    this.#record(
      { kind: "find", path },
      found === null ? null : JSON.stringify([found.path, contentHash(found.bytes)]),
    );
    return found;
  }

  async locate(path: string): Promise<string | null> {
    const found = await this.#search.locate(path);
    this.#record({ kind: "locate", path }, found);
    return found;
  }

  async refresh(assetPath: string, readRoot: string): Promise<ImportFiles> {
    const next = new ImportFiles(this.#platform, assetPath, readRoot);
    for (const { request } of this.#records.values()) await next[request.kind](request.path);
    return next;
  }

  #record(request: FileRequest, result: string | null): void {
    this.#records.set(JSON.stringify(request), { request, result });
  }
}
