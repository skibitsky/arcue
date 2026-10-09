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

export type ImportWarningCode = "missing-texture" | "unsupported-feature" | "invalid-data" | "other";

export interface ImportWarning {
  code: ImportWarningCode;
  message: string;
  /** Node path, texture path or clip name the warning is about. */
  subject: string | null;
}

export interface SourceInfo {
  format: SourceFormat;
  exporter: Exporter | null;
  fps: number;
  originalSpace: Space;
  conversion: SpaceConversion;
  warnings: ImportWarning[];
}
