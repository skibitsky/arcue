import { fileURLToPath } from "node:url";
import type { CoreClient } from "@arcue/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

interface ArcueGlobal {
  client: CoreClient;
}

const SHOTS = fileURLToPath(new URL("../screenshots/", import.meta.url));
const STONE_STRIKER = fileURLToPath(new URL("../../../tools/samples/sources/stone-striker.blend", import.meta.url));

async function readyAsset(page: Page, file: string): Promise<string> {
  return page.evaluate(async (name) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    for (let tries = 0; tries < 600; tries++) {
      const { assets } = await client.query("asset.list", {});
      const asset = assets.find((entry) => entry.name === name);
      if (asset?.status === "failed") throw new Error(asset.error ?? "import failed");
      if (asset?.status === "ready" && asset.version) return asset.assetId;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${name} did not load.`);
  }, file);
}

async function covered(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context.");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const [r0 = 0, g0 = 0, b0 = 0] = data;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const delta =
        Math.abs((data[index] ?? 0) - r0) +
        Math.abs((data[index + 1] ?? 0) - g0) +
        Math.abs((data[index + 2] ?? 0) - b0);
      if (delta > 60) count++;
    }
    return count / (data.length / 4);
  }, png.toString("base64"));
}

test("opens a Blender file with its LODs, packed texture and actions, and shows a clip at a frame", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Drop an FBX or Blender file")).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open a file" }).click();
  await (await chooser).setFiles(STONE_STRIKER);
  await expect(page.getByRole("tab", { name: "stone-striker.blend" })).toBeVisible();
  const assetId = await readyAsset(page, "stone-striker.blend");

  const facts = await page.evaluate(async (id) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    const { scene } = await client.query("scene.get", { assetId: id });
    return {
      format: scene.source.format,
      clips: scene.clips.map((clip) => clip.name),
      parts: scene.parts.map((part) => [part.id, part.levels.length]),
      textures: scene.textures.map((texture) => texture.name),
      warnings: scene.source.warnings.length,
    };
  }, assetId);
  expect(facts).toEqual({
    format: "blend",
    clips: [
      "Charge",
      "Dead",
      "Death",
      "Displaced",
      "Idle",
      "Locked",
      "Reassess",
      "Recover",
      "Release",
      "Run",
      "Rush",
      "Stop",
      "Walk",
    ],
    parts: [["StoneResonatorRig/Body_LOD0", 3]],
    textures: ["StoneStriker-BaseColor"],
    warnings: 0,
  });

  const canvas = page.locator(".arcue-vp-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("img", { name: /^Frame \d+ of 96$/ })).toBeVisible();
  await expect.poll(async () => covered(page, await canvas.screenshot())).toBeGreaterThan(0.03);
  const first = await canvas.screenshot();
  await page.screenshot({ path: `${SHOTS}blend-opened.png` });

  await page.evaluate(async (id) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    await client.execute("view.setClip", { assetId: id, clip: "Walk" });
    await client.execute("view.setFrame", { assetId: id, frame: 15 });
  }, assetId);
  await expect(page.getByRole("img", { name: "Frame 15 of 60" })).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(first)).toBe(false);
  await page.screenshot({ path: `${SHOTS}blend-walk-15.png` });
});
