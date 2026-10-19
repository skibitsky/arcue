import type { BuiltScene, ObjectRecord } from "../scene/build.js";
import type { BlendWarning } from "../types.js";
import type { ParsedClip } from "./clips.js";

const ARMATURE_REST_POSITION = 1 << 0;

/** Whether an armature is set to Blender's rest position, which shows it at rest whatever its pose. */
export function inRestPosition(record: ObjectRecord): boolean {
  return ((record.object.data?.number("flag") ?? 0) & ARMATURE_REST_POSITION) !== 0;
}

/**
 * Warnings for armatures set to Blender's rest position that a clip poses. Blender keeps such an armature at rest
 * whatever its action does; the preview plays the clip.
 */
export function restPositionWarnings(scene: BuiltScene, clips: readonly ParsedClip[]): BlendWarning[] {
  return scene.objects.flatMap((record): BlendWarning[] => {
    const { object, armature } = record;
    if (!armature || !inRestPosition(record)) return [];
    const bones = new Set(armature.nodes);
    const posing = clips.filter((clip) => clip.tracks.some((track) => bones.has(track.node)));
    if (posing.length === 0) return [];
    return [
      {
        code: "deform-approximated",
        subject: { kind: "node", name: object.name },
        message: `Rest position not followed: ${object.name}`,
        detail: `Blender shows this armature in its rest position; the preview poses it in ${posing.map((clip) => clip.name).join(", ")}`,
      },
    ];
  });
}
