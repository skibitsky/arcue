import { describe, expect, it } from "vitest";
import { flush, openStone, withWarnings } from "../test-helpers";
import { listedWarnings } from "./asset-session";

const MISSING = "texture-not-found:texture:Eyes.png";
const UNUSED = "texture-not-used:texture:Stone_BaseColor.png";

describe("import warnings in the session", () => {
  it("loads the version's warnings, errors first, and lists those not dismissed", async () => {
    const { session } = await openStone({ scene: withWarnings });
    const listed = listedWarnings(session.state.get());
    expect(listed.map((warning) => warning.id)).toEqual([
      MISSING,
      "root-scale:node:Armature",
      UNUSED,
      "animation-bones-missing:clip:Armature|Run",
    ]);
    await session.dismissWarning("root-scale:node:Armature");
    await flush();
    expect(listedWarnings(session.state.get()).map((warning) => warning.id)).not.toContain("root-scale:node:Armature");
    await session.dismissAllWarnings();
    await flush();
    expect(listedWarnings(session.state.get())).toEqual([]);
  });

  it("tints the subject's meshes while a warning is pointed at, and shows a clip's warning by its clip", async () => {
    const { session, viewport, store, assetId } = await openStone({ scene: withWarnings });
    const scene = session.state.get().scene;
    const meshPath = scene?.nodes.find((node) => node.mesh === 0)?.path;
    const warning = (id: string) => session.state.get().warnings.find((entry) => entry.id === id);
    session.pointAtWarning(warning(MISSING) ?? null);
    expect(viewport.highlighted).toEqual([meshPath]);
    session.pointAtWarning(null);
    expect(viewport.highlighted).toBeNull();
    session.pointAtWarning(warning("animation-bones-missing:clip:Armature|Run") ?? null);
    expect(session.state.get().clip).toBe("Armature|Run");
    expect(viewport.highlighted).toBeNull();

    await store.runViewCommand("view.highlightSubject", {
      assetId,
      subject: { kind: "node", name: "StoneResonator" },
    });
    expect(viewport.highlighted).toEqual([meshPath]);
    await store.runViewCommand("view.highlightSubject", { assetId, subject: null });
    expect(viewport.highlighted).toBeNull();
  });

  it("adds a warning as a draft, which the list then shows by its number", async () => {
    const { session, client } = await openStone({ scene: withWarnings });
    await session.commentOnWarning(MISSING);
    await flush();
    const comment = session.state.get().warnings.find((entry) => entry.id === MISSING)?.commentId;
    expect(comment).toBe(session.state.get().review?.queue.at(-1));
    expect(session.state.get().added).toBe(comment);
    expect(client.calls.find((call) => call.name === "comment.createFromWarning")?.input).toEqual({
      assetId: session.assetId,
      warningId: MISSING,
    });
  });

  it("runs the quick fix: the texture as the only untextured material's base color", async () => {
    const { session, client } = await openStone({ scene: withWarnings });
    const warning = session.state.get().warnings.find((entry) => entry.id === UNUSED);
    if (!warning) throw new Error("No unused texture warning.");
    await session.fixWarning(warning);
    expect(client.calls.find((call) => call.name === "material.setTexture")?.input).toEqual({
      assetId: session.assetId,
      material: "Stone",
      slot: "baseColor",
      file: "/work/iza/Assets/Art/Characters/StoneResonator/Models/Textures/Stone_BaseColor.png",
    });
  });

  it("copies the warnings prompt, or shows it in the copy sheet when the clipboard is blocked", async () => {
    const copiedContext = await openStone({ scene: withWarnings });
    await copiedContext.session.copyWarnings();
    expect(copiedContext.copied[0]?.split("\n")[0]).toBe(
      "Fix these import warnings for /work/iza/Assets/Art/Characters/StoneResonator/Models/StoneResonator.fbx.",
    );
    expect(copiedContext.store.state.get().toast?.message).toBe("Copied 4 warnings");

    const blocked = await openStone({ scene: withWarnings, clipboard: "blocked" });
    await blocked.session.copyWarnings();
    expect(blocked.store.state.get().copySheet).toMatchObject({ round: null });
    expect(blocked.store.state.get().copySheet?.prompt).toContain("1. Texture not found: Eyes.png");
  });
});
