import type { CompositionFile } from "@arcue/protocol";
import { joinsByName } from "@arcue/protocol";

/** The image types an importer may read beside a model, as the core's referenced-file check allows them. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "tga", "tif", "tiff", "bmp", "dds", "exr", "hdr", "webp"]);

/** Where samples and opened files live in the core's in-memory platform. */
export const SAMPLES_FOLDER = "/samples";
export const FILES_FOLDER = "/files";

export interface SampleInfo {
  id: string;
  /** The file to open: a model, or a composition file that opens its model. */
  file: string;
  description: string;
  /** Every file to fetch, `file` first. */
  files: readonly string[];
}

export function samplePath(file: string): string {
  return `${SAMPLES_FOLDER}/${file}`;
}

function safeName(name: string): string {
  return name.replace(/[\\/]/g, "_");
}

/**
 * Each opened model gets its own folder, named after the model without its extension, and the textures picked with
 * it go beside it there, so textures of the same name from different drops do not overwrite each other.
 */
export function openedFilePath(model: string, file: string = model): string {
  return `${openedModelFolder(model)}/${safeName(file)}`;
}

export function openedModelFolder(model: string): string {
  const name = safeName(model);
  const dot = name.lastIndexOf(".");
  return `${FILES_FOLDER}/${dot > 0 ? name.slice(0, dot) : name}`;
}

/**
 * Where a file added to an opened asset's view goes: beside the model in its folder, as a file next to a model on
 * disk would sit. A file with the model's own name is refused, since it would replace the model.
 */
export function besideAsset(assetPath: string, file: string): string {
  const slash = assetPath.lastIndexOf("/");
  const name = safeName(file);
  if (name === assetPath.slice(slash + 1)) throw new Error(`${name} is the model itself.`);
  return `${assetPath.slice(0, slash)}/${name}`;
}

/** The path with a number before its extension, such as "Sword-2.fbx", for a copy beside a different same-named file. */
export function numberedPath(path: string, number: number): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const at = dot > slash + 1 ? dot : path.length;
  return `${path.slice(0, at)}-${number}${path.slice(at)}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Splits picked or dropped files into models, composition files, textures, and files Arcue cannot use. */
export function partitionFiles<Item extends { name: string }>(
  files: readonly Item[],
): { models: Item[]; compositions: Item[]; textures: Item[]; ignored: Item[] } {
  const models: Item[] = [];
  const compositions: Item[] = [];
  const textures: Item[] = [];
  const ignored: Item[] = [];
  for (const file of files) {
    const extension = extensionOf(file.name);
    if (extension === "fbx") models.push(file);
    else if (extension === "arcue") compositions.push(file);
    else if (IMAGE_EXTENSIONS.has(extension)) textures.push(file);
    else ignored.push(file);
  }
  return { models, compositions, textures, ignored };
}

/** One tab to open: the file to open, and the files to place in its folder first, itself included. */
export interface OpenPlan<Item> {
  open: Item;
  files: Item[];
}

/**
 * What to open from files picked or dropped together. Dropped files arrive without their folders, so each
 * composition file goes in a folder with every model and texture of the drop. A model opens on its own unless a
 * composition names it or it joins another model in the drop by its name, "<model stem>@<clip>.fbx", as the core
 * joins such files. `contents` holds each composition file's content, or null when it could not be read.
 */
export function planOpen<Item extends { name: string }>(
  files: readonly Item[],
  contents: ReadonlyMap<Item, CompositionFile | null>,
): OpenPlan<Item>[] {
  const { models, compositions, textures } = partitionFiles(files);
  const named = new Set<string>();
  for (const composition of compositions) {
    const content = contents.get(composition);
    if (!content) continue;
    const listed = [content.model, ...(content.animations ?? []), ...(content.attach ?? []).map((entry) => entry.file)];
    for (const path of listed) named.add(fileNameOf(path));
  }
  const joins = (model: Item, file: Item) => file !== model && joinsByName(model.name, file.name);
  const plans: OpenPlan<Item>[] = compositions.map((composition) => ({
    open: composition,
    files: [composition, ...models, ...textures],
  }));
  for (const model of models) {
    if (named.has(model.name) || models.some((other) => joins(other, model))) continue;
    const animations = models.filter((other) => joins(model, other));
    plans.push({ open: model, files: [model, ...animations, ...textures] });
  }
  return plans;
}
