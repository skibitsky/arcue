import type { SceneDescription } from "@arcue/scene";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { STONE_RESONATOR_PATH } from "../../dev/sample-data";
import { composedStone, flush, lodStone, NOW, POINT, setup, stoneBone, TestViewport } from "../test-helpers";
import { Workspace } from "./Workspace";

async function renderStone(scene?: (scene: SceneDescription) => SceneDescription) {
  const context = setup(scene ? { scene } : {});
  const viewports: TestViewport[] = [];
  render(
    <Workspace
      store={context.store}
      createViewport={() => {
        const viewport = new TestViewport();
        viewports.push(viewport);
        return viewport;
      }}
      now={() => NOW}
    />,
  );
  await act(async () => {
    await context.client.execute("asset.open", { path: STONE_RESONATOR_PATH, clip: "Armature|Charge", frame: 34 });
    await flush(10);
  });
  const session = context.store.activeSession();
  if (!session) throw new Error("No active session.");
  return { ...context, session, viewport: () => viewports.at(-1) };
}

function drawer() {
  return screen.getByRole("complementary", { name: "Outline" });
}

function rowNames(): string[] {
  return within(drawer())
    .getAllByRole("treeitem")
    .map((row) => `${"  ".repeat(Number(row.getAttribute("aria-level")) - 1)}${row.getAttribute("aria-label")}`);
}

function dataTransfer() {
  return { setData: vi.fn(), getData: vi.fn(), types: [], effectAllowed: "", dropEffect: "" };
}

describe("the outline", () => {
  it("shows its button only for models with parts or added files, and O toggles the drawer", async () => {
    const { session } = await renderStone(composedStone());
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Outline" });
    expect(screen.queryByRole("complementary", { name: "Outline" })).toBeNull();
    await user.keyboard("o");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(rowNames()).toEqual([
      "StoneResonator.fbx",
      "  StoneResonator",
      "  UCX_Stone",
      "  Bone_1",
      "    beetle-shells.fbx",
      "      ShellRound",
      "      ShellSpiked",
    ]);
    await user.click(button);
    expect(session.state.get().outlineOpen).toBe(false);
    expect(screen.queryByRole("complementary", { name: "Outline" })).toBeNull();
  });

  it("stays away for a model with one part", async () => {
    const { session } = await renderStone();
    const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: "Outline" })).toBeNull();
    await user.keyboard("o");
    expect(session.state.get().outlineOpen).toBe(false);
    expect(screen.queryByRole("group", { name: "LOD" })).toBeNull();
  });

  it("hides a part with its eye, isolates one with Alt-click, and Escape restores the rest", async () => {
    const { session } = await renderStone(composedStone());
    const user = userEvent.setup();
    act(() => session.setOutlineOpen(true));
    expect(screen.getByText("12,000 tris")).toBeTruthy();
    expect(within(drawer()).getByRole("button", { name: "Show UCX_Stone" })).toBeTruthy();
    expect(within(drawer()).getByRole("button", { name: "Show ShellSpiked" })).toBeTruthy();

    await user.click(within(drawer()).getByRole("button", { name: "Hide ShellRound" }));
    expect(session.state.get().parts.hidden).toEqual(["beetle-shells.fbx//ShellRound"]);
    expect(within(drawer()).getByRole("treeitem", { name: "ShellRound" }).className).toContain("is-off");
    expect(screen.getByRole("button", { name: "Outline" }).className).toContain("has-dot");

    fireEvent.click(within(drawer()).getByRole("button", { name: "Show ShellSpiked" }), { altKey: true });
    expect(session.state.get().parts.isolated).toBe("beetle-shells.fbx//ShellSpiked");
    expect(screen.getByText("1,476 tris").className).toContain("is-changed");
    await user.keyboard("{Escape}");
    expect(session.state.get().parts).toMatchObject({ isolated: null, hidden: ["beetle-shells.fbx//ShellRound"] });
  });

  it("moves between rows with the arrow keys and toggles the eye with Space, without playing or stepping", async () => {
    const { session, viewport } = await renderStone(composedStone());
    const user = userEvent.setup();
    act(() => session.setOutlineOpen(true));
    const frame = session.currentFrame();
    within(drawer()).getByRole("treeitem", { name: "StoneResonator.fbx" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("StoneResonator");
    await user.keyboard(" ");
    expect(session.state.get().parts.hidden).toEqual(["StoneResonator/StoneResonator"]);
    await user.keyboard("{End}{ArrowLeft}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("beetle-shells.fbx");
    await user.keyboard("{ArrowLeft}");
    expect(rowNames()).toContain("    beetle-shells.fbx");
    expect(rowNames()).not.toContain("      ShellRound");
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("ShellRound");
    expect(viewport()?.playing).toBe(false);
    expect(session.currentFrame()).toBe(frame);
  });

  it("drags an added file onto a bone to attach it and onto the model to detach it", async () => {
    const { session, client } = await renderStone(composedStone());
    act(() => {
      session.setOutlineOpen(true);
      session.setSkeleton(true);
    });
    const scene = session.state.get().scene as SceneDescription;
    const row = (name: string) => within(drawer()).getByRole("treeitem", { name });
    const file = row("beetle-shells.fbx");
    expect(file.getAttribute("draggable")).toBe("true");

    fireEvent.dragStart(file, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(row("Bone_7"), { dataTransfer: dataTransfer() });
    expect(row("Bone_7").className).toContain("is-drop");
    fireEvent.drop(row("Bone_7"), { dataTransfer: dataTransfer() });
    fireEvent.dragStart(file, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(row("Bone_1"), { dataTransfer: dataTransfer() });
    expect(row("Bone_1").className).not.toContain("is-drop");
    fireEvent.drop(row("StoneResonator.fbx"), { dataTransfer: dataTransfer() });
    await act(() => flush());
    const attached = client.calls.filter((call) => call.name === "composition.attachFile").map((call) => call.input);
    expect(attached).toEqual([
      expect.objectContaining({ bone: scene.nodes[stoneBone(scene, "Bone_7")]?.path }),
      expect.objectContaining({ bone: null }),
    ]);
  });

  it("filters a long tree, which scrolls inside the drawer", async () => {
    const { session } = await renderStone(composedStone());
    const user = userEvent.setup();
    act(() => session.setOutlineOpen(true));
    const filter = within(drawer()).getByRole("textbox", { name: "Filter" });
    await user.type(filter, "bone_6");
    expect(rowNames()).toEqual([
      "StoneResonator.fbx",
      "  Bone_1",
      "    Bone_6",
      "    Bone_60",
      "    Bone_61",
      "    Bone_62",
    ]);
    await user.keyboard("{Escape}");
    expect((filter as HTMLInputElement).value).toBe("");
    expect(session.state.get().outlineOpen).toBe(true);
  });

  it("shows no filter for a short tree", async () => {
    const withoutBones = (scene: SceneDescription) => {
      const lods = lodStone(scene);
      return {
        ...lods,
        nodes: lods.nodes.map((node) => ({ ...node, kind: node.kind === "bone" ? "empty" : node.kind })),
      };
    };
    const { session } = await renderStone(withoutBones);
    act(() => session.setOutlineOpen(true));
    expect(within(drawer()).queryByRole("textbox", { name: "Filter" })).toBeNull();
    expect(rowNames()).toEqual(["StoneResonator.fbx", "  StoneResonator", "  Pebble"]);
  });
});

describe("the LOD switch", () => {
  it("lists LOD0 first, switches the LOD and counts the LOD on screen in the status bar", async () => {
    const { session } = await renderStone(lodStone);
    const user = userEvent.setup();
    const lod = screen.getByRole("group", { name: "LOD" });
    const levels = within(lod).getAllByRole("button");
    expect(levels.map((button) => button.getAttribute("aria-label"))).toEqual(["LOD0", "LOD1", "LOD2"]);
    expect(levels[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("10,920 tris").className).not.toContain("is-changed");
    await user.click(within(lod).getByRole("button", { name: "LOD1" }));
    expect(session.state.get().parts.lod).toBe(1);
    expect(within(lod).getByRole("button", { name: "LOD1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("5,560 tris").className).toContain("is-changed");
  });
});

describe("the view chip", () => {
  it("names the visible parts on a comment made in another view, in the queue and in the comment box", async () => {
    const { session, viewport } = await renderStone(composedStone());
    act(() => session.setPartVisible("beetle-shells.fbx//ShellRound", false));
    await act(async () => {
      await session.addTextComment("The shell hides the seam.");
      await flush();
    });
    const drafts = screen.getByRole("list", { name: "Drafts" });
    const items = within(drafts).getAllByRole("listitem");
    expect(within(items[0] as HTMLElement).queryByText("StoneResonator")).toBeNull();
    expect(within(items.at(-1) as HTMLElement).getByText("StoneResonator")).toBeTruthy();

    act(() => viewport()?.emit("pinPlaced", { anchor: POINT }));
    const box = screen.getByRole("form", { name: /^Comment/ });
    expect(within(box).getByText("StoneResonator")).toBeTruthy();
  });
});
