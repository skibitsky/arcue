import { readFileSync } from "node:fs";
import { compositionFileSchema } from "@arcue/protocol";
import { composeScene, shownByDefault } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { importSample, samplesDir } from "../test/samples";

describe("the modular beetle sample", () => {
  it("composes its three files into one beetle, with every clip bound and no warnings", async () => {
    const manifest = JSON.parse(readFileSync(`${samplesDir}manifest.json`, "utf8")) as {
      compositions: { model: string; composition: unknown }[];
    };
    const beetle = manifest.compositions.find((entry) => entry.model === "beetle.fbx");
    const composition = compositionFileSchema.parse(beetle?.composition);
    const [model, shells, turn] = await Promise.all(
      ["beetle.fbx", "beetle-shells.fbx", "beetle-turn.fbx"].map((file) => importSample(file)),
    );
    if (!model || !shells || !turn) throw new Error("A beetle file did not import.");
    const scene = composeScene(model, {
      animations: (composition.animations ?? []).map((file) => ({ file, scene: turn })),
      attach: (composition.attach ?? []).map((entry) => ({
        member: { file: entry.file, scene: shells },
        node: entry.node ?? null,
        bone: entry.bone ?? null,
      })),
      materials: {},
      hidden: composition.hidden ?? [],
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
