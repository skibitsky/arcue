import type { SceneDescription } from "@arcue/scene";
import { importWarning } from "@arcue/scene";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { STONE_RESONATOR_PATH } from "../../dev/sample-data";
import type { FileHost } from "../store/view-files";
import { flush, NOW, setup, TestViewport, withWarnings } from "../test-helpers";
import { Workspace } from "./Workspace";

async function renderStone(scene = withWarnings, files?: FileHost) {
  const context = setup({ scene, ...(files ? { files } : {}) });
  const viewport = new TestViewport();
  render(<Workspace store={context.store} createViewport={() => viewport} now={() => NOW} />);
  await act(async () => {
    await context.client.execute("asset.open", { path: STONE_RESONATOR_PATH });
    await flush(10);
  });
  return { ...context, viewport };
}

const rows = () => within(screen.getByRole("dialog", { name: "Import warnings" })).getAllByRole("listitem");
const statusItem = () => screen.getByRole("button", { name: /^Texture not found: Eyes\.png/ });

describe("import warnings in the status bar", () => {
  it("shows nothing for a clean import", async () => {
    await renderStone((scene) => scene);
    expect(document.querySelector(".sb-warn")).toBeNull();
  });

  it("shows the first error and a count, and opens the list with its header", async () => {
    await renderStone();
    expect(statusItem().textContent).toBe("Texture not found: Eyes.png+3");
    const user = userEvent.setup();
    await user.click(statusItem());
    const list = screen.getByRole("dialog", { name: "Import warnings" });
    expect(within(list).getByText("Warnings")).toBeTruthy();
    expect(within(list).getByRole("button", { name: "Copy as prompt" })).toBeTruthy();
    expect(within(list).getByRole("button", { name: "Dismiss all" })).toBeTruthy();
    const items = within(list).getAllByRole("listitem");
    expect(items.map((row) => row.querySelector(".warn-msg")?.textContent)).toEqual([
      "Texture not found: Eyes.png",
      "Root scale x100: Armature",
      "Texture not used: Stone_BaseColor.png",
      "Missing bones: Run",
    ]);
    expect(within(items[2] as HTMLElement).getByText("Texture · Stone_BaseColor.png")).toBeTruthy();
    expect(within(items[2] as HTMLElement).getByRole("button", { name: "Use as base color" })).toBeTruthy();
    expect(within(items[3] as HTMLElement).getByRole("button", { name: "Show clip" })).toBeTruthy();
    expect(within(list).queryByRole("button", { name: /close/i })).toBeNull();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Import warnings" })).toBeNull();
  });

  it("tints the subject while a row is pointed at, and clears it when the pointer leaves", async () => {
    const { viewport } = await renderStone();
    const user = userEvent.setup();
    await user.click(statusItem());
    const row = rows().find((item) => item.textContent?.includes("Eyes.png"));
    if (!row) throw new Error("No row for Eyes.png.");
    await user.hover(row);
    expect(viewport.highlighted?.length).toBe(1);
    await user.unhover(row);
    expect(viewport.highlighted).toBeNull();
  });

  it("adds a row as a comment, after which the row shows the draft's number", async () => {
    await renderStone();
    const user = userEvent.setup();
    await user.click(statusItem());
    const row = () => rows().find((item) => item.textContent?.includes("Eyes.png"));
    await user.click(within(row() as HTMLElement).getByRole("button", { name: "Add as comment" }));
    await act(() => flush());
    const drafts = within(screen.getByRole("list", { name: "Drafts" })).getAllByRole("listitem");
    expect(within(row() as HTMLElement).queryByRole("button", { name: "Add as comment" })).toBeNull();
    expect(row()?.querySelector(".warn-draft")?.textContent).toBe(String(drafts.length));
  });

  it("dismisses one row with its trash button and the rest with the header's", async () => {
    await renderStone();
    const user = userEvent.setup();
    await user.click(statusItem());
    const first = rows()[0] as HTMLElement;
    await user.click(within(first).getByRole("button", { name: "Dismiss" }));
    await act(() => flush());
    expect(screen.getByRole("button", { name: /^Root scale x100: Armature/ }).textContent).toContain("+2");
    await user.click(screen.getByRole("button", { name: "Dismiss all" }));
    await act(() => flush());
    expect(document.querySelector(".sb-warn")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Import warnings" })).toBeNull();
  });

  it("brings dismissed warnings back with Ctrl+Z and dismisses them again with Ctrl+Y or Ctrl+Shift+Z", async () => {
    await renderStone();
    const user = userEvent.setup();
    await user.click(statusItem());
    await user.click(screen.getByRole("button", { name: "Dismiss all" }));
    await act(() => flush());
    expect(document.querySelector(".sb-warn")).toBeNull();
    await user.keyboard("{Control>}z{/Control}");
    await act(() => flush());
    expect(statusItem().textContent).toBe("Texture not found: Eyes.png+3");
    await user.keyboard("{Control>}y{/Control}");
    await act(() => flush());
    expect(document.querySelector(".sb-warn")).toBeNull();
    await user.keyboard("{Control>}z{/Control}{Control>}{Shift>}z{/Shift}{/Control}");
    await act(() => flush());
    expect(document.querySelector(".sb-warn")).toBeNull();
  });

  it("undoes with Cmd+Z on macOS, where Ctrl+Z and Cmd+Y do nothing", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    try {
      const { client } = await renderStone();
      const user = userEvent.setup();
      const undos = () => client.calls.filter((call) => call.name === "review.undo" || call.name === "review.redo");
      await user.keyboard("{Control>}z{/Control}{Meta>}y{/Meta}");
      expect(undos()).toHaveLength(0);
      await user.keyboard("{Meta>}z{/Meta}{Meta>}{Shift>}z{/Shift}{/Meta}");
      expect(undos().map((call) => call.name)).toEqual(["review.undo", "review.redo"]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("leaves Ctrl+Z to a focused text field", async () => {
    const { client } = await renderStone();
    const user = userEvent.setup();
    await user.click(screen.getByRole("textbox", { name: /comment/i }));
    await user.keyboard("{Control>}z{/Control}");
    expect(client.calls.some((call) => call.name === "review.undo")).toBe(false);
  });

  it("removes a member file that failed to load from the view, but never the composition file", async () => {
    const lost = (scene: SceneDescription): SceneDescription => ({
      ...scene,
      source: {
        ...scene.source,
        warnings: [
          importWarning("file-not-found", { kind: "file", name: "lost.fbx" }, "File not found: lost.fbx", "lost.fbx"),
          importWarning(
            "file-not-found",
            { kind: "file", name: "StoneResonator@Idle.fbx" },
            "File not found: StoneResonator@Idle.fbx",
            "StoneResonator@Idle.fbx",
          ),
          importWarning(
            "composition-not-loaded",
            { kind: "file", name: "composition.json" },
            "Could not load: composition.json",
            "composition.json",
          ),
        ],
      },
    });
    const { client } = await renderStone(lost);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^File not found: lost\.fbx/ }));
    const [first, second, composition] = rows() as [HTMLElement, HTMLElement, HTMLElement];
    expect(within(first).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(within(second).queryByRole("button", { name: "Remove from view" })).toBeNull();
    expect(within(composition).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(within(composition).queryByRole("button", { name: "Remove from view" })).toBeNull();
    await user.click(within(first).getByRole("button", { name: "Remove from view" }));
    await act(() => flush());
    expect(client.calls.find((call) => call.name === "composition.removeFile")?.input).toMatchObject({
      file: STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "lost.fbx"),
    });
  });

  it("chooses an image for the slot a missing texture names, through the host's open dialog", async () => {
    const picked = STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "Eyes.png");
    const files: FileHost = {
      pick: vi.fn(async () => ({ paths: [picked], files: [] })),
      place: async () => [],
      open: () => {},
    };
    const { client } = await renderStone(withWarnings, files);
    const user = userEvent.setup();
    await user.click(statusItem());
    const row = rows().find((item) => item.textContent?.includes("Eyes.png")) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Choose texture" }));
    await act(() => flush());
    expect(files.pick).toHaveBeenCalledWith("image", STONE_RESONATOR_PATH);
    expect(client.calls.find((call) => call.name === "material.setTexture")?.input).toMatchObject({
      material: "Stone",
      slot: "baseColor",
      file: picked,
    });
  });

  it("offers Choose file and Retry for a model whose file is gone, and relinks to the picked file", async () => {
    const picked = STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "StoneStriker.fbx");
    const files: FileHost = {
      pick: vi.fn(async () => ({ paths: [picked], files: [] })),
      place: async () => [],
      open: () => {},
    };
    const { client } = await renderStone((scene) => scene, files);
    const [asset] = (await client.query("asset.list", {})).assets;
    await act(async () => {
      client.simulateMissing(asset?.assetId ?? "");
      await flush();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Model not found: StoneResonator\.fbx/ }));
    const [row] = rows();
    expect(within(row as HTMLElement).getByText("File · StoneResonator.fbx")).toBeTruthy();
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Retry" }));
    expect(client.calls.some((call) => call.name === "asset.reload")).toBe(true);

    await user.click(within(row as HTMLElement).getByRole("button", { name: "Choose file" }));
    await act(() => flush());
    expect(files.pick).toHaveBeenCalledWith("model", STONE_RESONATOR_PATH);
    expect(client.calls.find((call) => call.name === "asset.relink")?.input).toEqual({
      assetId: asset?.assetId,
      path: picked,
    });
    expect(screen.getByRole("tab", { name: "StoneStriker.fbx" })).toBeTruthy();
    expect(document.querySelector(".sb-warn")).toBeNull();
  });

  it("offers no Choose file without a host to pick models from", async () => {
    const { client } = await renderStone((scene) => scene);
    const [asset] = (await client.query("asset.list", {})).assets;
    await act(async () => {
      client.simulateMissing(asset?.assetId ?? "");
      await flush();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Model not found/ }));
    const [row] = rows();
    expect(within(row as HTMLElement).queryByRole("button", { name: "Choose file" })).toBeNull();
    expect(within(row as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("offers no Choose texture without a host to pick images from", async () => {
    await renderStone();
    const user = userEvent.setup();
    await user.click(statusItem());
    const row = rows().find((item) => item.textContent?.includes("Eyes.png")) as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Choose texture" })).toBeNull();
  });
});
