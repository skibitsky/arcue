import type { Clip, Material, SceneDescription } from "@arcue/scene";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { STONE_RESONATOR_PATH } from "../../dev/sample-data";
import type { FileHost } from "../store/view-files";
import { flush, NOW, setup, TestViewport } from "../test-helpers";
import { Workspace } from "./Workspace";

async function renderStone(options: Parameters<typeof setup>[0] = {}) {
  const context = setup(options);
  const viewports: TestViewport[] = [];
  const view = render(
    <Workspace
      store={context.store}
      createViewport={() => {
        const viewport = new TestViewport();
        viewports.push(viewport);
        return viewport;
      }}
      samples={[{ name: "StoneResonator.fbx", path: STONE_RESONATOR_PATH }]}
      now={() => NOW}
    />,
  );
  await act(async () => {
    await context.client.execute("asset.open", { path: STONE_RESONATOR_PATH, clip: "Armature|Charge", frame: 34 });
    await flush(10);
  });
  const session = context.store.activeSession();
  if (!session) throw new Error("No active session.");
  return { ...context, view, session, viewport: () => viewports.at(-1), viewports };
}

describe("Workspace", () => {
  it("shows the queue, history, counts and the frame counter", async () => {
    await renderStone();
    const drafts = screen.getByRole("list", { name: "Drafts" });
    expect(within(drafts).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("3 drafts")).toBeNull();
    expect(screen.getByRole("button", { name: /Copy prompt/ }).textContent).toContain("3");
    expect(screen.getByText("Round 3")).toBeTruthy();
    expect(screen.getByText("Yesterday 18:40")).toBeTruthy();
    expect(screen.getByText("2 resolved")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Frame 34 of 45" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clip: Charge" }).textContent).toContain("45 f");
    expect(screen.getByText("10,720 tris")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /StoneResonator\.fbx/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens the comment box when a queue item is selected, and saves an edit with Enter", async () => {
    const { client } = await renderStone();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Comment 2: The torso bobs/ }));
    const box = screen.getByRole("form", { name: "Comment 2" });
    const text = within(box).getByRole("textbox", { name: "Comment text" });
    expect((text as HTMLTextAreaElement).value).toBe("The torso bobs too much. Halve the vertical motion.");
    expect(within(box).getByText("Run · f12–24")).toBeTruthy();
    await user.clear(text);
    await user.type(text, "Bob less.{Enter}");
    await act(() => flush());
    expect(client.calls.find((call) => call.name === "comment.update")?.input).toMatchObject({ text: "Bob less." });
    expect(screen.queryByRole("form", { name: "Comment 2" })).toBeNull();
  });

  it("adds a comment from the panel field", async () => {
    const { client } = await renderStone();
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "Comment without a pin" });
    expect((field as HTMLTextAreaElement).placeholder).toBe("Comment on Charge · f34");
    await user.type(field, "The charge reads too slow.{Enter}");
    await act(() => flush());
    expect(client.calls.find((call) => call.name === "comment.create")?.input).toMatchObject({
      text: "The charge reads too slow.",
      target: null,
    });
    expect(within(screen.getByRole("list", { name: "Drafts" })).getAllByRole("listitem")).toHaveLength(4);
  });

  it("runs the spec's shortcuts on the visible tab", async () => {
    const { session, viewport } = await renderStone();
    const user = userEvent.setup();
    await user.keyboard("c");
    expect(screen.getByRole("button", { name: "Comment" }).getAttribute("aria-pressed")).toBe("true");
    expect(viewport()?.tool).toBe("comment");
    await user.keyboard("]");
    expect(session.state.get().brushSize).toBe(26);
    await user.keyboard("{ArrowRight}");
    expect(session.currentFrame()).toBe(35);
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(session.currentFrame()).toBe(25);
    await user.keyboard(" ");
    expect(viewport()?.playing).toBe(true);
    await user.keyboard(" ");
    expect(viewport()?.playing).toBe(false);
    await user.keyboard("f");
    expect(viewport()?.framed).toHaveLength(1);
    await user.keyboard("v");
    expect(session.state.get().tool).toBe("view");
  });

  it("leaves the undo and redo keys to the host's menu when the host turns history keys off", async () => {
    const { client, store } = setup();
    render(<Workspace store={store} createViewport={() => new TestViewport()} now={() => NOW} historyKeys={false} />);
    await act(async () => {
      await client.execute("asset.open", { path: STONE_RESONATOR_PATH });
      await flush(10);
    });
    const presses = [
      { key: "z", ctrlKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
      { key: "y", ctrlKey: true },
    ];
    for (const press of presses) {
      const event = new KeyboardEvent("keydown", { ...press, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    await act(() => flush());
    expect(client.calls.some((call) => call.name === "review.undo" || call.name === "review.redo")).toBe(false);
  });

  it("undoes from the keyboard while the brush slider has focus, since it is no text field", async () => {
    const { client } = await renderStone();
    const user = userEvent.setup();
    await user.keyboard("c");
    await user.click(screen.getByRole("slider", { name: "Brush size" }));
    await user.keyboard("{Control>}z{/Control}");
    await act(() => flush());
    expect(client.calls.some((call) => call.name === "review.undo")).toBe(true);
  });

  it("ignores shortcuts while typing, except Copy prompt", async () => {
    const { session, client } = await renderStone();
    const user = userEvent.setup();
    await user.click(screen.getByRole("textbox", { name: "Comment without a pin" }));
    await user.keyboard("c");
    expect(session.state.get().tool).toBe("view");
    await user.keyboard("{Control>}{Shift>}C{/Shift}{/Control}");
    await act(() => flush());
    expect(client.calls.some((call) => call.name === "round.copy")).toBe(true);
  });

  it("selects a comment from its timeline marker", async () => {
    const { session } = await renderStone();
    const user = userEvent.setup();
    const timeline = screen.getByRole("region", { name: "Timeline" });
    await user.click(within(timeline).getByRole("button", { name: /^Comment 1: The thumb tip/ }));
    expect(session.state.get().selection).toBe("c7");
  });

  it("marks a sent comment resolved from History", async () => {
    const { session, client } = await renderStone();
    await act(async () => {
      await session.copyPrompt();
      await flush();
    });
    expect(screen.queryByRole("list", { name: "Drafts" })).toBeNull();
    expect(screen.getByRole("button", { name: /Copy prompt/ }).textContent).toBe("Copy prompt");
    const user = userEvent.setup();
    const resolve = screen.getAllByRole("button", { name: "Mark resolved" });
    expect(resolve).toHaveLength(3);
    await user.click(resolve[0] as HTMLElement);
    await act(() => flush());
    expect(client.calls.find((call) => call.name === "comment.resolve")?.input).toMatchObject({ commentId: "c7" });
    expect(screen.getByText("Copied 3 comments as round 4")).toBeTruthy();
  });

  it("shows the empty state with samples on a new tab", async () => {
    const { store, client } = await renderStone();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New tab" }));
    expect(store.state.get().tabs).toHaveLength(2);
    expect(screen.getByText("Drop an FBX or Blender file")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "StoneResonator.fbx" }));
    await act(() => flush());
    expect(client.calls.filter((call) => call.name === "asset.open")).toHaveLength(2);
  });

  it("reports dropped files to the host", async () => {
    const context = setup();
    const dropped: string[] = [];
    render(
      <Workspace
        store={context.store}
        createViewport={() => new TestViewport()}
        onDropFiles={(files) => dropped.push(...files.map((file) => file.name))}
      />,
    );
    const zone = screen.getByRole("region", { name: "Open an asset" });
    const file = new File(["fbx"], "Hero.fbx");
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(dropped).toEqual(["Hero.fbx"]);
  });

  it("labels every icon button", async () => {
    await renderStone();
    for (const button of screen.getAllByRole("button")) {
      const name = button.getAttribute("aria-label") ?? button.textContent ?? "";
      expect(name.trim(), button.outerHTML).not.toBe("");
    }
  });

  it("lets Space press a focused button instead of starting playback", async () => {
    const { session, viewport } = await renderStone();
    const user = userEvent.setup();
    const loop = screen.getByRole("button", { name: "Loop" });
    loop.focus();
    await user.keyboard(" ");
    expect(viewport()?.playing).toBe(false);
    expect(session.state.get().loop).toBe(false);
  });

  it("moves between tabs with the arrow keys and links each tab to its panel", async () => {
    const { store, client } = await renderStone();
    await act(async () => {
      store.openNewTab();
      await flush();
    });
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      expect(tab.querySelector("button")).toBeNull();
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      if (tab.getAttribute("aria-selected") === "true") expect(panel?.getAttribute("role")).toBe("tabpanel");
    }
    const user = userEvent.setup();
    tabs[1]?.focus();
    await user.keyboard("{ArrowLeft}");
    expect(store.state.get().active).toBe(store.state.get().tabs[0]?.id);
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[0]);
    await user.keyboard("{End}");
    expect(store.state.get().active).toBe(store.state.get().tabs[1]?.id);
    expect(client.calls.some((call) => call.name === "asset.close")).toBe(false);
  });

  it("shows a reopen box's time and target without remove buttons", async () => {
    const { session } = await renderStone();
    act(() => session.reopen("c5"));
    const box = screen.getByRole("form", { name: /^Comment/ });
    expect(within(box).queryByRole("button", { name: "Remove time" })).toBeNull();
    expect(within(box).queryByRole("button", { name: "Remove target" })).toBeNull();
    expect(within(box).getByRole("button", { name: "Remove follow-up" })).toBeTruthy();
  });

  it("keeps the 3D view when the host passes a new viewport factory", async () => {
    const { store, view, viewports } = await renderStone();
    const count = viewports.length;
    view.rerender(<Workspace store={store} createViewport={() => new TestViewport()} now={() => NOW} />);
    expect(viewports).toHaveLength(count);
    expect(store.activeSession()?.viewport).toBe(viewports.at(-1));
  });

  it("groups the clip menu by file and removes an added file from its group", async () => {
    const withFiles = (scene: SceneDescription): SceneDescription => {
      const [first] = scene.clips;
      if (!first) return scene;
      const from = (name: string, file: string): Clip => ({
        ...first,
        name: `Armature|${name}`,
        displayName: name,
        file,
      });
      return {
        ...scene,
        clips: [...scene.clips, from("TurnLeft", "Turns.fbx"), from("Idle", "StoneResonator@Idle.fbx")],
      };
    };
    const { client } = await renderStone({ scene: withFiles });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clip: Charge" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("group", { name: "Turns.fbx" })).toBeTruthy();
    expect(within(menu).getByRole("menuitemradio", { name: /TurnLeft/ })).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: "Remove StoneResonator@Idle.fbx from the view" })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: "Remove Turns.fbx from the view" }));
    await act(() => flush());
    expect(client.calls.find((call) => call.name === "composition.removeFile")?.input).toMatchObject({
      file: STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "Turns.fbx"),
    });
  });

  it("reaches a group's trash button with the arrow keys, even for the only file that brings clips", async () => {
    const onlyAdded = (scene: SceneDescription): SceneDescription => ({
      ...scene,
      clips: scene.clips.slice(0, 1).map((clip) => ({ ...clip, file: "Anims.fbx" })),
    });
    const { client } = await renderStone({ scene: onlyAdded });
    const user = userEvent.setup();
    act(() => screen.getByRole("button", { name: /^Clip: / }).focus());
    await user.keyboard("{Enter}");
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("group", { name: "Anims.fbx" })).toBeTruthy();
    expect(document.activeElement?.textContent).toMatch(/^Rest pose/);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove Anims.fbx from the view");
    await user.keyboard("{Enter}");
    await act(() => flush());
    expect(client.calls.find((call) => call.name === "composition.removeFile")?.input).toMatchObject({
      file: STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "Anims.fbx"),
    });
  });

  it("lists texture slots in asset info, picks an image for one and restores an overridden one", async () => {
    const base: Material = {
      name: "Stone",
      baseColor: [1, 1, 1, 1],
      baseColorTexture: null,
      metallic: 0,
      roughness: 0.5,
      metallicRoughnessTexture: null,
      roughnessTexture: null,
      metalnessTexture: null,
      normalTexture: null,
      normalScale: 1,
      occlusionTexture: null,
      emissive: [0, 0, 0],
      emissiveTexture: null,
      alphaMode: "opaque",
      alphaCutoff: 0.5,
      doubleSided: false,
    };
    const picked = STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "Stone.png");
    const files: FileHost = { pick: async () => [picked], place: async () => [], open: () => {} };
    const { client } = await renderStone({
      files,
      scene: (scene) => ({
        ...scene,
        materials: [
          {
            ...base,
            missingTextures: { baseColor: "C:/art/Stone_BaseColor.png" },
            textureOverrides: { normal: { path: "Stone_N.png", found: false } },
          },
        ],
      }),
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Asset info" }));
    const stone = screen.getByRole("region", { name: "Material Stone" });
    expect(within(stone).getByText("C:/art/Stone_BaseColor.png")).toBeTruthy();
    await user.click(within(stone).getByRole("button", { name: "Base color: Stone_BaseColor.png, not found" }));
    await act(() => flush());
    expect(client.calls.find((call) => call.name === "material.setTexture")?.input).toMatchObject({
      material: "Stone",
      slot: "baseColor",
      file: picked,
    });
    await user.click(within(stone).getByRole("button", { name: "Use the file's normal texture" }));
    await act(() => flush());
    expect(client.calls.filter((call) => call.name === "material.setTexture").at(-1)?.input).toMatchObject({
      slot: "normal",
      file: null,
    });
  });

  it("asks where a model dropped on the 3D view goes, and discards the placed copy when Escape dismisses it", async () => {
    const discarded: string[][] = [];
    const files: FileHost = {
      pick: async () => [],
      place: async (dropped) => dropped.map((entry) => `/work/${entry.name}`),
      open: () => {},
      discard: (dropped) => {
        discarded.push(dropped.map((entry) => entry.name));
      },
    };
    const { store } = await renderStone({ files });
    const view = screen.getByRole("region", { name: "3D view" });
    const drop = () =>
      act(async () => {
        fireEvent.drop(view, { dataTransfer: { files: [new File(["x"], "Crate.fbx")], types: ["Files"] } });
        await flush();
      });
    await drop();
    expect(store.state.get().dropPrompt?.models).toEqual([{ path: "/work/Crate.fbx", role: null }]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("menuitem", { name: "Add to view" }));
    await act(() => flush());
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([]);

    await drop();
    await user.keyboard("{Escape}");
    await act(() => flush());
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([["Crate.fbx"]]);
  });
});

describe("an earlier review of a renamed file", () => {
  const candidate = {
    path: STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "StoneStriker.fbx"),
    comments: 3,
    lastLoadedAt: "2026-10-08T14:00:00.000Z",
    match: "structure" as const,
  };

  it("offers it at the bottom of the 3D view with Continue and a close button, until one is used", async () => {
    const { client, session } = await renderStone();
    await act(async () => {
      client.simulateOffer(session.assetId, candidate);
      await flush();
    });
    const offer = screen.getByText("Looks like StoneStriker.fbx, renamed.").closest(".offer") as HTMLElement;
    expect(offer.closest(".viewport-area")).not.toBeNull();
    expect(within(offer).getByRole("button", { name: "Continue" })).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(offer).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Looks like StoneStriker.fbx, renamed.")).toBeNull();
    expect(client.calls.some((call) => call.name === "review.relink")).toBe(false);
  });

  it("continues the review from the offer", async () => {
    const { client, session } = await renderStone();
    await act(async () => {
      client.simulateOffer(session.assetId, candidate);
      await flush();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await act(() => flush());
    expect(client.calls.find((call) => call.name === "review.relink")?.input).toEqual({
      assetId: session.assetId,
      from: candidate.path,
    });
    expect(screen.queryByText("Looks like StoneStriker.fbx, renamed.")).toBeNull();
  });

  it("retitles the tab and shows a toast when the file was renamed while open", async () => {
    const { client, session } = await renderStone();
    await act(async () => {
      client.simulateRename(session.assetId, STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "Resonator.fbx"));
      await flush();
    });
    expect(screen.getByRole("tab", { name: "Resonator.fbx" })).toBeTruthy();
    expect(document.querySelector(".toast")?.textContent).toBe("Continued the review of StoneResonator.fbx");
  });
});
