import { readFileSync } from "node:fs";
import { compositionFileSchema } from "@arcue/protocol";
import { composeScene, shownByDefault } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { importSample, samplesDir } from "../test/samples";

describe("the modular beetle sample", () => {
  it("composes its three files into one beetle, with every clip bound and no warnings", async () => {
    const sidecar = compositionFileSchema.parse(JSON.parse(readFileSync(`${samplesDir}beetle.arcue`, "utf8")));
    const [model, shells, turn] = await Promise.all(
      [sidecar.model, "beetle-shells.fbx", "beetle-turn.fbx"].map((file) => importSample(file)),
    );
    if (!model || !shells || !turn) throw new Error("A beetle file did not import.");
    const scene = composeScene(model, {
      animations: (sidecar.animations ?? []).map((file) => ({ file, scene: turn })),
      attach: (sidecar.attach ?? []).map((entry) => ({
        member: { file: entry.file, scene: shells },
        node: entry.node ?? null,
        bone: entry.bone ?? null,
      })),
      materials: {},
      hidden: sidecar.hidden ?? [],
    });

    expect(scene.source.warnings).toEqual([]);
    expect(scene.clips.map((clip) => [clip.name, clip.file])).toEqual([
      ["Armature|Walk", undefined],
      ["beetle-turn.fbx//Armature|Turn", "beetle-turn.fbx"],
    ]);
    expect(scene.clips[1]?.tracks).toHaveLength(turn.clips[0]?.tracks.length ?? -1);
    expect(scene.parts.map((part) => [part.id, shownByDefault(part)])).toEqual([
      ["Legs", true],
      ["beetle-shells.fbx//ShellRound", true],
      ["beetle-shells.fbx//ShellSpiked", false],
    ]);
    const shell = scene.nodes.find((node) => node.path === "beetle-shells.fbx//ShellRound");
    expect(scene.nodes[shell?.parent ?? -1]?.name).toBe("Body");
  });
});
