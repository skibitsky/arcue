import { fileURLToPath } from "node:url";
import type { CoreClient } from "@arcue/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

interface ArcueGlobal {
  client: CoreClient;
  store: { session(assetId: string): { addTextComment(text: string): Promise<boolean> } | null };
  renameFile(from: string, to: string): Promise<void>;
}

const SHOTS = fileURLToPath(new URL("../screenshots/", import.meta.url));

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

test("follows a model renamed while its tab is open, with its comments, and says so once", async ({ page }) => {
  await page.goto("/?sample=pebble-golem");
  const assetId = await readyAsset(page, "pebble-golem.fbx");
  await page.evaluate(async (id) => {
    await (window as unknown as { arcue: ArcueGlobal }).arcue.store.session(id)?.addTextComment("Soften the brow.");
  }, assetId);
  await expect(page.getByRole("list", { name: "Drafts" }).getByRole("listitem")).toHaveCount(1);

  await page.evaluate(() =>
    (window as unknown as { arcue: ArcueGlobal }).arcue.renameFile(
      "/samples/pebble-golem.fbx",
      "/samples/pebble-golem-v2.fbx",
    ),
  );
  await expect(page.getByRole("tab", { name: "pebble-golem-v2.fbx" })).toBeVisible();
  await expect(page.locator(".toast.is-on")).toHaveText("Continued the review of pebble-golem.fbx");
  await page.screenshot({ path: `${SHOTS}rename-followed.png` });

  const after = await page.evaluate(async (id) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    const { assets } = await client.query("asset.list", {});
    const review = await client.query("review.get", { assetId: id });
    return { assets: assets.map((asset) => [asset.assetId, asset.path]), comments: review.comments.length };
  }, assetId);
  expect(after).toEqual({ assets: [[assetId, "/samples/pebble-golem-v2.fbx"]], comments: 1 });
  await expect(page.getByRole("list", { name: "Drafts" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.locator(".sb-warn")).toHaveCount(0);
});
