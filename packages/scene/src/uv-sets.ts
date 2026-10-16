import type { Material } from "./material";
import { TEXTURE_REF_KEYS } from "./material";
import type { ImportWarning } from "./source";
import { importWarning } from "./source";

/** How many of a mesh's UV sets the viewport samples textures from. A texture on a later set shows with the first. */
export const VIEWPORT_UV_SETS = 4;

/** One warning for each material whose textures sample UV sets past `VIEWPORT_UV_SETS`. */
export function unshownUvSetWarnings(materials: readonly Material[]): ImportWarning[] {
  const sets = new Map<string, Set<number>>();
  for (const material of materials) {
    for (const key of TEXTURE_REF_KEYS) {
      const ref = material[key];
      if (!ref || ref.uvSet < VIEWPORT_UV_SETS) continue;
      const found = sets.get(material.name) ?? new Set<number>();
      found.add(ref.uvSet);
      sets.set(material.name, found);
    }
  }
  return [...sets].map(([name, unshown]) => {
    const maps = [...unshown].sort((a, b) => a - b).map((set) => set + 1);
    const last = maps.pop();
    const listed = maps.length === 0 ? `UV map ${last}` : `UV maps ${maps.join(", ")} and ${last}`;
    return importWarning(
      "material-approximated",
      { kind: "material", name },
      `Material approximated: ${name}`,
      undefined,
      {
        detail: `Textures on ${listed} show with the first UV map, since the preview draws only the first ${VIEWPORT_UV_SETS}`,
      },
    );
  });
}
