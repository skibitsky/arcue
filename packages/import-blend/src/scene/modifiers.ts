import type { BlendStruct } from "../blend/file";
import { ownedList } from "../blend/lists";

/** Blender's `eModifierType` values this importer acts on. */
export const ModifierType = {
  armature: 8,
  boolean: 11,
  array: 12,
  collision: 23,
  surface: 30,
  screw: 34,
  ocean: 39,
  skin: 42,
  meshSequenceCache: 52,
  fluid: 56,
  nodes: 57,
  volumeToMesh: 60,
} as const;

/** Modifiers that change nothing a preview shows, such as physics collision settings. */
const PREVIEW_NEUTRAL: ReadonlySet<number> = new Set([ModifierType.collision, ModifierType.surface]);

const MODE_REALTIME = 1 << 0;

/** The `ModifierData` header every modifier struct starts with. */
function modifierHeader(modifier: BlendStruct): BlendStruct | null {
  return modifier.typeName === "ModifierData" ? modifier : modifier.struct("modifier");
}

export function modifierType(modifier: BlendStruct): number {
  return modifierHeader(modifier)?.number("type") ?? -1;
}

export function modifierName(modifier: BlendStruct): string {
  return modifierHeader(modifier)?.string("name") ?? "";
}

/**
 * The object's modifiers that are on in viewports, in stack order. Each object's list is read once. Blender gives each
 * modifier to one object, so a list ends before a modifier that another object's list holds.
 */
export function viewportModifiers(object: BlendStruct): BlendStruct[] {
  return ownedList(object, "modifiers").filter((modifier) => {
    const mode = modifierHeader(modifier)?.number("mode") ?? 0;
    return (mode & MODE_REALTIME) !== 0;
  });
}

/** Whether a modifier changes what a preview shows. */
export function changesPreview(modifier: BlendStruct): boolean {
  return !PREVIEW_NEUTRAL.has(modifierType(modifier));
}
