import { fileURLToPath } from "node:url";
import type { CoreClient } from "@arcue/protocol";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

interface ArcueGlobal {
  client: CoreClient;
  store: { session(assetId: string): { addTextComment(text: string): Promise<boolean> } | null };
}

const SHOTS = fileURLToPath(new URL("../screenshots/", import.meta.url));

async function readyAsset(page: Page, file: string): Promise<string> {
  return page.evaluate(async (name) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    for (let tries = 0; tries < 200; tries++) {
      const { assets } = await client.query("asset.list", {});
      const asset = assets.find((entry) => entry.name === name);
      if (asset?.status === "failed") throw new Error(asset.error ?? "import failed");
      if (asset?.status === "ready" && asset.version) return asset.assetId;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${name} did not load.`);
  }, file);
}

/** Where a node of the scene on screen hangs: its parent's name, or null at the top. */
function parentOf(page: Page, assetId: string, path: string): Promise<string | null> {
  return page.evaluate(
    async ({ assetId, path }) => {
      const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
      const { scene } = await client.query("scene.get", { assetId });
      const node = scene.nodes.find((candidate) => candidate.path === path);
      return node ? (scene.nodes[node.parent]?.name ?? null) : "missing";
    },
    { assetId, path },
  );
}

function outline(page: Page): Locator {
  return page.getByRole("complementary", { name: "Outline" });
}

function stats(page: Page): Locator {
  return page.locator(".ws:not([hidden]) .sb-stats");
}

async function rows(page: Page): Promise<string[]> {
  return outline(page)
    .getByRole("treeitem")
    .evaluateAll((items) =>
      items.map(
        (item) => `${"  ".repeat(Number(item.getAttribute("aria-level")) - 1)}${item.getAttribute("aria-label")}`,
      ),
    );
}

async function openBeetle(page: Page): Promise<string> {
  await page.goto("/?sample=beetle");
  const assetId = await readyAsset(page, "beetle.fbx");
  await expect(page.locator(".arcue-vp-canvas")).toBeVisible();
  return assetId;
}

test("the beetle's outline lists files, bones and parts; the eye hides, Alt-click isolates and Escape restores", async ({
  page,
}) => {
  const assetId = await openBeetle(page);
  await expect(outline(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Outline" }).click();
  await expect(outline(page)).toBeVisible();
  expect(await rows(page)).toEqual([
    "beetle.fbx",
    "  Legs",
    "  Body",
    "    beetle-shells.fbx",
    "      ShellRound",
    "      ShellSpiked",
  ]);
  await expect(stats(page)).toContainText("5,200 tris");
  const box = await outline(page).boundingBox();
  const canvas = await page.locator(".arcue-vp-canvas").boundingBox();
  expect(box?.width).toBe(248);
  expect(canvas && box ? canvas.x : 0).toBeGreaterThanOrEqual((box?.x ?? 0) + 248);

  await outline(page).getByRole("button", { name: "Hide ShellRound" }).click();
  await expect(stats(page)).toContainText("3,920 tris");
  await outline(page)
    .getByRole("button", { name: "Show ShellSpiked" })
    .click({ modifiers: ["Alt"] });
  await expect(stats(page)).toContainText("1,476 tris");
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${SHOTS}outline-isolated.png` });
  await page.keyboard.press("Escape");
  await expect(stats(page)).toContainText("3,920 tris");

  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
        const state = await client.query("viewState.get", { assetId: id });
        return state && { outlineOpen: state.outlineOpen, parts: state.parts };
      }, assetId),
    )
    .toEqual({
      outlineOpen: true,
      parts: { hidden: ["beetle-shells.fbx//ShellRound"], shown: [], isolated: null, lod: 0 },
    });

  await page.keyboard.press("o");
  await expect(outline(page)).toBeHidden();
});

test("dragging the shells onto a bone attaches them, and onto the model leaves them in place", async ({ page }) => {
  const assetId = await openBeetle(page);
  await page.keyboard.press("o");
  await page.getByRole("button", { name: "Skeleton" }).click();
  await outline(page).getByRole("textbox", { name: "Filter" }).fill("thigh.f");
  expect(await rows(page)).toEqual(["beetle.fbx", "  Body", "    Thigh.FL", "    Thigh.FR"]);
  await outline(page).getByRole("textbox", { name: "Filter" }).fill("");

  const row = (name: string) => outline(page).getByRole("treeitem", { name, exact: true });
  await row("beetle-shells.fbx").dragTo(row("Thigh.FL"));
  await expect.poll(() => parentOf(page, assetId, "beetle-shells.fbx//ShellRound")).toBe("Thigh.FL");
  await expect(row("Thigh.FL").locator("xpath=following-sibling::*[1]")).toHaveAttribute(
    "aria-label",
    "beetle-shells.fbx",
  );
  await page.screenshot({ path: `${SHOTS}outline-attached.png` });

  await row("beetle-shells.fbx").dragTo(row("beetle.fbx"));
  await expect.poll(() => parentOf(page, assetId, "beetle-shells.fbx//ShellRound")).toBeNull();
  await page.getByRole("button", { name: "Skeleton" }).click();
  expect(await rows(page)).toEqual(["beetle.fbx", "  Legs", "beetle-shells.fbx", "  ShellRound", "  ShellSpiked"]);
});

test("the rock's LOD switch lists LOD0 first with triangle counts, and the status bar counts the LOD on screen", async ({
  page,
}) => {
  await page.goto("/?sample=rock-lods");
  await readyAsset(page, "rock-lods.fbx");
  const lod = page.getByRole("group", { name: "LOD" });
  await expect(lod.getByRole("button")).toHaveText(["0", "1", "2"]);
  await expect(lod.getByRole("button", { name: "LOD0" })).toHaveAttribute("aria-pressed", "true");
  await expect(stats(page)).toContainText("1,600 tris");
  await lod.getByRole("button", { name: "LOD1" }).hover();
  await expect(page.getByRole("tooltip")).toHaveText("LOD1 · 640 tris");
  await lod.getByRole("button", { name: "LOD2" }).click();
  await expect(stats(page)).toContainText("400 tris");

  await page.keyboard.press("o");
  expect(await rows(page)).toEqual(["rock-lods.fbx", "  Pebble", "  Rock", "  UCX_Rock"]);
  await expect(outline(page).getByRole("button", { name: "Show UCX_Rock" })).toBeVisible();
  await expect(outline(page).getByRole("textbox", { name: "Filter" })).toHaveCount(0);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${SHOTS}outline-lods.png` });

  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("button", { name: /^crate\.fbx/ }).click();
  await readyAsset(page, "crate.fbx");
  await expect(page.getByRole("tab", { name: "crate.fbx" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".ws:not([hidden])").getByRole("button", { name: "Outline" })).toHaveCount(0);
  await expect(page.locator(".ws:not([hidden])").getByRole("group", { name: "LOD" })).toHaveCount(0);
});

test("a comment made with a part hidden carries a view chip, and selecting it restores that view", async ({ page }) => {
  const assetId = await openBeetle(page);
  await page.keyboard.press("o");
  await outline(page).getByRole("button", { name: "Hide ShellRound" }).click();
  await page.evaluate(async (id) => {
    await (window as unknown as { arcue: ArcueGlobal }).arcue.store.session(id)?.addTextComment("Show the seam.");
  }, assetId);
  const item = page
    .getByRole("complementary", { name: "Comments" })
    .getByRole("button", { name: "Comment 1: Show the seam." });
  await expect(item.locator(".chip", { hasText: "Legs" })).toBeVisible();
  await item.locator(".chip", { hasText: "Legs" }).hover();
  await expect(page.getByRole("tooltip")).toHaveText("Hidden: ShellRound, ShellSpiked");

  await outline(page).getByRole("button", { name: "Show ShellRound" }).click();
  await expect(stats(page)).toContainText("5,200 tris");
  await item.click();
  await expect(stats(page)).toContainText("3,920 tris");
});

test("under 760 px the drawer sits between the toolbar and the 3D view, which keeps its height", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openBeetle(page);
  const canvas = page.locator(".arcue-vp-canvas");
  const before = await canvas.boundingBox();
  await page.getByRole("button", { name: "Outline" }).click();
  await expect(outline(page)).toBeVisible();
  const drawer = await outline(page).boundingBox();
  const after = await canvas.boundingBox();
  expect(drawer?.width).toBe(375);
  expect((drawer?.y ?? 0) + (drawer?.height ?? 0)).toBeLessThanOrEqual((after?.y ?? 0) + 1);
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 0);
  expect(after?.width).toBe(375);
  await page.screenshot({ path: `${SHOTS}outline-narrow.png` });
});
