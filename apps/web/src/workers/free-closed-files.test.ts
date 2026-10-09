import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import { createMemoryChannel, createPeer, createRemoteClient } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { openedFilePath, samplePath } from "../files";
import { freeClosedFiles } from "./free-closed-files";

async function startCore() {
  const platform = new MemoryPlatform({ clock: new ManualClock() });
  const core = await ArcueCore.start({ platform });
  const errors: unknown[] = [];
  freeClosedFiles(core.client, platform, (error) => errors.push(error));
  const [coreSide, windowSide] = createMemoryChannel();
  core.connect(coreSide, { connection: "window-1", caller: "window" });
  const client = createRemoteClient(createPeer(windowSide, { handleRequest: () => null }));
  return { platform, core, client, errors };
}

describe("freeClosedFiles", () => {
  it("removes a closed model's folder and keeps the others", async () => {
    const { platform, core, client, errors } = await startCore();
    const bytes = new Uint8Array([1, 2, 3]);
    for (const path of [
      openedFilePath("Hero.fbx"),
      openedFilePath("Hero.fbx", "BaseColor.png"),
      openedFilePath("Villain.fbx"),
      openedFilePath("Villain.fbx", "BaseColor.png"),
    ]) {
      await platform.writeFile(path, bytes);
    }
    const { assetId: hero } = await client.execute("asset.open", { path: openedFilePath("Hero.fbx") });
    await client.execute("asset.open", { path: openedFilePath("Villain.fbx") });
    await client.execute("asset.close", { assetId: hero });
    await core.idle();

    expect(await platform.exists(openedFilePath("Hero.fbx"))).toBe(false);
    expect(await platform.exists(openedFilePath("Hero.fbx", "BaseColor.png"))).toBe(false);
    expect(await platform.exists(openedFilePath("Villain.fbx"))).toBe(true);
    expect(await platform.exists(openedFilePath("Villain.fbx", "BaseColor.png"))).toBe(true);
    expect(errors).toEqual([]);
  });

  it("keeps a folder while another asset in it is still open", async () => {
    const { platform, core, client } = await startCore();
    await platform.writeFile(openedFilePath("Hero.fbx"), new Uint8Array([1]));
    await platform.writeFile(openedFilePath("Hero.fbx", "Sword.fbx"), new Uint8Array([2]));
    const { assetId: hero } = await client.execute("asset.open", { path: openedFilePath("Hero.fbx") });
    const { assetId: sword } = await client.execute("asset.open", { path: openedFilePath("Hero.fbx", "Sword.fbx") });
    await client.execute("asset.close", { assetId: hero });
    await core.idle();
    expect(await platform.exists(openedFilePath("Hero.fbx"))).toBe(true);
    await client.execute("asset.close", { assetId: sword });
    await core.idle();
    expect(await platform.exists(openedFilePath("Hero.fbx"))).toBe(false);
  });

  it("keeps samples, which the page fetches only once", async () => {
    const { platform, core, client } = await startCore();
    await platform.writeFile(samplePath("blob.fbx"), new Uint8Array([1]));
    const { assetId } = await client.execute("asset.open", { path: samplePath("blob.fbx") });
    await client.execute("asset.close", { assetId });
    await core.idle();
    expect(await platform.exists(samplePath("blob.fbx"))).toBe(true);
  });
});
