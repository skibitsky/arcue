import type { SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { buildAssetScene, MEMBER_IMPORTS_AT_ONCE, readAssetFiles } from "./composition-load";
import { MemoryPlatform } from "./memory-platform";
import type { FakeAssetSpec } from "./test-support";
import { fakeAsset, fakeScene } from "./test-support";

const FOLDER = "/work/Bug";
const MODEL = `${FOLDER}/Bug.fbx`;
const COMPOSITION = "/app-data/reviews/work/Bug/Bug.fbx/composition.json";
const IMAGE = `${FOLDER}/Textures/Atlas.png`;

const model: FakeAssetSpec = {
  bones: [{ name: "Body" }],
  meshes: [{ name: "Shell", grid: 2, material: 0 }],
  materials: ["Shell"],
};

const clip = (name: string): FakeAssetSpec => ({
  bones: [{ name: "Body" }],
  meshes: [],
  clips: [{ name, frames: 2, bones: ["Body"] }],
});

class CountingPlatform extends MemoryPlatform {
  readonly reads: string[] = [];

  override readFile(path: string): Promise<Uint8Array> {
    this.reads.push(path);
    return super.readFile(path);
  }
}

function parseFake(file: { bytes: Uint8Array }): SceneDescription {
  return fakeScene(JSON.parse(new TextDecoder().decode(file.bytes)) as FakeAssetSpec);
}

describe("buildAssetScene", () => {
  it("parses at most a few member files at once, and takes a scene parsed before without parsing it", async () => {
    const animations = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`${FOLDER}/Bug@Clip${index}.fbx`, fakeAsset(clip(`Clip${index}`))]),
    );
    const platform = new MemoryPlatform({ files: { [MODEL]: fakeAsset(model), ...animations } });
    const files = await readAssetFiles(platform, MODEL, COMPOSITION, FOLDER, { brokenComposition: "reject" });
    let running = 0;
    let most = 0;
    const parsed: string[] = [];
    const scene = await buildAssetScene(
      files,
      async (file) => {
        running++;
        most = Math.max(most, running);
        parsed.push(file.label);
        for (let turn = 0; turn < 5; turn++) await Promise.resolve();
        running--;
        return parseFake(file);
      },
      { parsed: (file) => (file.label === "Bug@Clip3.fbx" ? fakeScene(clip("Known")) : null) },
    );
    expect(most).toBe(MEMBER_IMPORTS_AT_ONCE);
    expect(parsed).toHaveLength(10);
    expect(parsed).not.toContain("Bug@Clip3.fbx");
    expect(scene.clips.map((entry) => entry.name)).toContain("Bug@Clip3.fbx//Known");
  });

  it("reads an image once for every slot that names it, and gives the slots one texture", async () => {
    const platform = new CountingPlatform({
      files: {
        [MODEL]: fakeAsset(model),
        [IMAGE]: Uint8Array.of(0x89, 0x50, 0x4e, 0x47),
        [COMPOSITION]: JSON.stringify({
          version: 1,
          materials: {
            Shell: { baseColor: "Textures/Atlas.png", emissive: "Textures/Atlas.png", normal: "Atlas.png" },
          },
        }),
      },
    });
    const files = await readAssetFiles(platform, MODEL, COMPOSITION, FOLDER, { brokenComposition: "reject" });
    expect(platform.reads.filter((path) => path === IMAGE)).toHaveLength(1);
    const scene = await buildAssetScene(files, async (file) => parseFake(file));
    expect(scene.textures).toHaveLength(1);
    const shell = scene.materials[0];
    expect([shell?.baseColorTexture?.texture, shell?.emissiveTexture?.texture, shell?.normalTexture?.texture]).toEqual([
      0, 0, 0,
    ]);
  });
});
