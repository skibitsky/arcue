import type { Material, RegionAnchor, SceneDescription, SurfaceAnchor } from "@arcue/scene";
import type { Viewport } from "@arcue/viewport";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

interface AssetSession {
  assetId: string;
  viewport: Viewport | null;
  state: { get(): { viewportReady: boolean; scene: SceneDescription | null } };
  time: { get(): { seconds: number; playing: boolean } };
  currentFrame(): number;
  setPlaying(playing: boolean): void;
}

interface ViewportWindow extends Window {
  arcue: {
    store: { activeSession(): AssetSession | null; session(id: string): AssetSession | null };
    openSample(id: string): Promise<string>;
  };
  viewportDraws: WeakMap<object, number>;
  viewportFixture: {
    viewport: Viewport;
    pin: SurfaceAnchor | null;
    region: RegionAnchor | null;
    hover: SurfaceAnchor | null;
  };
}

async function openFixture(page: Page, kind: "sides" | "cutout"): Promise<void> {
  await page.goto("/?sample=pebble-golem");
  await expect(page.locator(".arcue-vp-canvas")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as ViewportWindow).arcue.store.activeSession()?.state.get().viewportReady),
    )
    .toBe(true);
  await page.evaluate(async (kind) => {
    const state = window as unknown as ViewportWindow;
    const session = state.arcue.store.activeSession();
    const viewport = session?.viewport;
    const source = session?.state.get().scene;
    const template = source?.meshes[0];
    if (!source || !template || !viewport) throw new Error("The sample is not ready.");
    const material: Material = {
      name: "Surface",
      baseColor: [0.6, 0.6, 0.6, 1],
      baseColorTexture: null,
      metallic: 0,
      roughness: 0.8,
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
    const makeMesh = (name: string, z: number, foreground: boolean) => {
      const positions = Float32Array.of(-1, -1, z, 1, -1, z, 0, 1, z, 2, -1, z, 3, -1, z, 2.5, 1, z);
      const indices =
        foreground && kind === "sides" ? Uint32Array.of(0, 2, 1, 3, 5, 4) : Uint32Array.of(0, 1, 2, 3, 4, 5);
      return {
        ...template,
        name,
        geometryName: name,
        positions,
        restPositions: positions.slice(),
        indices,
        normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        sourceVertex: Uint32Array.of(0, 1, 2, 3, 4, 5),
        sourceVertexCount: 6,
        uvs: [],
        colors: null,
        skeleton: null,
        bindMatrix: null,
        joints: null,
        weights: null,
        skinWeights: null,
        morphTargets: [],
        groups: [
          { start: 0, triangleCount: 1, material: foreground ? 0 : 2 },
          { start: 1, triangleCount: 1, material: foreground ? 1 : 2 },
        ],
      };
    };
    const scene = {
      ...source,
      nodes: ["Front", "Behind"].map((name, index) => ({
        name,
        path: name,
        parent: -1,
        kind: "mesh" as const,
        mesh: index,
        translation: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0, 1] as [number, number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      })),
      meshes: [makeMesh("Front", 0.5, true), makeMesh("Behind", 0, false)],
      materials: [
        kind === "cutout"
          ? {
              ...material,
              alphaMode: "mask" as const,
              baseColor: [0.6, 0.6, 0.6, 0] as [number, number, number, number],
            }
          : material,
        { ...material, doubleSided: true },
        material,
      ],
      parts: ["Front", "Behind"].map((name, index) => ({
        id: name,
        name,
        node: index,
        role: "model" as const,
        levels: [{ level: 0, meshes: [index] }],
      })),
      textures: [],
      skeletons: [],
      clips: [],
      bounds: { min: [-1, -1, 0] as [number, number, number], max: [3, 1, 0.5] as [number, number, number] },
    };
    await viewport.setScene(scene);
    viewport.setCamera({ position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fov: 45 });
    viewport.setTool("comment");
    state.viewportFixture = { viewport, pin: null, region: null, hover: null };
    viewport.on("pinPlaced", ({ anchor }) => {
      state.viewportFixture.pin = anchor;
    });
    viewport.on("regionPainted", ({ anchor }) => {
      state.viewportFixture.region = anchor;
    });
    viewport.on("hover", ({ anchor }) => {
      state.viewportFixture.hover = anchor;
    });
  }, kind);
}

test("pinning and painting pass through an invisible single-sided foreground face", async ({ page }) => {
  await openFixture(page, "sides");
  const canvas = page.locator(".arcue-vp-canvas");
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("No canvas bounds.");
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ViewportWindow).viewportFixture.pin?.mesh))
    .toBe("Behind");
  await page.keyboard.press("Escape");
  await page.mouse.move(rect.x + rect.width / 2 - 10, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 10, rect.y + rect.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ViewportWindow).viewportFixture.region?.mesh))
    .toBe("Behind");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as ViewportWindow).viewportFixture.viewport.screenPosition({
          kind: "surface",
          mesh: "Front",
          vertices: [0, 2, 1],
          weights: [0.25, 0.5, 0.25],
        })?.visible,
    ),
  ).toBe(false);
});

test("switching cutout display modes refreshes picking at the same camera and pose", async ({ page }) => {
  await openFixture(page, "cutout");
  const result = await page.evaluate(() => {
    const viewport = (window as unknown as ViewportWindow).viewportFixture.viewport;
    const anchor: SurfaceAnchor = { kind: "surface", mesh: "Behind", vertices: [0, 1, 2], weights: [0.25, 0.25, 0.5] };
    const lit = viewport.screenPosition(anchor)?.visible;
    viewport.setDisplayMode("clay");
    const clay = viewport.screenPosition(anchor)?.visible;
    viewport.setDisplayMode("lit");
    return { lit, clay, litAgain: viewport.screenPosition(anchor)?.visible };
  });
  expect(result).toEqual({ lit: true, clay: false, litAgain: true });
});

test("hidden animated tabs freeze without drawing and resume while allowing screenshots", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as ViewportWindow;
    state.viewportDraws = new WeakMap();
    const prototype = WebGL2RenderingContext.prototype;
    const drawArrays = prototype.drawArrays;
    const drawElements = prototype.drawElements;
    prototype.drawArrays = function (...args) {
      state.viewportDraws.set(this.canvas, (state.viewportDraws.get(this.canvas) ?? 0) + 1);
      return drawArrays.apply(this, args);
    };
    prototype.drawElements = function (...args) {
      state.viewportDraws.set(this.canvas, (state.viewportDraws.get(this.canvas) ?? 0) + 1);
      return drawElements.apply(this, args);
    };
  });
  await page.goto("/?sample=pebble-golem&clip=Armature%7CWalk&frame=5");
  await expect(page.getByRole("img", { name: /^Frame \d+ of 30$/ })).toBeVisible();
  const assetId = await page.evaluate(() => {
    const session = (window as unknown as ViewportWindow).arcue.store.activeSession();
    if (!session) throw new Error("No golem session.");
    session.setPlaying(true);
    return session.assetId;
  });
  await expect
    .poll(() =>
      page.evaluate((id) => (window as unknown as ViewportWindow).arcue.store.session(id)?.currentFrame(), assetId),
    )
    .not.toBe(5);
  await page.evaluate(() => (window as unknown as ViewportWindow).arcue.openSample("blob"));
  await expect(page.getByRole("tab", { name: "blob.fbx", exact: true })).toHaveAttribute("aria-selected", "true");
  const hidden = page.locator("[hidden] .arcue-vp-canvas");
  const sample = () =>
    page.evaluate((id) => {
      const state = window as unknown as ViewportWindow;
      const canvas = document.querySelector("[hidden] .arcue-vp-canvas");
      if (!canvas) throw new Error("The first tab is not hidden.");
      return { ...state.arcue.store.session(id)?.time.get(), draws: state.viewportDraws.get(canvas) ?? 0 };
    }, assetId);
  await expect(hidden).toHaveCount(1);
  const before = await sample();
  await page.waitForTimeout(300);
  expect(await sample()).toEqual(before);
  expect(before.playing).toBe(true);
  const screenshot = await page.evaluate(async (id) => {
    const viewport = (window as unknown as ViewportWindow).arcue.store.session(id)?.viewport;
    if (!viewport) throw new Error("No hidden viewport.");
    const png = await viewport.screenshot({ width: 320, height: 180 });
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(png)], { type: "image/png" }));
    return [bitmap.width, bitmap.height];
  }, assetId);
  expect(screenshot).toEqual([320, 180]);
  const afterScreenshot = await sample();
  await page.waitForTimeout(200);
  expect(await sample()).toEqual(afterScreenshot);
  await page.getByRole("tab", { name: "pebble-golem.fbx", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((id) => (window as unknown as ViewportWindow).arcue.store.session(id)?.time.get().seconds, assetId),
    )
    .not.toBe(before.seconds);
});
