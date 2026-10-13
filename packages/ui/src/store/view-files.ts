import type { FileRole } from "@arcue/protocol";
import { IMAGE_FILE_EXTENSIONS, joinsByName, MODEL_FILE_EXTENSIONS } from "@arcue/protocol";
import type { Clip, TextureSlot } from "@arcue/scene";
import { fileNameOf } from "@arcue/scene";

/** What a host's open dialog offers: model files, or images for a texture slot. */
export type FileKind = "model" | "image";

/**
 * How the window reaches files. The desktop app reads them where they are; the web host has no file system, so it
 * copies picked and dropped files into the core's in-memory workspace beside the asset first.
 */
export interface FileHost {
  /** Shows the host's open dialog and returns paths the core can read, or none when it was cancelled. */
  pick(kind: FileKind, assetPath: string): Promise<string[]>;
  /** Paths the core can read for files dropped on an asset's tab, in their order. */
  place(files: readonly File[], assetPath: string): Promise<string[]>;
  /** Opens dropped files in new tabs, as a drop on an empty tab does. */
  open(files: readonly File[]): void;
  /** Removes what `place` made for dropped files that neither open nor join the view. */
  discard?(files: readonly File[]): void | Promise<void>;
}

/**
 * Models waiting for "New tab", "Add to view" or "Add as animation": dropped on a tab that shows a model, or picked in
 * the open dialog when one of them can join the view in another role than its own.
 */
export interface DropPrompt {
  assetId: string;
  /** The drop point, in pixels from the 3D view's top left corner, or null for picked models. */
  at: { x: number; y: number } | null;
  /** The dropped files, which "New tab" opens; none for picked models. */
  files: readonly File[];
  models: readonly DroppedModel[];
}

/** A dropped or picked model as a path the core can read, with how it joins a view when the core could tell. */
export interface DroppedModel {
  path: string;
  /** The role it takes in a view when nobody names one, or null when the core could not tell. */
  role: FileRole | null;
  /** Every role the core lets it take, its own first; none when the core could not tell. */
  roles: readonly FileRole[];
}

export type DropChoice = "tab" | "view" | "animation";

/** Whether "Add as animation" would add some model as an animation file that "Add to view" adds otherwise. */
export function offersAnimation(models: readonly DroppedModel[]): boolean {
  return models.some((model) => model.role !== "animation" && model.roles.includes("animation"));
}

/** Whether a model can only join a view as an animation file, as one with clips and no meshes does. */
export function onlyAnimation(model: DroppedModel): boolean {
  return model.roles.length > 0 && model.roles.every((role) => role === "animation");
}

function hasExtension(name: string, extensions: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

export function isModelFile(name: string): boolean {
  return hasExtension(name, MODEL_FILE_EXTENSIONS);
}

export function isImageFile(name: string): boolean {
  return hasExtension(name, IMAGE_FILE_EXTENSIONS);
}

/** The model and image files among dropped ones, in their order. */
export function sortDropped<Item extends { name: string }>(files: readonly Item[]): { models: Item[]; images: Item[] } {
  return {
    models: files.filter((file) => isModelFile(file.name)),
    images: files.filter((file) => isImageFile(file.name)),
  };
}

const SLOT_LABELS: Record<TextureSlot, string> = {
  baseColor: "Base color",
  normal: "Normal",
  roughness: "Roughness",
  metalness: "Metalness",
  emissive: "Emissive",
};

export function slotLabel(slot: TextureSlot): string {
  return SLOT_LABELS[slot];
}

/** A path relative to the model's folder, such as a clip's file, as an absolute path with "/" separators. */
export function besideModel(modelPath: string, relative: string): string {
  const segments = modelPath.split("/").slice(0, -1);
  for (const segment of relative.split("/")) {
    if (segment === "..") {
      if (segments.length > 1) segments.pop();
    } else if (segment !== "." && segment !== "") {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

export interface ClipGroup {
  /** The file the clips come from, relative to the model's folder; null for the model's own clips. */
  file: string | null;
  clips: Clip[];
  /** The composition file lists the file, so removing it takes it out of the view. */
  removable: boolean;
}

/**
 * Whether removing an added file takes it out of the view. Model files named "<model stem>@<clip>" beside the model,
 * such as "Hero@Walk.blend", join by their name and are not in the composition file, so they cannot be removed. `file`
 * is relative to the model.
 */
export function removableFromView(file: string, modelName: string): boolean {
  return !(file === fileNameOf(file) && joinsByName(modelName, file));
}

/** The clips by the file they come from, the model's first. */
export function clipGroups(clips: readonly Clip[], modelName: string): ClipGroup[] {
  const groups = new Map<string | null, Clip[]>([[null, []]]);
  for (const clip of clips) {
    const file = clip.file ?? null;
    const group = groups.get(file) ?? [];
    group.push(clip);
    groups.set(file, group);
  }
  return [...groups]
    .filter(([, group]) => group.length > 0)
    .map(([file, group]) => ({
      file,
      clips: group,
      removable: file !== null && removableFromView(file, modelName),
    }));
}
