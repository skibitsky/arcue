import type { Material, TextureRef, TextureSlot } from "./material";
import { TEXTURE_SLOTS } from "./material";
import type { SceneDescription } from "./scene";

/** A slot with an image, a slot whose image was not found, or a slot without one. */
export type SlotState = "set" | "missing" | "empty";

export interface MaterialSlot {
  slot: TextureSlot;
  state: SlotState;
  /** The image's path as the model's file or the composition file writes it; null for an empty slot. */
  path: string | null;
  /** The composition file sets this slot, so removing that restores the file's own texture. */
  overridden: boolean;
  /** The image on screen, as an index into the scene's textures; null when the slot shows none. */
  texture: number | null;
}

export interface MaterialSlots {
  material: string;
  slots: MaterialSlot[];
}

const REF_KEYS: Record<TextureSlot, keyof Material> = {
  baseColor: "baseColorTexture",
  normal: "normalTexture",
  roughness: "roughnessTexture",
  metalness: "metalnessTexture",
  emissive: "emissiveTexture",
};

const STATE_ORDER: Record<SlotState, number> = { set: 0, missing: 1, empty: 2 };

function slotOf(scene: Pick<SceneDescription, "textures">, material: Material, slot: TextureSlot): MaterialSlot {
  const ref = material[REF_KEYS[slot]] as TextureRef | null;
  const texture = ref ? scene.textures[ref.texture] : undefined;
  const shown = texture && ref ? ref.texture : null;
  const override = material.textureOverrides?.[slot];
  if (override) {
    return { slot, state: override.found ? "set" : "missing", path: override.path, overridden: true, texture: shown };
  }
  if (texture)
    return { slot, state: "set", path: texture.storedPath || texture.name, overridden: false, texture: shown };
  const missing = material.missingTextures?.[slot];
  if (missing !== undefined) return { slot, state: "missing", path: missing, overridden: false, texture: null };
  return { slot, state: "empty", path: null, overridden: false, texture: null };
}

/**
 * Each named material once with its texture slots that are set or missing, and always its base color slot, which is
 * where a texture usually goes. Materials that share a name share the composition's textures, so a slot shows the
 * most telling state among them: set, then missing, then empty.
 */
export function materialSlots(scene: Pick<SceneDescription, "materials" | "textures">): MaterialSlots[] {
  const byName = new Map<string, MaterialSlot[]>();
  for (const material of scene.materials) {
    if (material.name === "") continue;
    const slots = TEXTURE_SLOTS.map((slot) => slotOf(scene, material, slot));
    const known = byName.get(material.name);
    byName.set(
      material.name,
      known
        ? known.map((slot, index) => {
            const other = slots[index];
            return other && STATE_ORDER[other.state] < STATE_ORDER[slot.state] ? other : slot;
          })
        : slots,
    );
  }
  return [...byName].map(([material, slots]) => ({
    material,
    slots: slots.filter((slot) => slot.state !== "empty" || slot.slot === "baseColor"),
  }));
}

/** The slots across every material whose image was not found. */
export function missingSlots(materials: readonly MaterialSlots[]): { material: string; slot: MaterialSlot }[] {
  return materials.flatMap(({ material, slots }) =>
    slots.filter((slot) => slot.state === "missing").map((slot) => ({ material, slot })),
  );
}
