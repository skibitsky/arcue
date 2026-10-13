import { ArcueError } from "@arcue/protocol";
import type { SceneDescription, ScenePart } from "@arcue/scene";
import { describe, expect, it, vi } from "vitest";
import { fakeScene, STONE_RESONATOR } from "../../dev/sample-data";
import { sceneStats } from "../format";
import { composedStone, flush, lodStone, openStone, POINT, stoneBone, TestViewport } from "../test-helpers";
import { outlineRows, outlineTree } from "./outline";

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

  it("shows the part that holds a comment's target when a new export hides it by default", async () => {
    const { client, session, viewport, timers, assetId } = await openStone();
    const scene = session.state.get().scene;
    const body = scene?.parts[0];
    const node = scene?.nodes.find((entry) => entry.mesh === 0);
    if (!scene || !body || !node) throw new Error("The stone has a part.");
    viewport.emit("pinPlaced", { anchor: { ...POINT, mesh: node.path } });
    session.setBoxText("Crack here.");
    await session.submitBox();
    await flush();
    const created = session.state.get().review?.comments.at(-1);
    if (!created) throw new Error("The comment was created.");
    expect(created.parts).toBeUndefined();

    const hidden = { ...scene, parts: scene.parts.map((part) => ({ ...part, hiddenByDefault: true })) };
    await client.simulateExport(assetId, { scene: hidden });
    await flush(10);
    await client.execute("view.selectComment", { assetId, commentId: created.id });
    expect(viewport.parts).toEqual({ ...defaultView, shown: [body.id] });
    timers.advance(400);
    await flush();
    const reported = client.calls.filter((call) => call.name === "view.reportState").at(-1);
    expect(reported?.input).toMatchObject({ state: { parts: { ...defaultView, shown: [body.id] } } });

    session.deselect();
    session.setPartVisible(body.id, false);
    session.selectComment(created.id);
    expect(session.state.get().parts).toEqual({ ...defaultView, shown: [body.id] });
  });

  it("keeps what is on screen when a part is shown or hidden during an isolation, and Escape ends one", async () => {
    const { client, session, viewport, assetId } = await openStone({ scene: withParts });
    await client.execute("view.isolatePart", { assetId, part: "Boulder2" });
    await client.execute("view.setPartVisible", { assetId, part: "UCX_Stone", visible: true });
    expect(viewport.parts).toEqual({ hidden: ["StoneResonator"], shown: ["UCX_Stone"], isolated: null, lod: 0 });
    session.selectComment("c7");
    session.isolatePart("Boulder2");
    session.escape();
    expect(session.state.get().selection).toBeNull();
    expect(session.state.get().parts.isolated).toBe("Boulder2");
    session.escape();
    expect(session.state.get().parts).toEqual(defaultView);
  });

  it("opens the outline through its view command, reports it and restores it when the tab comes back", async () => {
    const { client, store, session, timers, assetId } = await openStone({ scene: composedStone() });
    expect(session.outlineAvailable()).toBe(true);
    await client.execute("view.setOutlineOpen", { assetId, open: true });
    expect(session.state.get().outlineOpen).toBe(true);
    timers.advance(400);
    await flush();
    const reported = client.calls.filter((call) => call.name === "view.reportState").at(-1);
    expect(reported?.input).toMatchObject({ state: { outlineOpen: true } });

    expect(store.releaseAsset(assetId)?.outlineOpen).toBe(true);
    await client.execute("asset.open", { path: session.state.get().summary.path });
    const again = store.session(assetId);
    if (!again) throw new Error("The tab came back.");
    again.attachViewport(new TestViewport(), document.createElement("div"));
    await flush();
    expect(again.state.get().outlineOpen).toBe(true);
  });

  it("forgets parts and levels a new export no longer has, so no dot or chip stays on for them", async () => {
    const { client, session, viewport, assetId } = await openStone({ scene: composedStone() });
    session.setPartVisible("StoneResonator/StoneResonator", false);
    session.isolatePart("beetle-shells.fbx//ShellRound");
    await client.simulateExport(assetId, { scene: lodStone(fakeScene(STONE_RESONATOR)) });
    await flush(10);
    expect(session.state.get().parts).toEqual({ ...defaultView, hidden: ["StoneResonator/StoneResonator"] });
    session.setPartVisible("StoneResonator/StoneResonator", true);
    session.setLod(2);
    await client.simulateExport(assetId, { scene: fakeScene(STONE_RESONATOR) });
    await flush(10);
    expect(session.state.get().parts).toEqual(defaultView);
    expect(viewport.parts).toEqual(defaultView);
  });

  it("restores a saved view without the parts the scene does not have", async () => {
    const { client, store, session, assetId } = await openStone({ scene: composedStone() });
    session.setPartVisible("beetle-shells.fbx//ShellRound", false);
    const saved = store.releaseAsset(assetId);
    if (!saved) throw new Error("The tab had a view.");
    await client.execute("view.reportState", {
      assetId,
      state: { ...saved, parts: { ...saved.parts, hidden: [...saved.parts.hidden, "gone.fbx//Blade"], lod: 3 } },
    });
    await client.execute("asset.open", { path: session.state.get().summary.path });
    const again = store.session(assetId);
    if (!again) throw new Error("The tab came back.");
    again.attachViewport(new TestViewport(), document.createElement("div"));
    await flush();
    expect(again.state.get().parts).toEqual({ ...defaultView, hidden: ["beetle-shells.fbx//ShellRound"] });
  });

  it("has no outline for a model with one part", async () => {
    const { session } = await openStone();
    expect(session.outlineAvailable()).toBe(false);
  });

  it("attaches and detaches an added file through one composition.attachFile per place, by path", async () => {
    const { client, session, store } = await openStone({ scene: composedStone({ split: true }) });
    const scene = session.state.get().scene;
    if (!scene) throw new Error("The scene loaded.");
    const rows = outlineRows(outlineTree(scene, "StoneResonator.fbx", "all"));
    const [onBone1] = rows.flatMap((row) => (row.item.kind === "file" ? [row.item] : []));
    if (!onBone1) throw new Error("The file has a row.");
    await session.attachFile(onBone1, stoneBone(scene, "Bone_7"));
    await session.attachFile({ ...onBone1, nodes: ["ShellRound", "ShellSpiked"] }, stoneBone(scene, "Bone_7"));
    await session.attachFile({ ...onBone1, nodes: null }, null);
    const folder = "/work/iza/Assets/Art/Characters/StoneResonator/Models";
    const file = `${folder}/beetle-shells.fbx`;
    const bone = "StoneResonator/Armature/Bone_1/Bone_7";
    expect(client.calls.filter((call) => call.name === "composition.attachFile").map((call) => call.input)).toEqual([
      { assetId: session.assetId, file, nodes: ["ShellRound"], bone },
      { assetId: session.assetId, file, nodes: ["ShellRound", "ShellSpiked"], bone },
      { assetId: session.assetId, file, bone: null },
    ]);
    vi.spyOn(client, "execute").mockRejectedValueOnce(new ArcueError("conflict", "The composition file is broken."));
    await session.attachFile(onBone1, null);
    expect(store.state.get().toast).toMatchObject({ kind: "alert", message: "The composition file is broken." });
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
