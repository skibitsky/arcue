import { fileURLToPath } from "node:url";
import type { CoreClient } from "@arcue/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { readSampleEntries } from "../samples-plugin.ts";

interface ArcueGlobal {
  client: CoreClient;
  openSample(id: string, at?: { clip?: string; frame?: number }): Promise<string>;
}

const SHOTS = fileURLToPath(new URL("../screenshots/", import.meta.url));
const samples = readSampleEntries(fileURLToPath(new URL("../../../samples/", import.meta.url)));
const clipsOf: Record<string, string[]> = {
  "pebble-golem": ["Hit", "Idle", "Walk", "Wave"],
  "pebble-golem-sparse": ["Hit", "Idle", "Walk", "Wave"],
  blob: ["Bounce"],
};

async function readyAsset(page: Page, file: string): Promise<{ assetId: string; version: string }> {
  return page.evaluate(async (name) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    for (let tries = 0; tries < 200; tries++) {
      const { assets } = await client.query("asset.list", {});
      const asset = assets.find((entry) => entry.name === name);
      if (asset?.status === "failed") throw new Error(asset.error ?? "import failed");
      if (asset?.status === "ready" && asset.version) return { assetId: asset.assetId, version: asset.version };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${name} did not load.`);
  }, file);
}

test("opens every sample from the gallery with its clips", async ({ page }) => {
  await page.goto("/");
  expect(samples.map((sample) => sample.id)).not.toContain("StoneResonator");
  for (const [index, sample] of samples.entries()) {
    if (index > 0) await page.getByRole("button", { name: "New tab" }).click();
    await page.getByRole("button", { name: new RegExp(`^${sample.file.replace(/\./g, "\\.")}`) }).click();
    await expect(page.getByRole("tab", { name: sample.file })).toHaveAttribute("aria-selected", "true");
    await readyAsset(page, sample.file);

    const clips = clipsOf[sample.id] ?? [];
    if (clips.length > 0) {
      const clipButton = page.locator(".timeline").getByRole("button", { name: /^Clip: / });
      await expect(clipButton).toBeEnabled();
      await clipButton.click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitemradio", { name: /Rest pose/ })).toBeVisible();
      for (const clip of clips) await expect(menu.getByRole("menuitemradio", { name: new RegExp(clip) })).toBeVisible();
      await page.keyboard.press("Escape");

      const last = clips.includes("Walk") ? "Walk" : (clips[0] ?? "");
      await clipButton.click();
      await page.getByRole("menuitemradio", { name: new RegExp(last) }).click();
      await expect(page.getByRole("img", { name: /^Frame 0 of \d+$/ })).toBeVisible();
    } else {
      await expect(page.locator(".ws:not([hidden]) .sb-stats")).toBeVisible();
      await expect(page.locator(".ws:not([hidden]) .timeline")).toHaveCount(0);
    }
    await page.screenshot({ path: `${SHOTS}sample-${sample.id}.png` });
  }
  await expect(page.getByRole("tab")).toHaveCount(samples.length);
});

test("a deep link opens a sample at a clip and frame", async ({ page }) => {
  await page.goto("/?sample=pebble-golem&clip=Armature%7CWalk&frame=12");
  await expect(page.getByRole("tab", { name: "pebble-golem.fbx" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clip: Walk" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Frame 12 of 30" })).toBeVisible();
});

async function addComment(page: Page, text: string): Promise<void> {
  const { assetId, version } = await readyAsset(page, "pebble-golem.fbx");
  await page.evaluate(
    async ({ assetId, version, text }) => {
      const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
      await client.execute("comment.create", {
        assetId,
        text,
        version,
        time: { kind: "frame", clip: "Armature|Walk", frame: 12 },
        target: null,
        camera: { position: [0, 1, 4], target: [0, 0.8, 0], up: [0, 1, 0], fov: 30 },
        context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
        screenshot: null,
      });
    },
    { assetId, version, text },
  );
  const panel = page.getByRole("complementary", { name: "Comments" });
  await expect(panel.getByRole("button", { name: `Comment 1: ${text}` })).toBeVisible();
}

test("copies a round with a comment made through window.arcue", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?sample=pebble-golem&clip=Armature%7CWalk&frame=12");
  await addComment(page, "Plant the left foot earlier.");
  await page.getByRole("button", { name: /Copy prompt/ }).click();
  await expect(page.getByText("Copied 1 comment as round 1")).toBeVisible();

  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("3D review · round 1 · 1 comment");
  expect(prompt).toContain("Asset: /samples/pebble-golem.fbx");
  expect(prompt).toContain('1. Clip "Walk", frame 12 · no surface target');
  expect(prompt).toContain("Plant the left foot earlier.");
  await page.screenshot({ path: `${SHOTS}copied-round.png` });
});

test("shows the prompt in a sheet when the browser blocks the clipboard", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException("Blocked", "NotAllowedError"));
  });
  await page.goto("/?sample=pebble-golem&clip=Armature%7CWalk&frame=12");
  await addComment(page, "Raise the chin.");
  await page.getByRole("button", { name: /Copy prompt/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("textbox")).toHaveValue(/Raise the chin\./);
  await page.screenshot({ path: `${SHOTS}copy-sheet.png` });
});

test("opens a picked file and a dropped file", async ({ page }) => {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open a file" }).click();
  await (await chooser).setFiles(fileURLToPath(new URL("../../../samples/crate.fbx", import.meta.url)));
  await expect(page.getByRole("tab", { name: "crate.fbx" })).toBeVisible();
  await readyAsset(page, "crate.fbx");

  await page.getByRole("button", { name: "New tab" }).click();
  const drop = await page.evaluateHandle(async () => {
    const bytes = await (await fetch("samples/blob.fbx")).arrayBuffer();
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "Blob Export.fbx"));
    return transfer;
  });
  await page.dispatchEvent("section.empty", "drop", { dataTransfer: drop });
  await expect(page.getByRole("tab", { name: "Blob Export.fbx" })).toBeVisible();
  const { assetId } = await readyAsset(page, "Blob Export.fbx");
  const path = await page.evaluate(async (id) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    const { assets } = await client.query("asset.list", {});
    return assets.find((asset) => asset.assetId === id)?.path;
  }, assetId);
  expect(path).toBe("/files/Blob Export/Blob Export.fbx");
});

test("fails an import at once when the import worker cannot load", async ({ page }) => {
  await page.route("**/assets/import-worker-*.js", (route) => route.fulfill({ status: 404 }));
  await page.goto("/");
  await page.getByRole("button", { name: /^blob\.fbx/ }).click();
  await expect(
    page.getByText("The importer could not load; reload the page to get the current version."),
  ).toBeVisible();
  const status = await page.evaluate(async () => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    for (let tries = 0; tries < 100; tries++) {
      const { assets } = await client.query("asset.list", {});
      const asset = assets.find((entry) => entry.name === "blob.fbx");
      if (asset?.status === "failed") return asset.status;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return "still loading";
  });
  expect(status).toBe("failed");
});

test("says so when the core worker cannot load", async ({ page }) => {
  await page.route("**/assets/core-worker-*.js", (route) => route.fulfill({ status: 404 }));
  await page.goto("/");
  await expect(page.getByText("Arcue could not start; reload the page to get the current version.")).toBeVisible();
});
