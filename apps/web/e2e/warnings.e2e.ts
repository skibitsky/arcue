import { fileURLToPath } from "node:url";
import type { CoreClient, WarningSubject } from "@arcue/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { UNLINKED_TEXTURE_FBX } from "../../../packages/import-fbx/test/ascii-fbx.ts";

interface ArcueGlobal {
  client: CoreClient;
  store: { session(assetId: string): { state: { get(): { highlight: WarningSubject | null } } } | null };
}

const SHOTS = fileURLToPath(new URL("../screenshots/", import.meta.url));

/** A composition of the golem that names a missing animation file, texture, material and part. */
const GOLEM_COMPOSITION = JSON.stringify({
  version: 1,
  model: "pebble-golem.fbx",
  animations: ["pebble-golem-extra.fbx"],
  materials: { Stone: { baseColor: "Textures/Stone_BaseColor.png" }, Moss: { normal: "moss.png" } },
  hidden: ["Helmet"],
});

async function drop(page: Page, files: { name: string; sample?: string; text?: string; png?: true }[]) {
  const transfer = await page.evaluateHandle(async (entries) => {
    const transfer = new DataTransfer();
    for (const entry of entries) {
      let body: BlobPart = entry.text ?? "";
      if (entry.sample) body = await (await fetch(`samples/${entry.sample}`)).arrayBuffer();
      if (entry.png) {
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = "#b5651d";
          context.fillRect(0, 0, 4, 4);
        }
        body = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? new Blob()), "image/png"));
      }
      transfer.items.add(new File([body], entry.name));
    }
    return transfer;
  }, files);
  await page.dispatchEvent("section.empty", "drop", { dataTransfer: transfer });
}

async function readyAsset(page: Page, file: string): Promise<string> {
  return page.evaluate(async (name) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    for (let tries = 0; tries < 200; tries++) {
      const { assets } = await client.query("asset.list", {});
      const asset = assets.find((entry) => entry.name === name);
      if (asset?.status === "ready" && asset.version) return asset.assetId;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${name} did not load.`);
  }, file);
}

function highlight(page: Page, assetId: string) {
  return page.evaluate((id) => {
    const { store } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    return store.session(id)?.state.get().highlight ?? null;
  }, assetId);
}

test("lists import warnings above the status bar, tints a row's subject, and turns rows into comments", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await drop(page, [
    { name: "pebble-golem.fbx", sample: "pebble-golem.fbx" },
    { name: "pebble-golem.arcue", text: GOLEM_COMPOSITION },
  ]);
  const assetId = await readyAsset(page, "pebble-golem.fbx");
  const status = page.locator(".sb-warn");
  await expect(status).toHaveText(/\+4$/);
  await page.screenshot({ path: `${SHOTS}warnings-status.png` });

  await status.click();
  const list = page.getByRole("dialog", { name: "Import warnings" });
  await expect(list.getByText("Warnings", { exact: true })).toBeVisible();
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(5);
  const texture = rows.filter({ hasText: "Texture not found: Stone_BaseColor.png" });
  await texture.hover();
  expect(await highlight(page, assetId)).toEqual({
    kind: "texture",
    name: "Stone_BaseColor.png",
    file: "pebble-golem.arcue",
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}warnings-list.png` });

  await texture.getByRole("button", { name: "Add as comment" }).click();
  await expect(texture.locator(".warn-draft")).toHaveText("1");
  const panel = page.getByRole("complementary", { name: "Comments" });
  await expect(panel.getByRole("button", { name: /^Comment 1: Texture not found/ })).toBeVisible();
  await rows.filter({ hasText: "pebble-golem-extra.fbx was not found" }).hover();
  await expect(rows.filter({ hasText: "pebble-golem-extra.fbx" }).getByRole("button", { name: "Retry" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}warnings-draft.png` });

  await rows.filter({ hasText: "Part not found: Helmet" }).hover();
  await rows.filter({ hasText: "Part not found: Helmet" }).getByRole("button", { name: "Dismiss" }).click();
  await expect(rows).toHaveCount(4);
  await expect(status).toHaveText(/\+3$/);

  await list.getByRole("button", { name: "Copy as prompt" }).click();
  await expect(page.getByText("Copied 4 warnings")).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt.split("\n")[0]).toBe(
    "Fix these import warnings in /files/pebble-golem/pebble-golem.fbx, then export it again.",
  );
  expect(prompt).toContain("Texture not found: Stone_BaseColor.png");
  expect(prompt).not.toContain("Helmet");

  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  expect(await highlight(page, assetId)).toBeNull();

  const undone = await page.evaluate(async (id) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    await client.execute("review.undo", { assetId: id });
    await client.execute("review.undo", { assetId: id });
    return (await client.query("warning.list", { assetId: id })).warnings.filter((warning) => !warning.dismissed);
  }, assetId);
  expect(undone).toHaveLength(5);
  await expect(status).toHaveText(/\+4$/);

  await status.click();
  await list.getByRole("button", { name: "Dismiss all" }).click();
  await expect(status).toBeHidden();
});

test("offers an unused texture as the base color, after which the warning is gone", async ({ page }) => {
  await page.goto("/");
  await drop(page, [
    { name: "body.fbx", text: UNLINKED_TEXTURE_FBX },
    { name: "Body_BaseColor.png", png: true },
  ]);
  const assetId = await readyAsset(page, "body.fbx");
  const status = page.locator(".sb-warn");
  await expect(status).toHaveText("Texture not used: Body_BaseColor.png");
  await status.click();
  await page.getByRole("dialog", { name: "Import warnings" }).getByRole("listitem").hover();
  await page.screenshot({ path: `${SHOTS}warnings-base-color.png` });
  await page.getByRole("button", { name: "Use as base color" }).click();
  await expect(status).toBeHidden();
  const material = await page.evaluate(async (id) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    const { scene } = await client.query("scene.get", { assetId: id });
    return scene.materials.find((entry) => entry.name === "Body")?.baseColorTexture ?? null;
  }, assetId);
  expect(material).not.toBeNull();
});

test("fits the warnings list on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await drop(page, [
    { name: "pebble-golem.fbx", sample: "pebble-golem.fbx" },
    { name: "pebble-golem.arcue", text: GOLEM_COMPOSITION },
  ]);
  await readyAsset(page, "pebble-golem.fbx");
  const status = page.locator(".sb-warn");
  await status.scrollIntoViewIfNeeded();
  await status.click();
  const list = page.getByRole("dialog", { name: "Import warnings" });
  await expect(list).toBeVisible();
  const box = await list.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }
  await page.screenshot({ path: `${SHOTS}warnings-phone.png` });
});
