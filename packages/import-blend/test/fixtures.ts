import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { FoundFile, SceneDescription } from "@arcue/scene";
import { decompressBlend } from "../src/blend/decompress";
import { readBlendFile } from "../src/blend/file";
import { datablocks, idName } from "../src/blend/ids";
import { blendImporter } from "../src/importer";
import { readMeshData } from "../src/scene/mesh-data";
import { ObjectType } from "../src/scene/objects";
import type { Faces } from "./geometry";

export const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
export const repositoryDir = fileURLToPath(new URL("../../../", import.meta.url));

/** The Blender versions `fixtures/generate.py` wrote fixtures with. */
export const VERSIONS = ["4.2", "5.2"] as const;

export type Version = (typeof VERSIONS)[number];

export interface MeshReference {
  vertexCount: number;
  triangles: number;
  /** Per face corner: the vertex, then its normal in scene axes. */
  corners: [number, number, number, number][];
  /** Blender's loop triangles in its order, each as the face corners at its three corners. */
  triangleLoops: number[][];
  restPositions: number[];
  uvMaps: string[];
  /** Two values per face corner for each UV map, by name. */
  uvs: Record<string, number[]>;
  renderUv: string | null;
  slots: (string | null)[];
  colors: { name: string; domain: "POINT" | "CORNER"; values: number[] } | null;
}

export interface ClipSample {
  frame: number;
  bones: Record<string, number[]>;
  objects: Record<string, { type: string; world: number[] }>;
  body: number[];
}

export interface Reference {
  blender: string;
  fps: number;
  unitScale: number;
  objects: Record<string, { type: string; world: number[] }>;
  meshes: Record<string, MeshReference>;
  shapeKeys?: Record<
    string,
    {
      weights: Record<string, number>;
      positions: number[];
      /** Per shape key at full weight, alone: each face corner's vertex and normal in scene axes. */
      normals?: Record<string, [number, number, number, number][]>;
    }
  >;
  clips?: Record<string, ClipSample[]>;
  curves?: Record<string, { path: string; index: number; samples: [number, number][] }[]>;
}

export function fixtureName(name: string, version: Version): string {
  return `${name}-${version}.blend`;
}

export function readFixture(name: string, version: Version): Uint8Array {
  return new Uint8Array(readFileSync(`${fixturesDir}${fixtureName(name, version)}`));
}

export function reference(name: string, version: Version): Reference {
  return JSON.parse(readFileSync(`${fixturesDir}${name}-${version}.json`, "utf8"));
}

/** Finds an image the way the core does for a path stored relative to the fixtures folder. */
export async function findInFixtures(storedPath: string): Promise<FoundFile | null> {
  if (storedPath.startsWith("/")) return null;
  try {
    const bytes = new Uint8Array(readFileSync(`${fixturesDir}${storedPath}`));
    return { path: relative(fixturesDir, `${fixturesDir}${storedPath}`), bytes };
  } catch {
    return null;
  }
}

export function importBytes(
  fileName: string,
  bytes: Uint8Array,
  findFile: (storedPath: string) => Promise<FoundFile | null> = () => Promise.resolve(null),
): Promise<SceneDescription> {
  return blendImporter.import({
    fileName,
    bytes,
    readFile: () => Promise.resolve(null),
    findFile,
    locateFile: async (storedPath) => (await findFile(storedPath))?.path ?? null,
  });
}

export function importFixture(
  name: string,
  version: Version,
  findFile?: (storedPath: string) => Promise<FoundFile | null>,
): Promise<SceneDescription> {
  return importBytes(fixtureName(name, version), readFixture(name, version), findFile);
}

/** The faces of each mesh object in a fixture, by object name, as the file stores them. */
export async function fixtureFaces(name: string, version: Version): Promise<Map<string, Faces>> {
  const file = readBlendFile(await decompressBlend(readFixture(name, version)));
  const faces = new Map<string, Faces>();
  for (const object of datablocks(file, "OB")) {
    const mesh = object.number("type") === ObjectType.mesh ? object.deref("data") : null;
    if (mesh) faces.set(idName(object), readMeshData(file, mesh));
  }
  return faces;
}
