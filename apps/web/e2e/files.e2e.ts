import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import type { CoreClient } from "@arcue/protocol";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

interface ArcueGlobal {
  client: CoreClient;
  store: {
    dropOnView(assetId: string, files: readonly File[], at: { x: number; y: number }): Promise<void>;
  };
  writeComposition(model: string, text: string): Promise<void>;
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

test("adds a model after replacing a pending drop with the same file", async ({ page }) => {
  await page.goto("/?sample=pebble-golem");
  const assetId = await readyAsset(page, "pebble-golem.fbx");
  await page.evaluate(async (id) => {
    const { store } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    const bytes = await (await fetch("samples/crate.fbx")).arrayBuffer();
    for (let drop = 0; drop < 2; drop++) {
      await store.dropOnView(id, [new File([bytes], "RepeatedCrate.fbx")], { x: 100, y: 100 });
    }
  }, assetId);
  await page.getByRole("menu", { name: "Dropped file" }).getByRole("menuitem", { name: "Add to view" }).click();
  await expect.poll(async () => (await sceneFacts(page, assetId)).parts).toContain("RepeatedCrate.fbx//Crate");
});

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
    .toEqual(["beetle-turn.fbx//Armature|Turn", "beetle-turn.fbx"]);
  expect((await sceneFacts(page, assetId)).composition).toBe(
    "/app-data/reviews/samples/pebble-golem.fbx/composition.json",
  );
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
  await group.getByRole("menuitem", { name: "Remove beetle-turn.fbx from the view" }).click();
  await expect(menu.getByRole("group", { name: "beetle-turn.fbx" })).toHaveCount(0);
  expect((await sceneFacts(page, assetId)).clips.map(([name]) => name)).not.toContain("beetle-turn.fbx//Armature|Turn");

  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(async () => (await sceneFacts(page, assetId)).clips.map(([name]) => name))
    .toContain("beetle-turn.fbx//Armature|Turn");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect
    .poll(async () => (await sceneFacts(page, assetId)).clips.map(([name]) => name))
    .not.toContain("beetle-turn.fbx//Armature|Turn");
});

/** Holds each `composition.fileRoles` query the window sends until `release` lets the one at an index through. */
async function holdRoles(page: Page) {
  await page.evaluate(() => {
    const target = window as unknown as { arcue: ArcueGlobal; heldRoles: (() => void)[] };
    const { client } = target.arcue;
    const query = client.query.bind(client);
    target.heldRoles = [];
    client.query = async (name, input) => {
      if (name === "composition.fileRoles") await new Promise<void>((resolve) => target.heldRoles.push(resolve));
      return query(name, input);
    };
  });
  return {
    held: () => page.evaluate(() => (window as unknown as { heldRoles: unknown[] }).heldRoles.length),
    release: (index: number) =>
      page.evaluate((at) => (window as unknown as { heldRoles: (() => void)[] }).heldRoles.splice(at, 1)[0]?.(), index),
  };
}

function fileState(page: Page, path: string) {
  return page.evaluate(async (target) => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    return client.query("asset.inspect", { path: target }).then(
      () => "found",
      (error: { code?: string }) => error.code,
    );
  }, path);
}

async function pickFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const add = page.getByRole("button", { name: "Add file" });
  if (!(await add.isVisible())) await page.getByRole("button", { name: "Asset info" }).click();
  const chooser = page.waitForEvent("filechooser");
  await add.click();
  await (await chooser).setFiles(files);
}

const model = (name: string, source: string) => ({
  name,
  mimeType: "application/octet-stream",
  buffer: readFileSync(sample(source)),
});

/** Drops a sample on the asset's view under another name, without waiting for the drop to finish. */
function startDrop(page: Page, assetId: string, name: string, source: string) {
  return page.evaluate(
    async (drop) => {
      const { store } = (window as unknown as { arcue: ArcueGlobal }).arcue;
      const bytes = await (await fetch(`samples/${drop.source}`)).arrayBuffer();
      void store.dropOnView(drop.assetId, [new File([bytes], drop.name)], { x: 100, y: 100 });
    },
    { assetId, name, source },
  );
}

test("removes the copies of picked files when their question is dismissed", async ({ page }) => {
  await page.goto("/?sample=beetle-turn");
  await readyAsset(page, "beetle-turn.fbx");
  await pickFiles(page, [model("picked-beetle.fbx", "beetle.fbx"), WOOD]);
  const prompt = page.getByRole("menu", { name: "Picked file" });
  await expect(prompt.getByRole("menuitem", { name: "Add as animation" })).toBeVisible();
  await expect(prompt.getByRole("menuitem", { name: "New tab" })).toHaveCount(0);
  expect(await fileState(page, "/samples/picked-beetle.fbx")).toBe("found");
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await expect.poll(() => fileState(page, "/samples/picked-beetle.fbx")).toBe("not-found");
});

test("removes the copy of a picked model the core refuses, so a fixed file of that name takes its place", async ({
  page,
}) => {
  await page.goto("/?sample=beetle-turn");
  const assetId = await readyAsset(page, "beetle-turn.fbx");
  await pickFiles(page, [{ name: "prop.fbx", mimeType: "application/octet-stream", buffer: Buffer.from("not fbx") }]);
  await expect(page.locator('.toast[data-kind="alert"]')).toBeVisible();
  await expect.poll(() => fileState(page, "/samples/prop.fbx")).toBe("not-found");
  await pickFiles(page, [model("prop.fbx", "crate.fbx")]);
  await expect(page.getByText("Added prop.fbx")).toBeVisible();
  await expect.poll(async () => (await sceneFacts(page, assetId)).parts).toContain("prop.fbx//Crate");
});

test("removes a picked file's copy when a drop that was still being read asks in its place", async ({ page }) => {
  await page.goto("/?sample=beetle-turn");
  const assetId = await readyAsset(page, "beetle-turn.fbx");
  const roles = await holdRoles(page);
  await startDrop(page, assetId, "dropped-crate.fbx", "crate.fbx");
  await expect.poll(roles.held).toBe(1);
  await pickFiles(page, [model("picked-beetle.fbx", "beetle.fbx")]);
  await expect.poll(roles.held).toBe(2);
  await roles.release(1);
  const picked = page.getByRole("menu", { name: "Picked file" });
  await expect(picked).toBeVisible();
  await roles.release(0);
  const dropped = page.getByRole("menu", { name: "Dropped file" });
  await expect(dropped).toBeVisible();
  await expect(picked).toHaveCount(0);
  await expect.poll(() => fileState(page, "/samples/picked-beetle.fbx")).toBe("not-found");
  expect(await fileState(page, "/samples/dropped-crate.fbx")).toBe("found");
  await page.keyboard.press("Escape");
  await expect(dropped).toHaveCount(0);
  await expect.poll(() => fileState(page, "/samples/dropped-crate.fbx")).toBe("not-found");
});

test("keeps a picked copy that a drop of the same file uses when the drop's question replaces the pick's", async ({
  page,
}) => {
  await page.goto("/?sample=beetle-turn");
  const assetId = await readyAsset(page, "beetle-turn.fbx");
  const roles = await holdRoles(page);
  await pickFiles(page, [model("shared-beetle.fbx", "beetle.fbx")]);
  await expect.poll(roles.held).toBe(1);
  await startDrop(page, assetId, "shared-beetle.fbx", "beetle.fbx");
  await expect.poll(roles.held).toBe(2);
  await roles.release(0);
  await expect(page.getByRole("menu", { name: "Picked file" })).toBeVisible();
  await roles.release(0);
  const dropped = page.getByRole("menu", { name: "Dropped file" });
  await expect(dropped).toBeVisible();
  await expect(page.getByRole("menu", { name: "Picked file" })).toHaveCount(0);
  await dropped.getByRole("menuitem", { name: "Add to view" }).click();
  await expect
    .poll(async () => (await sceneFacts(page, assetId)).parts.some((part) => part.startsWith("shared-beetle.fbx//")))
    .toBe(true);
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

  await drop(page, VIEW, [{ name: "crate.fbx", sample: "blob.fbx" }]);
  await prompt.getByRole("menuitem", { name: "Add to view" }).click();
  await expect.poll(async () => (await sceneFacts(page, assetId)).parts).toContain("crate-2.fbx//Blob");
  expect((await sceneFacts(page, assetId)).parts).toContain("crate.fbx//Crate");

  const besideGolem = () =>
    page.evaluate(async () => {
      const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
      return client.query("asset.inspect", { path: "/samples/blob.fbx" }).then(
        () => "found",
        (error: { code?: string }) => error.code,
      );
    });
  await drop(page, VIEW, [{ name: "blob.fbx", sample: "blob.fbx" }]);
  await expect(prompt.getByRole("menuitem", { name: "New tab" })).toBeVisible();
  expect(await besideGolem()).toBe("found");
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await expect.poll(besideGolem).toBe("not-found");

  await drop(page, VIEW, [{ name: "blob.fbx", sample: "blob.fbx" }]);
  await page.getByRole("menu", { name: "Dropped file" }).getByRole("menuitem", { name: "New tab" }).click();
  await expect(page.getByRole("tab", { name: "blob.fbx" })).toHaveAttribute("aria-selected", "true");
  expect((await sceneFacts(page, assetId)).parts).not.toContain("blob.fbx//Blob");
  expect(await besideGolem()).toBe("not-found");
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
  await drop(page, "section.empty", [{ name: "crate.fbx", sample: "crate.fbx" }]);
  const assetId = await readyAsset(page, "crate.fbx");
  const composition = JSON.stringify({ version: 1, materials: { Wood: { baseColor: "Textures/crate_wood.png" } } });
  await page.evaluate(
    (text) => (window as unknown as { arcue: ArcueGlobal }).arcue.writeComposition("/files/crate/crate.fbx", text),
    composition,
  );
  await expect(page.locator(".sb-warn")).toContainText("Texture not found: crate_wood.png");
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
  await expect(page.locator(".sb-warn")).toHaveCount(0);
});
