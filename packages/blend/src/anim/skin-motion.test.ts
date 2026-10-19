import { describe, expect, it } from "vitest";
import { readFixture } from "../../test/fixtures.js";
import { decompressBlend } from "../blend/decompress.js";
import { readBlendFile } from "../blend/file.js";
import { decompose, toSceneAxes } from "../math.js";
import { buildScene } from "../scene/build.js";
import type { Track } from "../types.js";
import type { ParsedClip } from "./clips.js";
import { skinMotionWarnings } from "./skin-motion.js";

describe("skinMotionWarnings on the relations fixture", async () => {
  const file = readBlendFile(await decompressBlend(readFixture("relations", "5.2")));
  const sceneOf = () => buildScene(file);
  const scene = sceneOf();
  const nodeOf = (name: string) => scene.nodes.findIndex((candidate) => candidate.name === name);

  /** A track that moves a node from where it rests by each of `offsets` along X, at `times` or one second apart. */
  const slide = (name: string, offsets: number[], times = offsets.map((_, index) => index)): Track => {
    const node = nodeOf(name);
    const rest = scene.nodes[node]?.rest;
    if (!rest) throw new Error(`No ${name}`);
    const [x, y, z] = decompose(toSceneAxes(rest, scene.unitScale)).translation;
    return {
      node,
      property: "translation",
      interpolation: "linear",
      times: Float32Array.from(times),
      values: Float32Array.from(offsets.flatMap((offset) => [x + offset, y, z])),
    };
  };
  const clip = (name: string, tracks: Track[]): ParsedClip => ({
    name,
    duration: 1,
    curveTimes: [],
    tracks,
    fileFrames: { start: 1, step: 1 },
  });
  const details = (clips: ParsedClip[], built = scene) =>
    Object.fromEntries(skinMotionWarnings(built, clips).map((warning) => [warning.subject.name, warning.detail]));

  it("compares each mesh with its own armature in a clip that moves several", () => {
    const shared = clip("Shared", [slide("MotionRig", [0, 1]), slide("Beside", [0, 1]), slide("Carrier", [0, 1])]);
    expect(details([shared])).toEqual({ Carried: "The preview keeps its rest offset from StillRig in Shared" });
  });

  it("compares a mesh with where its armature is in each clip", () => {
    const together = clip("Together", [slide("MotionRig", [0, 1]), slide("Beside", [0, 1])]);
    const alone = clip("Alone", [slide("Beside", [0, 1])]);
    expect(details([together, alone])).toEqual({ Beside: "The preview keeps its rest offset from MotionRig in Alone" });
  });

  it("compares a mesh with its armature at each time either one moves, in order", () => {
    const late = clip("Late", [slide("Beside", [0, 1], [0, 2]), slide("MotionRig", [0, 1, 1])]);
    expect(details([late])).toEqual({ Beside: "The preview keeps its rest offset from MotionRig in Late" });
  });

  it.each([1, 0.01])("leaves motion within float32 rounding of where a far armature at scale %s sits", (scale) => {
    const far = sceneOf();
    const rig = far.nodes[nodeOf("MotionRig")];
    if (!rig) throw new Error("No MotionRig");
    for (const element of [0, 5, 10]) rig.rest[element] = scale;
    rig.rest[12] = 3000;
    const step = Math.fround(3000 + 2 ** -11) - 3000;
    const shifted = slide("MotionRig", [3000, 3000 + step]);
    expect(details([clip("Nudge", [shifted])], far)).toEqual({});
    const moved = slide("MotionRig", [3000, 3000.01]);
    expect(details([clip("Move", [moved])], far)).toEqual({
      Beside: "The preview keeps its rest offset from MotionRig in Move",
    });
  });

  it("leaves motion within float32 rounding of where a far mesh sits", () => {
    const far = sceneOf();
    const beside = far.nodes[nodeOf("Beside")];
    if (!beside) throw new Error("No Beside");
    beside.rest[12] = (beside.rest[12] ?? 0) + 3000;
    const step = Math.fround(3000 + 2 ** -11) - 3000;
    expect(details([clip("Nudge", [slide("Beside", [3000, 3000 + step])])], far)).toEqual({});
    expect(details([clip("Move", [slide("Beside", [3000, 3000.01])])], far)).toEqual({
      Beside: "The preview keeps its rest offset from MotionRig in Move",
    });
  });
});
