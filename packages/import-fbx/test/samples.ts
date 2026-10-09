import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SceneDescription } from "@arcue/scene";
import { fbxImporter } from "../src/importer";

export const samplesDir = fileURLToPath(new URL("../../../samples/", import.meta.url));

export interface ManifestClip {
  take_name: string;
  frame_start: number;
  frame_end: number;
  duration_seconds: number;
  keys_on_every_frame: boolean;
  keyed_frames_union: number;
}

export interface ManifestMesh {
  name: string;
  control_points: number;
  triangles: number;
  materials: string[];
  uv_sets: string[];
  has_uvs: boolean;
  shape_keys: string[];
  skinned: boolean;
}

export interface ManifestFile {
  file: string;
  axes: { up: string; front: string; coord: string };
  units: { meters_per_file_unit: number };
  fps: number;
  meshes: ManifestMesh[];
  armature: { name: string; bone_count: number; bone_names: string[]; root_bone: string } | null;
  clips: ManifestClip[];
  textures: { name: string; relative_filename: string; embedded_bytes: number; blender_image: { size: number[] } }[];
  rest_bounds_m: { min: number[]; max: number[] };
}

export const manifest: { files: ManifestFile[] } = JSON.parse(readFileSync(`${samplesDir}manifest.json`, "utf8"));

export function readSample(file: string): Uint8Array {
  return new Uint8Array(readFileSync(`${samplesDir}${file}`));
}

export function importSample(
  file: string,
  readFile: (relativePath: string) => Promise<Uint8Array | null> = () => Promise.resolve(null),
): Promise<SceneDescription> {
  return fbxImporter.import({ fileName: file, bytes: readSample(file), readFile });
}
