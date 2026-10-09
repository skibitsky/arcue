import type { Quat } from "./math";

export type SourceFormat = "fbx" | "gltf" | "glb";

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
  | "invalid-data";

export type ImportWarningSeverity = "warning" | "error";

export type ImportWarningSubjectKind = "texture" | "material" | "node" | "clip" | "file";

export interface ImportWarningSubject {
  kind: ImportWarningSubjectKind;
  /** The texture's file name, the material's, node's or clip's name in the file, or the asset's file name. */
  name: string;
}

export interface ImportWarning {
  /** Stable across versions, for tools and agents to match on. */
  code: ImportWarningCode;
  severity: ImportWarningSeverity;
  subject: ImportWarningSubject;
  /** Short and plain, for people. */
  message: string;
}

/** An "error" means the preview is missing something the file meant to show. */
export const importWarningSeverity: Readonly<Record<ImportWarningCode, ImportWarningSeverity>> = {
  "texture-not-found": "error",
  "texture-path-absolute": "warning",
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
};

export function importWarning(code: ImportWarningCode, subject: ImportWarningSubject, message: string): ImportWarning {
  return { code, severity: importWarningSeverity[code], subject, message };
}

export interface SourceInfo {
  format: SourceFormat;
  exporter: Exporter | null;
  fps: number;
  originalSpace: Space;
  conversion: SpaceConversion;
  warnings: ImportWarning[];
}
