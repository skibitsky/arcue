import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import type { CoreClient } from "@arcue/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

interface ArcueGlobal {
  client: CoreClient;
}

const SHOTS = fileURLToPath(new URL("../screenshots/", import.meta.url));
const sample = (name: string) => fileURLToPath(new URL(`../../../samples/${name}`, import.meta.url));

/** A small PNG made here, since the samples embed their only image. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(kind, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rows.set([150 + ((x + y) % 40), 110, 70], y * (width * 3 + 1) + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const WOOD = { name: "wood-basecolor.png", mimeType: "image/png", buffer: png(32, 32) };

async function readyAsset(page: Page, file: string): Promise<string> {
  return page.evaluate(async (name) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    for (let tries = 0; tries < 300; tries++) {
      const { assets } = await client.query("asset.list", {});
      const asset = assets.find((entry) => entry.name === name);
      if (asset?.status === "failed") throw new Error(asset.error ?? "import failed");
      if (asset?.status === "ready" && asset.version) return asset.assetId;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${name} did not load.`);
  }, file);
}

function sceneFacts(page: Page, assetId: string) {
  return page.evaluate(async (id) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    const { scene } = await client.query("scene.get", { assetId: id });
    const { materials } = await client.query("scene.materials", { assetId: id });
    const { assets } = await client.query("asset.list", {});
    return {
      composition: assets.find((asset) => asset.assetId === id)?.composition ?? null,
      clips: scene.clips.map((clip) => [clip.name, clip.file ?? null]),
      parts: scene.parts.map((part) => part.id),
      materials,
    };
  }, assetId);
}

/** Drops files fetched from the samples, and made ones, on an element at a point inside it. */
async function drop(
  page: Page,
  selector: string,
  files: { name: string; sample?: string; bytes?: number[]; text?: string }[],
) {
  const transfer = await page.evaluateHandle(async (entries) => {
    const data = new DataTransfer();
    for (const entry of entries) {
      const body = entry.sample
        ? await (await fetch(`samples/${entry.sample}`)).arrayBuffer()
        : entry.bytes
          ? new Uint8Array(entry.bytes)
          : (entry.text ?? "");
      data.items.add(new File([body], entry.name));
    }
    return data;
  }, files);
  const box = await page.locator(selector).boundingBox();
  const point = { clientX: (box?.x ?? 0) + 360, clientY: (box?.y ?? 0) + 260 };
  await page.dispatchEvent(selector, "dragover", { dataTransfer: transfer, ...point });
  await page.dispatchEvent(selector, "drop", { dataTransfer: transfer, ...point });
}

const VIEW = ".ws:not([hidden]) .viewport-area";

test("adds an animation file from the open dialog, groups its clips, and removes it again", async ({ page }) => {
  await page.goto("/?sample=pebble-golem");
  const assetId = await readyAsset(page, "pebble-golem.fbx");
  await page.getByRole("button", { name: "Asset info" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add file" }).click();
  await (await chooser).setFiles(sample("beetle-turn.fbx"));
  await expect(page.getByText("Added beetle-turn.fbx")).toBeVisible();
  await expect
    .poll(async () => (await sceneFacts(page, assetId)).clips.at(-1))
    .toEqual(["Armature|Turn", "beetle-turn.fbx"]);
  expect((await sceneFacts(page, assetId)).composition).toBe("/samples/pebble-golem.arcue");
  await page.keyboard.press("Escape");

  await page
    .locator(".timeline")
    .getByRole("button", { name: /^Clip: / })
    .click();
  const menu = page.getByRole("menu");
  const group = menu.getByRole("group", { name: "beetle-turn.fbx" });
  await expect(group.getByRole("menuitemradio", { name: /Turn/ })).toBeVisible();
  await group.getByText("beetle-turn.fbx").hover();
  await page.screenshot({ path: `${SHOTS}files-clip-groups.png` });
  await group.getByRole("button", { name: "Remove beetle-turn.fbx from the view" }).click();
  await expect(menu.getByRole("group", { name: "beetle-turn.fbx" })).toHaveCount(0);
  expect((await sceneFacts(page, assetId)).clips.map(([name]) => name)).not.toContain("Armature|Turn");

  const undone = await page.evaluate(async (id) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    return client.execute("review.undo", { assetId: id });
  }, assetId);
  expect(undone).toEqual({ changed: true });
  expect((await sceneFacts(page, assetId)).clips.map(([name]) => name)).toContain("Armature|Turn");
});

test("drops models on a model's view: animations join at once, anything else asks", async ({ page }) => {
  await page.goto("/?sample=pebble-golem");
  const assetId = await readyAsset(page, "pebble-golem.fbx");

  await drop(page, VIEW, [{ name: "beetle-turn.fbx", sample: "beetle-turn.fbx" }]);
  await expect(page.getByText("Added beetle-turn.fbx")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Add to view" })).toHaveCount(0);

  await drop(page, VIEW, [{ name: "crate.fbx", sample: "crate.fbx" }]);
  const prompt = page.getByRole("menu", { name: "Dropped file" });
  await expect(prompt.getByRole("menuitem", { name: "New tab" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}files-drop-prompt.png` });
  await prompt.getByRole("menuitem", { name: "Add to view" }).click();
  await expect.poll(async () => (await sceneFacts(page, assetId)).parts).toContain("crate.fbx//Crate");

  await drop(page, VIEW, [{ name: "blob.fbx", sample: "blob.fbx" }]);
  await page.getByRole("menu", { name: "Dropped file" }).getByRole("menuitem", { name: "New tab" }).click();
  await expect(page.getByRole("tab", { name: "blob.fbx" })).toHaveAttribute("aria-selected", "true");
  expect((await sceneFacts(page, assetId)).parts).not.toContain("blob.fbx//Blob");
});

test("assigns a texture from the open dialog and restores the file's own", async ({ page }) => {
  await page.goto("/?sample=crate");
  const assetId = await readyAsset(page, "crate.fbx");
  await page.getByRole("button", { name: "Asset info" }).click();
  const wood = page.getByRole("region", { name: "Material Wood" });
  const chooser = page.waitForEvent("filechooser");
  await wood.getByRole("button", { name: "Choose base color texture" }).click();
  await (await chooser).setFiles(WOOD);
  await expect(wood.getByText("wood-basecolor.png")).toBeVisible();
  expect((await sceneFacts(page, assetId)).materials.find((entry) => entry.material === "Wood")).toEqual({
    material: "Wood",
    slots: [{ slot: "baseColor", state: "set", path: "wood-basecolor.png", overridden: true }],
  });
  await page.screenshot({ path: `${SHOTS}files-texture-assigned.png` });

  await wood.getByRole("button", { name: "Use the file's base color texture" }).click();
  await expect(wood.getByRole("button", { name: "Choose base color texture" })).toBeVisible();
  await page.keyboard.press("Escape");

  await drop(page, VIEW, [{ name: WOOD.name, bytes: [...WOOD.buffer] }]);
  await expect(page.getByText("No texture is missing.")).toBeVisible();
});

test("shows a missing texture struck through and fills it with an image dropped on the view", async ({ page }) => {
  await page.goto("/");
  const composition = JSON.stringify({
    version: 1,
    model: "crate.fbx",
    materials: { Wood: { baseColor: "Textures/crate_wood.png" } },
  });
  await drop(page, "section.empty", [
    { name: "crate.fbx", sample: "crate.fbx" },
    { name: "crate.arcue", text: composition },
  ]);
  const assetId = await readyAsset(page, "crate.fbx");
  await expect(page.getByRole("button", { name: "Asset info" })).toHaveClass(/has-alert/);
  await page.getByRole("button", { name: "Asset info" }).click();
  const wood = page.getByRole("region", { name: "Material Wood" });
  const missing = wood.getByRole("button", { name: "Base color: crate_wood.png, not found" });
  await expect(missing).toContainText("Textures/crate_wood.png");
  await expect(missing.locator(".nm")).toHaveCSS("text-decoration-line", "line-through");
  await page.screenshot({ path: `${SHOTS}files-texture-missing.png` });
  await page.keyboard.press("Escape");

  await drop(page, VIEW, [{ name: WOOD.name, bytes: [...WOOD.buffer] }]);
  await expect(page.getByText("wood-basecolor.png on base color")).toBeVisible();
  await expect
    .poll(async () => (await sceneFacts(page, assetId)).materials.find((entry) => entry.material === "Wood"))
    .toEqual({
      material: "Wood",
      slots: [{ slot: "baseColor", state: "set", path: "wood-basecolor.png", overridden: true }],
    });
  await expect(page.getByRole("button", { name: "Asset info" })).not.toHaveClass(/has-alert/);
});
