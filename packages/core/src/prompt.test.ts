import type { RoundComment, RoundData } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { renderPrompt } from "./prompt";

const frontCamera: RoundComment["camera"] = {
  position: [0, 1, 3],
  target: [0, 1, 0],
  up: [0, 1, 0],
  fov: 30,
  label: "front",
};

function comment(overrides: Partial<RoundComment> & Pick<RoundComment, "id" | "number" | "text">): RoundComment {
  return {
    time: null,
    target: null,
    pose: null,
    camera: frontCamera,
    screenshot: null,
    madeOnVersion: "3f9a2c1",
    anchorState: overrides.target ? "exact" : null,
    anchorVersion: overrides.target ? "3f9a2c1" : null,
    earlierMessages: [],
    ...overrides,
  };
}

const specRound: RoundData = {
  round: 4,
  asset: {
    path: "Assets/Art/Characters/StoneResonator/Models/StoneResonator.fbx",
    version: "3f9a2c1",
    exporter: "Blender 5.2 FBX",
    fps: 60,
    space: { units: "m", up: "+Y", handedness: "right" },
  },
  comments: [
    comment({
      id: "c7",
      number: 1,
      text: "The thumb tip bends outward. Fold it back toward the palm.",
      time: { clip: "Armature|Charge", clipDisplayName: "Charge", frame: 34, seconds: 0.567 },
      target: {
        kind: "region",
        mesh: "StoneResonator",
        meshPath: "StoneResonator",
        vertices: [
          [2210, 2239],
          [2251, 2266],
        ],
        vertexCount: 46,
        centroid: { rest: [-0.412, 1.018, 0.064], posed: [-0.371, 1.102, 0.118] },
        bones: [
          { name: "Right_ThumbDistal", share: 0.64 },
          { name: "Right_ThumbIntermediate", share: 0.31 },
          { name: "Right_Hand", share: 0.04 },
          { name: "Right_ThumbProximal", share: 0.01 },
        ],
      },
      camera: {
        position: [-0.9, 0.95, 0.6],
        target: [-0.37, 1.1, 0.12],
        up: [0, 1, 0],
        fov: 30,
        label: "palm side, slightly below",
      },
      screenshot: "c7.png",
    }),
    comment({
      id: "c8",
      number: 2,
      text: "The torso bobs too much. Halve the vertical motion.",
      time: { clip: "Armature|Run", clipDisplayName: "Run", frames: [12, 24], seconds: [0.2, 0.4] },
    }),
    comment({
      id: "c9",
      number: 3,
      text: "This spike is cut off. It should come to a point like the others.",
      target: {
        kind: "point",
        mesh: "StoneResonator",
        meshPath: "StoneResonator",
        vertices: [101, 102, 140],
        weights: [0.2, 0.5, 0.3],
        position: { rest: [0, 1.9, 0.1], posed: [0, 1.9, 0.1] },
        bones: [
          { name: "Neck", share: 0.1 },
          { name: "Head", share: 0.9 },
        ],
      },
      screenshot: "c9.png",
    }),
  ],
};

const reviewFolder = "/work/game/.arcue/reviews/Assets/Art/Characters/StoneResonator/Models/StoneResonator.fbx";

describe("renderPrompt", () => {
  it("renders three comments with the round folder in full", () => {
    const prompt = renderPrompt({
      data: specRound,
      assetPath: "/work/game/Assets/Art/Characters/StoneResonator/Models/StoneResonator.fbx",
      roundFolder: `${reviewFolder}/rounds/round-4`,
      exportedAt: "14:02",
    });
    const specExample = `3D review · round 4 · 3 comments
Asset: /work/game/Assets/Art/Characters/StoneResonator/Models/StoneResonator.fbx
Version 3f9a2c1, exported 14:02
Data and screenshots: /work/game/.arcue/reviews/…/StoneResonator.fbx/rounds/round-4/
Meters, right-handed, Y up. Frames count from each clip's first frame (0) at 60 fps.
Vertex numbers follow the file's vertex order, which is Blender's order for Blender exports.

1. Clip "Charge", frame 34 · region on "StoneResonator", 46 vertices
   Bones: Right_ThumbDistal 64%, Right_ThumbIntermediate 31%
   View: palm side, slightly below · screenshot: c7.png
   "The thumb tip bends outward. Fold it back toward the palm."

2. Clip "Run", frames 12–24 · no surface target
   "The torso bobs too much. Halve the vertical motion."

3. Rest pose · point on "StoneResonator", near bone "Head"
   View: front · screenshot: c9.png
   "This spike is cut off. It should come to a point like the others."`;
    expect(prompt).toBe(specExample.replace("/work/game/.arcue/reviews/…/StoneResonator.fbx", reviewFolder));
  });

  it("marks follow-ups with the round each earlier message was sent in", () => {
    const followUp: RoundData = {
      ...specRound,
      round: 6,
      comments: [
        comment({
          id: "c9",
          number: 1,
          text: "The tip is there now, but it points backward.",
          target: specRound.comments[2]?.target ?? null,
          screenshot: "c9.png",
          earlierMessages: [
            { round: 4, text: "This spike is cut off. It should come to a point like the others." },
            { round: 5, text: "Still cut off.\nCompare it with the spike beside it." },
          ],
        }),
        comment({
          id: "c12",
          number: 2,
          text: "Textures look washed out.",
          camera: { ...frontCamera, label: "" },
        }),
      ],
    };
    expect(
      renderPrompt({
        data: followUp,
        assetPath: "/work/game/Hero.fbx",
        roundFolder: "/work/game/.arcue/reviews/Hero.fbx/rounds/round-6/",
        exportedAt: "09:15",
      }),
    ).toMatchInlineSnapshot(`
      "3D review · round 6 · 2 comments
      Asset: /work/game/Hero.fbx
      Version 3f9a2c1, exported 09:15
      Data and screenshots: /work/game/.arcue/reviews/Hero.fbx/rounds/round-6/
      Meters, right-handed, Y up. Frames count from each clip's first frame (0) at 60 fps.
      Vertex numbers follow the file's vertex order, which is Blender's order for Blender exports.

      1. Rest pose · point on "StoneResonator", near bone "Head" · follow-up, first sent in round 4
         View: front · screenshot: c9.png
         Round 4: "This spike is cut off. It should come to a point like the others."
         Round 5: "Still cut off.
         Compare it with the spike beside it."
         "The tip is there now, but it points backward."

      2. Rest pose · no surface target
         "Textures look washed out.""
    `);
  });

  it("states Blender's Z-up convention, and counts a lone vertex and a lone comment in the singular", () => {
    const zUp: RoundData = {
      ...specRound,
      round: 1,
      asset: { ...specRound.asset, fps: 29.97, space: { units: "m", up: "+Z", handedness: "right" } },
      comments: [
        comment({
          id: "c1",
          number: 1,
          text: "Pinch this vertex in.",
          time: { clip: "Idle", clipDisplayName: "Idle", frame: 0, seconds: 0 },
          target: {
            kind: "region",
            mesh: "Body",
            meshPath: "Hero/Body",
            vertices: [[5, 5]],
            vertexCount: 1,
            centroid: { rest: [0, 0, 1], posed: [0, 0, 1] },
            bones: [],
          },
          camera: { ...frontCamera, label: "" },
          screenshot: "c1.png",
        }),
      ],
    };
    expect(
      renderPrompt({
        data: zUp,
        assetPath: "/work/Hero.fbx",
        roundFolder: "/app-data/reviews/work/Hero.fbx/rounds/round-1",
        exportedAt: "23:59",
      }),
    ).toMatchInlineSnapshot(`
      "3D review · round 1 · 1 comment
      Asset: /work/Hero.fbx
      Version 3f9a2c1, exported 23:59
      Data and screenshots: /app-data/reviews/work/Hero.fbx/rounds/round-1/
      Meters, right-handed, Z up as in Blender. Frames count from each clip's first frame (0) at 29.97 fps.
      Vertex numbers follow the file's vertex order, which is Blender's order for Blender exports.

      1. Clip "Idle", frame 0 · region on "Body", 1 vertex
         Screenshot: c1.png
         "Pinch this vertex in.""
    `);
  });

  it("lists at most three hidden or shown parts and names parts it was not given by their last node", () => {
    const data: RoundData = {
      ...specRound,
      comments: [
        comment({
          id: "c1",
          number: 1,
          text: "Gaps between the rocks.",
          parts: {
            hidden: ["Rocks/Boulder1", "Rocks/Boulder2", "Rocks/Boulder3", "Rocks/Boulder4", "Rocks/Boulder5"],
            shown: ["Rocks/UCX_Rocks#2"],
            isolated: null,
            lod: 2,
          },
        }),
      ],
    };
    const prompt = renderPrompt({
      data,
      assetPath: "/work/Rocks.fbx",
      roundFolder: "/work/rounds/round-4",
      exportedAt: "14:02",
      partNames: new Map([["Rocks/Boulder1", "Boulder1"]]),
    });
    expect(prompt.split("\n\n")[1]?.split("\n")[0]).toBe(
      "1. Rest pose · no surface target · LOD2, Boulder1, Boulder2, Boulder3 and 2 more hidden, UCX_Rocks shown",
    );
  });
});
