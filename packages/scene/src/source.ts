import type { TextureSlot } from "./material";
import type { Quat } from "./math";

export type SourceFormat = "fbx" | "blend" | "gltf" | "glb";

export type AxisDirection = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";

export interface CoordinateAxes {
  right: AxisDirection;
  up: AxisDirection;
  front: AxisDirection;
}

export interface Space {
  axes: CoordinateAxes;
  unitMeters: number;
}

/** The space of every position, transform and track in a scene description: meters, right-handed, +Y up. */
export const SCENE_SPACE: Space = {
  axes: { right: "+X", up: "+Y", front: "+Z" },
  unitMeters: 1,
};

/** How the importer moved the file's data from its original space into `SCENE_SPACE`. */
export interface SpaceConversion {
  scale: number;
  rotation: Quat;
}

export interface Exporter {
  name: string;
  version: string | null;
}

export type ImportWarningCode =
  | "texture-not-found"
  | "texture-path-absolute"
  | "texture-not-used"
  | "root-scale"
  | "root-rotation"
  | "too-many-uv-sets"
  | "too-many-bones"
  | "extra-skins"
  | "unweighted-vertices"
  | "inbetween-shapes"
  | "bind-pose-mismatch"
  | "clip-not-sampled"
  | "left-handed-axes"
  | "invalid-data"
  | "animation-bones-missing"
  | "file-not-found"
  | "model-not-found"
  | "composition-not-loaded"
  | "node-not-found"
  | "material-not-found"
  | "modifier-not-applied"
  | "constraint-not-evaluated"
  | "driver-not-evaluated"
  | "curve-modifier-not-applied"
  | "deform-approximated"
  | "object-not-shown"
  | "library-not-loaded";

export type ImportWarningSeverity = "warning" | "error";

export type ImportWarningSubjectKind = "texture" | "material" | "node" | "clip" | "file";

export interface ImportWarningSubject {
  kind: ImportWarningSubjectKind;
  /** The texture's file name, the material's, node's or clip's name, a node path or part id, or a file's name. */
  name: string;
}

export interface ImportWarning {
  /** Stable across versions, for tools and agents to match on. */
  code: ImportWarningCode;
  severity: ImportWarningSeverity;
  subject: ImportWarningSubject;
  /** Short and plain, for people. */
  message: string;
  /** The composition's file the warning comes from, relative to the model's folder; absent for the model's file. */
  file?: string;
  /** Facts for people and agents beyond the message, such as the path the file stores for a texture. */
  detail?: string;
  /** For a texture subject: the materials that use the texture, by name. */
  materials?: string[];
  /** For a texture subject: where the image was found, relative to the folder of the file the warning comes from. */
  foundPath?: string;
  /** For a texture subject: the material slots that use the texture and that a composition file can set. */
  uses?: TextureUse[];
}

/** A material's texture slot that uses a texture. */
export interface TextureUse {
  material: string;
  slot: TextureSlot;
}

const SLOT_NAMES: Readonly<Record<TextureSlot, string>> = {
  baseColor: "base color",
  normal: "normal",
  roughness: "roughness",
  metalness: "metalness",
  emissive: "emissive",
};

/** The uses for a warning's detail, such as "base color of Stone, normal of Rock". */
export function describeTextureUses(uses: readonly TextureUse[]): string {
  return uses.map((use) => `${SLOT_NAMES[use.slot]} of ${use.material}`).join(", ");
}

export type ImportWarningExtra = Pick<ImportWarning, "detail" | "materials" | "foundPath" | "uses">;

/** An "error" means the preview is missing something the file meant to show. */
export const importWarningSeverity: Readonly<Record<ImportWarningCode, ImportWarningSeverity>> = {
  "texture-not-found": "error",
  "texture-path-absolute": "warning",
  "texture-not-used": "warning",
  "root-scale": "warning",
  "root-rotation": "warning",
  "too-many-uv-sets": "warning",
  "too-many-bones": "error",
  "extra-skins": "warning",
  "unweighted-vertices": "warning",
  "inbetween-shapes": "warning",
  "bind-pose-mismatch": "warning",
  "clip-not-sampled": "error",
  "left-handed-axes": "warning",
  "invalid-data": "warning",
  "animation-bones-missing": "warning",
  "file-not-found": "error",
  "model-not-found": "error",
  "composition-not-loaded": "error",
  "node-not-found": "error",
  "material-not-found": "warning",
  "modifier-not-applied": "warning",
  "constraint-not-evaluated": "warning",
  "driver-not-evaluated": "warning",
  "curve-modifier-not-applied": "warning",
  "deform-approximated": "warning",
  "object-not-shown": "warning",
  "library-not-loaded": "error",
};

export function importWarning(
  code: ImportWarningCode,
  subject: ImportWarningSubject,
  message: string,
  file?: string,
  extra: ImportWarningExtra = {},
): ImportWarning {
  const warning: ImportWarning = { code, severity: importWarningSeverity[code], subject, message };
  if (file !== undefined) warning.file = file;
  if (extra.detail !== undefined) warning.detail = extra.detail;
  if (extra.materials !== undefined && extra.materials.length > 0) warning.materials = [...extra.materials];
  if (extra.foundPath !== undefined) warning.foundPath = extra.foundPath;
  if (extra.uses !== undefined && extra.uses.length > 0) warning.uses = extra.uses.map((use) => ({ ...use }));
  return warning;
}

export interface SourceInfo {
  format: SourceFormat;
  exporter: Exporter | null;
  fps: number;
  originalSpace: Space;
  conversion: SpaceConversion;
  warnings: ImportWarning[];
}
