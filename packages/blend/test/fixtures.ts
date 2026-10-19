import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decompressBlend } from "../src/blend/decompress.js";
import { readBlendFile } from "../src/blend/file.js";
import { datablocks, idName } from "../src/blend/ids.js";
import { readBlend } from "../src/read-blend.js";
import { readMeshData } from "../src/scene/mesh-data.js";
import { ObjectType } from "../src/scene/objects.js";
import type { BlendScene } from "../src/types.js";
import type { Faces } from "./loops.js";

export const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));

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

/** Reads an image by a path stored relative to the fixtures folder. */
export async function readFixtureImage(path: string): Promise<Uint8Array | null> {
  if (path.startsWith("/")) return null;
  try {
    return new Uint8Array(readFileSync(`${fixturesDir}${path}`));
  } catch {
    return null;
  }
}

/** A fixture's scene as `readBlend` reads it, with the images beside it. */
export function readFixtureScene(name: string, version: Version): Promise<BlendScene> {
  return readBlend(readFixture(name, version), { readImage: readFixtureImage });
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
