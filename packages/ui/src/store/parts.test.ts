import type { SceneDescription, ScenePart } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { fakeScene, STONE_RESONATOR } from "../../dev/sample-data";
import { sceneStats } from "../format";
import { flush, openStone, POINT } from "../test-helpers";

const defaultView = { hidden: [], shown: [], isolated: null, lod: 0 };

/** The Stone Resonator as LOD0 and LOD1 of one mesh, with a collision helper and a second rock on the same mesh. */
function withParts(scene: SceneDescription): SceneDescription {
  const part = (id: string, role: ScenePart["role"], levels: number): ScenePart => ({
    id,
    name: id,
    role,
    node: 0,
    levels: Array.from({ length: levels }, (_, level) => ({ level, meshes: [0] })),
  });
  return {
    ...scene,
    parts: [part("StoneResonator", "model", 2), part("UCX_Stone", "collision", 1), part("Boulder2", "model", 1)],
  };
}

describe("parts", () => {
  it("drives the part view through view commands and reports it with the view state", async () => {
    const { client, session, viewport, assetId } = await openStone({ scene: withParts });
    await client.execute("view.setPartVisible", { assetId, part: "Boulder2", visible: false });
    await client.execute("view.setPartVisible", { assetId, part: "UCX_Stone", visible: true });
    await client.execute("view.setLod", { assetId, level: 1 });
    await client.execute("view.isolatePart", { assetId, part: "StoneResonator" });
    const parts = { hidden: ["Boulder2"], shown: ["UCX_Stone"], isolated: "StoneResonator", lod: 1 };
    expect(viewport.parts).toEqual(parts);
    expect(session.viewState()?.parts).toEqual(parts);
    await client.execute("view.isolatePart", { assetId, part: null });
    await client.execute("view.setPartVisible", { assetId, part: "UCX_Stone", visible: false });
    expect(viewport.parts).toEqual({ ...parts, shown: [], isolated: null });
  });

  it("refuses parts and LOD levels the model does not have", async () => {
    const { client, assetId } = await openStone({ scene: withParts });
    await expect(
      client.execute("view.setPartVisible", { assetId, part: "Gone", visible: false }),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(client.execute("view.isolatePart", { assetId, part: "Gone" })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(client.execute("view.setLod", { assetId, level: 2 })).rejects.toMatchObject({
      code: "invalid-input",
    });
  });

  it("sends the part view with a new comment and restores a comment's view when it is selected", async () => {
    const { client, session, viewport } = await openStone({ scene: withParts });
    session.setLod(1);
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setBoxText("Too sharp at LOD1.");
    await session.submitBox();
    await flush();
    const create = client.calls.find((call) => call.name === "comment.create");
    expect(create?.input).toMatchObject({ parts: { ...defaultView, lod: 1 } });
    const created = session.state.get().review?.comments.at(-1);
    expect(created?.parts).toEqual({ ...defaultView, lod: 1 });

    session.selectComment("c7");
    expect(viewport.parts).toEqual(defaultView);
    if (!created) throw new Error("the comment was created");
    session.selectComment(created.id);
    expect(session.state.get().parts).toEqual({ ...defaultView, lod: 1 });
    expect(viewport.parts).toEqual({ ...defaultView, lod: 1 });
  });

  it("counts the triangles of what a default view draws", () => {
    const scene = fakeScene(STONE_RESONATOR);
    const triangles = sceneStats(scene).triangles;
    const doubled = { ...scene, meshes: [...scene.meshes, ...scene.meshes] };
    const copy = (role: ScenePart["role"]): ScenePart => ({
      id: "Copy",
      name: "Copy",
      role,
      node: 0,
      levels: [{ level: 0, meshes: [1] }],
    });
    expect(sceneStats({ ...doubled, parts: [...scene.parts, copy("collision")] }).triangles).toBe(triangles);
    expect(sceneStats({ ...doubled, parts: [...scene.parts, copy("model")] }).triangles).toBe(triangles * 2);
  });
});
