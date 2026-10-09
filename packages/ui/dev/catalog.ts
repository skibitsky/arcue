import type { Comment } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import type { FakeAssetSeed } from "./fake-core";
import { renderStill } from "./fake-viewport";
import type { SceneSpec } from "./sample-data";
import {
  emptyReview,
  fakeScene,
  STONE_RESONATOR,
  STONE_RESONATOR_PATH,
  STONE_VERSION,
  stoneResonatorReview,
} from "./sample-data";

export const SAMPLES = [
  { name: "StoneResonator.fbx", path: STONE_RESONATOR_PATH },
  { name: "BoulderBug.fbx", path: "/work/iza/Assets/Art/Characters/BoulderBug/Models/BoulderBug.fbx" },
  { name: "StoneStriker.fbx", path: "/work/iza/Assets/Art/Characters/StoneStriker/Models/StoneStriker.fbx" },
  { name: "pebble-golem-sparse.fbx", path: "/samples/pebble-golem-sparse.fbx" },
] as const;

const OTHER_SPECS: Record<string, SceneSpec> = {
  "BoulderBug.fbx": {
    root: "BoulderBug",
    mesh: "BoulderBugMesh",
    fps: 60,
    triangles: 6_204,
    bones: 31,
    height: 0.9,
    clips: [
      ["Burrow", 1.2],
      ["Idle", 2.0],
      ["Pounce", 0.7],
      ["Walk", 0.8],
    ],
  },
  "StoneStriker.fbx": {
    root: "StoneStriker",
    mesh: "StoneStrikerMesh",
    fps: 60,
    triangles: 12_880,
    bones: 58,
    height: 2.3,
    clips: [
      ["Attack", 1.1],
      ["Idle", 2.0],
      ["Walk", 1.0],
    ],
  },
  "pebble-golem-sparse.fbx": {
    root: "PebbleGolem",
    mesh: "PebbleGolemMesh",
    fps: 30,
    triangles: 3_120,
    bones: 19,
    height: 1.4,
    clips: [
      ["Idle", 2.0],
      ["Wave", 1.5],
    ],
    sparse: ["Idle", "Wave"],
  },
};

async function seededScreenshot(comment: Comment, scene: SceneDescription): Promise<Uint8Array | null> {
  return renderStill({
    scene,
    camera: comment.camera,
    time:
      comment.time.kind === "none"
        ? { kind: "none" }
        : comment.time.kind === "frame"
          ? { kind: "frame", clip: comment.time.clip, frame: comment.time.frame }
          : { kind: "range", clip: comment.time.clip, start: comment.time.start, end: comment.time.end },
    overlays: comment.target
      ? [{ id: comment.id, number: null, state: "draft", anchor: comment.target, selected: false }]
      : [],
    width: 320,
    height: 240,
  });
}

/** The assets the fake core can open: the Stone Resonator with its review, and a few without comments. */
export function sampleCatalog(path: string): FakeAssetSeed | null {
  if (path === STONE_RESONATOR_PATH) {
    return {
      scene: fakeScene(STONE_RESONATOR),
      review: stoneResonatorReview(),
      version: STONE_VERSION,
      screenshot: seededScreenshot,
    };
  }
  const name = path.split("/").pop() ?? "";
  const spec = OTHER_SPECS[name];
  if (!spec) return null;
  const version = `${name.length.toString(16)}e${spec.triangles.toString(16)}`.slice(0, 7);
  return { scene: fakeScene(spec), review: emptyReview(path, version), version, screenshot: seededScreenshot };
}
