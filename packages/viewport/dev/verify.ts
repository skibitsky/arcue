import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SurfaceAnchor } from "@arcue/scene";
import type { Page } from "playwright";
import { chromium } from "playwright";
import { createServer } from "vite";
import type { Harness } from "./main";

/**
 * Checks the viewport in headless Chromium against the dev harness and saves screenshots to dev/out.
 * Run with `pnpm --filter @arcue/viewport verify`; pass --software to render with SwiftShader instead of the GPU.
 */

declare global {
  interface Window {
    harness?: Harness;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const software = process.argv.includes("--software");
mkdirSync(out, { recursive: true });

const results: { check: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ check: name, ok, detail: text });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${text ? `  ${text}` : ""}`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(120);
  const path = join(out, `${name}.png`);
  await page.screenshot({ path });
  console.log(`      screenshot ${path}`);
}

async function viewOrigin(page: Page): Promise<{ left: number; top: number }> {
  return page.evaluate(() => {
    const rect = document.getElementById("view")?.getBoundingClientRect();
    return { left: rect?.left ?? 0, top: rect?.top ?? 0 };
  });
}

async function draws(page: Page): Promise<number> {
  return page.evaluate(() => window.harness?.draws() ?? 0);
}

/** Screen position of the triangle of a mesh nearest a rest point, through the public screenPosition. */
async function meshPoint(
  page: Page,
  meshName: string,
  target: [number, number, number],
  weights: [number, number, number] = [1 / 3, 1 / 3, 1 / 3],
) {
  return page.evaluate(
    ({ name, point, corner }) => {
      const harness = window.harness;
      if (!harness) throw new Error("no harness");
      const node = harness.scene.nodes.find((candidate) => candidate.name === name && candidate.mesh !== null);
      const mesh = node?.mesh === null || !node ? undefined : harness.scene.meshes[node.mesh];
      if (!mesh || !node) throw new Error(`no mesh ${name}`);
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let triangle = 0; triangle < mesh.indices.length / 3; triangle++) {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let k = 0; k < 3; k++) {
          const source = mesh.sourceVertex[mesh.indices[triangle * 3 + k] ?? 0] ?? 0;
          x += (mesh.restPositions[source * 3] ?? 0) / 3;
          y += (mesh.restPositions[source * 3 + 1] ?? 0) / 3;
          z += (mesh.restPositions[source * 3 + 2] ?? 0) / 3;
        }
        const distance = (x - point[0]) ** 2 + (y - point[1]) ** 2 + (z - point[2]) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = triangle;
        }
      }
      const vertices = [0, 1, 2].map((k) => mesh.sourceVertex[mesh.indices[best * 3 + k] ?? 0] ?? 0) as [
        number,
        number,
        number,
      ];
      const anchor = { kind: "surface" as const, mesh: node.path, vertices, weights: corner };
      return { anchor, position: harness.viewport.screenPosition(anchor) };
    },
    { name: meshName, point: target, corner: weights },
  );
}

function bodyPoint(page: Page, target: [number, number, number]) {
  return meshPoint(page, "CreatureBody", target);
}

type Origin = { left: number; top: number };

/**
 * Steps a clip through frames with a pin on screen and checks that the pin rides its surface: it moves, its element
 * sits at screenPosition, and the ID pass under it is its own triangle at every frame.
 */
async function followPin(
  page: Page,
  origin: Origin,
  pin: SurfaceAnchor,
  clip: string,
  frames: number[],
  shotName: string,
): Promise<void> {
  const follow: {
    frame: number;
    x: number;
    y: number;
    pinElement: { x: number; y: number } | null;
    hover: SurfaceAnchor | null;
  }[] = [];
  await page.evaluate((name) => window.harness?.viewport.setClip(name), clip);
  const fps = await page.evaluate((name) => window.harness?.scene.clips.find((c) => c.name === name)?.fps ?? 30, clip);
  for (const frame of frames) {
    await page.evaluate((seconds) => window.harness?.viewport.setTime(seconds), frame / fps);
    await page.waitForTimeout(150);
    const position = await page.evaluate((anchor) => window.harness?.viewport.screenPosition(anchor) ?? null, pin);
    const pinElement = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>(".arcue-vp-pin");
      const match = element?.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
      return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    });
    await shot(page, `${shotName}-${String(frame).padStart(2, "0")}`);
    const overlays = await page.evaluate(() => window.harness?.overlays ?? []);
    await page.evaluate(() => window.harness?.viewport.setOverlays([]));
    await page.mouse.move(origin.left + (position?.x ?? 0) + 0.5, origin.top + (position?.y ?? 0) + 0.5);
    await page.waitForTimeout(200);
    const hover = await page.evaluate(() => window.harness?.events.hover.at(-1) ?? null);
    await page.evaluate((list) => window.harness?.viewport.setOverlays(list), overlays);
    follow.push({ frame, x: position?.x ?? Number.NaN, y: position?.y ?? Number.NaN, pinElement, hover });
  }
  const moved = follow.some((entry) => Math.hypot(entry.x - (follow[0]?.x ?? 0), entry.y - (follow[0]?.y ?? 0)) > 5);
  check(
    `the pin moves with the surface across frames of ${clip}`,
    moved,
    follow.map(({ frame, x, y }) => ({ frame, x: Math.round(x), y: Math.round(y) })),
  );
  const onSurface = follow.every(
    (entry) => entry.hover?.vertices.some((vertex) => pin.vertices.includes(vertex)) ?? false,
  );
  check(`the ID pass under the pin's screen point is the pin's own surface at every frame of ${clip}`, onSurface);
  const elementsAgree = follow.every(
    (entry) =>
      entry.pinElement !== null && Math.hypot(entry.pinElement.x - entry.x, entry.pinElement.y - entry.y) < 1.5,
  );
  check(`the pin element sits at screenPosition in ${clip}`, elementsAgree);
}

function save(name: string, base64: string): void {
  const path = join(out, `${name}.png`);
  writeFileSync(path, Buffer.from(base64, "base64"));
  console.log(`      screenshot ${path}`);
}

const SHOT = { width: 800, height: 600 };

/** Loads sample FBX files through the FBX importer and checks that skinning, morphs and textures render. */
async function sampleChecks(page: Page, origin: Origin): Promise<void> {
  await page.evaluate(() => window.harness?.loadSample("pebble-golem"));
  const golem = await page.evaluate(async (size) => {
    const harness = window.harness;
    if (!harness) throw new Error("no harness");
    const scene = harness.scene;
    const camera = harness.viewport.getCamera();
    await harness.viewport.setScene(null);
    const background = await harness.screenshotBase64({ ...size, camera });
    await harness.showScene(scene);
    harness.viewport.setCamera(camera);
    const at = (frame: number) =>
      harness.screenshotBase64({ ...size, camera, time: { kind: "frame", clip: "Armature|Walk", frame } });
    const first = await at(0);
    const later = await at(8);
    harness.viewport.setDisplayMode("clay");
    const clay = await at(0);
    harness.viewport.setDisplayMode("lit");
    return {
      first,
      later,
      modelPixels: await harness.modelPixels(first, background),
      moved: await harness.changedShare(first, later),
      spread: await harness.albedoSpread(first, clay, background),
    };
  }, SHOT);
  save("20-golem-walk-00", golem.first);
  save("21-golem-walk-08", golem.later);
  const area = SHOT.width * SHOT.height;
  check("an imported skinned model renders", golem.modelPixels > area * 0.02, {
    modelShare: golem.modelPixels / area,
  });
  check("skinning moves the imported model between frames of Armature|Walk", golem.moved > 0.003, {
    changedShare: golem.moved,
  });

  const viewShot = async () => {
    await page.waitForTimeout(150);
    const box = await page.locator("#view").boundingBox();
    return (await page.screenshot(box ? { clip: box } : {})).toString("base64");
  };
  const modelShot = () =>
    page.evaluate(
      (size) => window.harness?.screenshotBase64({ ...size, camera: window.harness.viewport.getCamera() }) ?? "",
      SHOT,
    );
  const plain = await viewShot();
  const plainShot = await modelShot();
  const golemMesh = await page.evaluate(() => {
    const harness = window.harness;
    const path = harness?.scene.nodes.find((node) => node.mesh === 0)?.path ?? null;
    if (path) harness?.viewport.setHighlight([path]);
    return path;
  });
  const tinted = await viewShot();
  const tintedShot = await modelShot();
  await page.evaluate(() => window.harness?.viewport.setHighlight(null));
  const cleared = await viewShot();
  save("23-golem-highlight", tinted);
  const highlight = await page.evaluate(
    async ({ plain, tinted, cleared, tintedShot, plainShot }) => ({
      tinted: (await window.harness?.changedShare(plain, tinted)) ?? 0,
      cleared: (await window.harness?.changedShare(plain, cleared)) ?? 1,
      screenshot: (await window.harness?.changedShare(plainShot, tintedShot)) ?? 1,
    }),
    { plain, tinted, cleared, tintedShot, plainShot },
  );
  check(
    "setHighlight tints the mesh on screen and null clears it",
    golemMesh !== null && highlight.tinted > 0.01 && highlight.cleared < 0.001,
    highlight,
  );
  check("screenshots leave the highlight out", highlight.screenshot < 0.001, highlight);

  const forearm = await page.evaluate(() => {
    const harness = window.harness;
    const scene = harness?.scene;
    const mesh = scene?.meshes[0];
    const node = scene?.nodes.find((candidate) => candidate.mesh === 0);
    const joints = scene?.skeletons[mesh?.skeleton ?? 0]?.joints ?? [];
    const bone = joints.findIndex((joint) => scene?.nodes[joint]?.name === "Forearm.R");
    const skin = mesh?.skinWeights;
    if (!harness || !mesh || !node || !skin || bone < 0) return null;
    const dominant = (source: number) => {
      let best = -1;
      let weight = 0;
      for (let k = skin.offsets[source] ?? 0; k < (skin.offsets[source + 1] ?? 0); k++) {
        if ((skin.weights[k] ?? 0) > weight) {
          weight = skin.weights[k] ?? 0;
          best = skin.joints[k] ?? -1;
        }
      }
      return best;
    };
    let best: [number, number, number] | null = null;
    let front = Number.NEGATIVE_INFINITY;
    for (let triangle = 0; triangle < mesh.indices.length / 3; triangle++) {
      const sources = [0, 1, 2].map((k) => mesh.sourceVertex[mesh.indices[triangle * 3 + k] ?? 0] ?? 0);
      if (!sources.every((source) => dominant(source) === bone)) continue;
      const z = sources.reduce((sum, source) => sum + (mesh.restPositions[source * 3 + 2] ?? 0), 0);
      if (z > front) {
        front = z;
        best = sources as [number, number, number];
      }
    }
    if (!best) return null;
    const anchor = {
      kind: "surface" as const,
      mesh: node.path,
      vertices: best,
      weights: [0.33, 0.33, 0.34] as [number, number, number],
    };
    harness.setOverlays([{ id: "forearm", number: 1, state: "draft", anchor, selected: false }]);
    return anchor;
  });
  check("the golem's right forearm has a triangle to pin", forearm !== null, forearm);
  if (forearm) await followPin(page, origin, forearm, "Armature|Walk", [0, 8, 15, 23], "22-golem-pin-frame");
  await page.evaluate(() => {
    window.harness?.setOverlays([]);
    window.harness?.viewport.setClip(null);
  });

  const blob = await page.evaluate(async (size) => {
    const harness = window.harness;
    if (!harness) throw new Error("no harness");
    const scene = await harness.loadSample("blob");
    const clip = scene.clips[0];
    if (!clip) return null;
    const weights = clip.tracks.filter((track) => track.property === "weights");
    await harness.showScene({ ...scene, clips: [{ ...clip, tracks: weights }] });
    const camera = harness.viewport.getCamera();
    const shots: string[] = [];
    for (const frame of [0, 8, 15, 23]) {
      shots.push(await harness.screenshotBase64({ ...size, camera, time: { kind: "frame", clip: clip.name, frame } }));
    }
    let change = 0;
    for (const later of shots.slice(1)) change = Math.max(change, await harness.changedShare(shots[0] ?? "", later));
    return { clip: clip.name, weightTracks: weights.length, shots, change };
  }, SHOT);
  for (const [index, base64] of (blob?.shots ?? []).entries()) save(`23-blob-morph-${index}`, base64);
  check(
    "morph targets alone change the imported blob between frames",
    blob !== null && blob.weightTracks > 0 && blob.change > 0.002,
    { clip: blob?.clip, weightTracks: blob?.weightTracks, changedShare: blob?.change },
  );

  const rock = await page.evaluate(async (size) => {
    const harness = window.harness;
    if (!harness) throw new Error("no harness");
    const scene = await harness.loadSample("textured-rock");
    const camera = harness.viewport.getCamera();
    await harness.viewport.setScene(null);
    const background = await harness.screenshotBase64({ ...size, camera });
    await harness.showScene(scene);
    harness.viewport.setCamera(camera);
    const lit = await harness.screenshotBase64({ ...size, camera });
    harness.viewport.setDisplayMode("clay");
    const clay = await harness.screenshotBase64({ ...size, camera });
    harness.viewport.setDisplayMode("lit");
    return {
      textures: scene.textures.length,
      lit,
      clay,
      modelPixels: await harness.modelPixels(lit, background),
      spread: await harness.albedoSpread(lit, clay, background),
      agreement: await harness.textureAgreement(),
    };
  }, SHOT);
  const lods = await page.evaluate(async (size) => {
    const harness = window.harness;
    if (!harness) throw new Error("no harness");
    const plain = harness.scene;
    const { min, max } = plain.bounds;
    const extent = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const camera = {
      position: [center[0], center[1], center[2] + extent * 6] as [number, number, number],
      target: center,
      up: [0, 1, 0] as [number, number, number],
      fov: 35,
    };
    const shoot = () => harness.screenshotBase64({ ...size, camera });
    await harness.viewport.setScene(null);
    const background = await shoot();
    await harness.showScene(plain);
    const single = await shoot();
    const scene = harness.withLods(plain, extent * 1.6);
    await harness.showScene(scene);
    const lod0 = await shoot();
    const view = { hidden: [], shown: [], isolated: null, lod: 0 };
    harness.viewport.setPartView({ ...view, lod: 1 });
    const lod1 = await shoot();
    const collision = scene.parts.find((part) => part.role === "collision")?.id ?? null;
    harness.viewport.setPartView({ ...view, isolated: collision });
    const isolated = await shoot();
    harness.viewport.setPartView(view);
    return {
      lod0,
      lod1,
      isolated,
      parts: scene.parts.map((part) => `${part.id}:${part.role}:${part.levels.length}`),
      sameAsSingle: await harness.changedShare(single, lod0),
      lod1Changed: await harness.changedShare(lod0, lod1),
      lod1Pixels: await harness.modelPixels(lod1, background),
      collisionPixels: await harness.modelPixels(isolated, background),
    };
  }, SHOT);
  save("26-lods-default", lods.lod0);
  save("27-lods-lod1", lods.lod1);
  save("28-lods-collision-isolated", lods.isolated);
  check(
    "only LOD0 of a LOD group renders, and its collision helper stays hidden",
    lods.parts.length === 2 && lods.sameAsSingle < 0.001 && lods.collisionPixels > area * 0.002,
    { parts: lods.parts, sameAsSingle: lods.sameAsSingle, collisionShare: lods.collisionPixels / area },
  );
  check(
    "choosing LOD1 draws the second level in place of LOD0",
    lods.lod1Changed > 0.004 && lods.lod1Pixels > area * 0.002,
    { lod1Changed: lods.lod1Changed, lod1Share: lods.lod1Pixels / area },
  );
  save("24-rock-lit", rock.lit);
  save("25-rock-clay", rock.clay);
  check(
    "an imported texture varies the surface color far more than an untextured material does",
    rock.textures > 0 && rock.modelPixels > area * 0.02 && rock.spread > Math.max(0.08, golem.spread * 2),
    { textured: rock.spread, untextured: golem.spread },
  );
  check(
    "the texture sits on the UVs the right way up",
    rock.agreement.samples > 100 && rock.agreement.correlation > 0.5,
    rock.agreement,
  );
}

/**
 * Composes the modular beetle from its files and checks that the shell attached to the Body bone rides it through
 * the walk: it moves on screen, the Body bone drives it, and it keeps its distance to the bone at every frame.
 */
async function compositionChecks(page: Page): Promise<void> {
  const result = await page.evaluate(async (size) => {
    const harness = window.harness;
    if (!harness) throw new Error("no harness");
    const scene = await harness.loadBeetle();
    const node = scene.nodes.find((candidate) => candidate.path === "beetle-shells.fbx//ShellRound");
    const mesh = node?.mesh === null || !node ? undefined : scene.meshes[node.mesh];
    if (!node || !mesh) return null;
    let top = 0;
    let height = Number.NEGATIVE_INFINITY;
    for (let triangle = 0; triangle < mesh.indices.length / 3; triangle++) {
      const y = [0, 1, 2].reduce((sum, k) => {
        const source = mesh.sourceVertex[mesh.indices[triangle * 3 + k] ?? 0] ?? 0;
        return sum + (mesh.restPositions[source * 3 + 1] ?? 0);
      }, 0);
      if (y > height) {
        height = y;
        top = triangle;
      }
    }
    const vertices = [0, 1, 2].map((k) => mesh.sourceVertex[mesh.indices[top * 3 + k] ?? 0] ?? 0) as [
      number,
      number,
      number,
    ];
    const pin = {
      kind: "surface" as const,
      mesh: node.path,
      vertices,
      weights: [0.34, 0.33, 0.33] as [number, number, number],
    };
    const clip = "Armature|Walk";
    const fps = scene.clips.find((candidate) => candidate.name === clip)?.fps ?? 30;
    harness.viewport.setClip(clip);
    const frames = [];
    for (const frame of [0, 8, 15, 23]) {
      harness.viewport.setTime(frame / fps);
      const context = harness.viewport.computeContext(pin, { kind: "frame", clip, frame });
      const body = context.joints.find((joint) => joint.name === "Body")?.position ?? null;
      const posed = context.centroid?.posed ?? null;
      frames.push({
        frame,
        bone: context.bones[0]?.name ?? null,
        posed,
        reach: posed && body ? Math.hypot(posed[0] - body[0], posed[1] - body[1], posed[2] - body[2]) : null,
        screen: harness.viewport.screenPosition(pin),
      });
    }
    const camera = harness.viewport.getCamera();
    const shot = await harness.screenshotBase64({ ...size, camera, time: { kind: "frame", clip, frame: 8 } });
    harness.viewport.setClip(null);
    return {
      parts: scene.parts.map((part) => `${part.id}${part.hiddenByDefault ? " hidden" : ""}`),
      warnings: scene.source.warnings.length,
      frames,
      shot,
    };
  }, SHOT);
  if (result) save("29-beetle-walk-08", result.shot);
  check("the modular beetle composes from its three files without warnings", result?.warnings === 0, result?.parts);
  const frames = result?.frames ?? [];
  const first = frames[0];
  const travel = Math.max(
    0,
    ...frames.map((entry) =>
      entry.posed && first?.posed
        ? Math.hypot(entry.posed[0] - first.posed[0], entry.posed[1] - first.posed[1], entry.posed[2] - first.posed[2])
        : 0,
    ),
  );
  const reaches = frames.map((entry) => entry.reach ?? Number.NaN);
  const screenTravel = Math.max(
    0,
    ...frames.map((entry) =>
      entry.screen && first?.screen ? Math.hypot(entry.screen.x - first.screen.x, entry.screen.y - first.screen.y) : 0,
    ),
  );
  check(
    "the shell attached to the Body bone moves with it through Armature|Walk",
    frames.length === 4 &&
      frames.every((entry) => entry.bone === "Body") &&
      travel > 0.005 &&
      screenTravel > 2 &&
      Math.max(...reaches) - Math.min(...reaches) < 0.0005,
    {
      travel: Math.round(travel * 10000) / 10000,
      screenTravel: Math.round(screenTravel),
      reaches: reaches.map((reach) => Math.round(reach * 10000) / 10000),
    },
  );
}

async function main(): Promise<void> {
  const server = await createServer({
    configFile: join(here, "vite.config.ts"),
    server: { port: 0 },
    logLevel: "error",
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a URL.");
  const browser = await chromium.launch({
    headless: true,
    args: software ? [] : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    await page.goto(url);
    await page.waitForSelector("body[data-ready=true]", { timeout: 30000 });
    const renderer = await page.evaluate(() => {
      const gl = document.querySelector("canvas")?.getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
    });
    console.log(`renderer: ${renderer}`);
    await shot(page, "01-lit");

    await page.waitForTimeout(400);
    const idleStart = await draws(page);
    await page.waitForTimeout(2000);
    check(
      "an idle view draws nothing",
      (await draws(page)) === idleStart,
      `${(await draws(page)) - idleStart} draws in 2 s`,
    );

    await page.evaluate(() => window.harness?.viewport.setDisplayMode("clay"));
    await shot(page, "02-clay");
    await page.evaluate(() => {
      window.harness?.viewport.setDisplayMode("wireframe");
      window.harness?.viewport.setSkeletonVisible(true);
    });
    await shot(page, "03-wireframe-skeleton");
    await page.evaluate(() => {
      window.harness?.viewport.setDisplayMode("lit");
      window.harness?.viewport.setSkeletonVisible(false);
    });

    const origin = await viewOrigin(page);
    const chest = await bodyPoint(page, [0, 0.8, 0.2]);
    check("screenPosition finds a visible front point", chest.position?.visible === true, chest.position);
    await page.evaluate(() => window.harness?.viewport.setTool("comment"));
    await page.mouse.move(origin.left + (chest.position?.x ?? 0), origin.top + (chest.position?.y ?? 0));
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => (window.harness?.events.pinPlaced.length ?? 0) > 0, null, { timeout: 3000 });
    const pin = await page.evaluate(() => window.harness?.events.pinPlaced[0]);
    const shared = pin ? pin.vertices.filter((vertex) => chest.anchor.vertices.includes(vertex)).length : 0;
    check("a click with the Comment tool places a pin on the clicked triangle", shared >= 1, pin);
    const weightsOk = pin
      ? Math.abs(pin.weights[0] + pin.weights[1] + pin.weights[2] - 1) < 1e-6 && pin.weights.every((w) => w >= 0)
      : false;
    check("the pin's barycentric weights are valid", weightsOk, pin?.weights);
    await shot(page, "04-pin");
    if (!pin) throw new Error("no pin");

    await followPin(page, origin, pin, "Creature|Sway", [0, 15, 30, 45], "05-pin-frame");

    await page.evaluate(() => {
      window.harness?.viewport.setTime(0);
      window.harness?.viewport.setPlaying(true);
    });
    await page.waitForTimeout(500);
    const playStart = await page.evaluate(() => ({
      events: window.harness?.events.time.length ?? 0,
      now: performance.now(),
    }));
    await page.waitForTimeout(3000);
    const playEnd = await page.evaluate(() => ({
      events: window.harness?.events.time.length ?? 0,
      now: performance.now(),
    }));
    const fps = ((playEnd.events - playStart.events) * 1000) / (playEnd.now - playStart.now);
    check("playback holds 60 fps", fps >= 58, `${fps.toFixed(1)} frames per second`);
    await shot(page, "06-playing");
    const playingPin = await page.evaluate((anchor) => window.harness?.viewport.screenPosition(anchor) ?? null, pin);
    check("the pin stays on screen during playback", playingPin !== null, playingPin);
    await page.evaluate(() => window.harness?.viewport.setPlaying(false));
    await page.waitForTimeout(500);
    const pausedStart = await draws(page);
    await page.waitForTimeout(1500);
    check(
      "a paused view with pins draws nothing",
      (await draws(page)) === pausedStart,
      `${(await draws(page)) - pausedStart} draws`,
    );

    await page.evaluate(() => window.harness?.viewport.setClip(null));
    const savedCamera = await page.evaluate(() => window.harness?.viewport.getCamera());
    await page.evaluate(() =>
      window.harness?.viewport.setCamera({ position: [0.3, 1.1, -3.4], target: [0, 0.8, 0], up: [0, 1, 0], fov: 30 }),
    );
    await page.waitForTimeout(300);
    const fromBehind = await page.evaluate((anchor) => window.harness?.viewport.screenPosition(anchor) ?? null, pin);
    const fadedBehind = await page.evaluate(
      (id) => document.querySelector(`[data-overlay-id="${id}"]`)?.classList.contains("is-hidden-surface") ?? false,
      (await page.evaluate(() => window.harness?.overlays[0]?.id)) ?? "",
    );
    check("a pin fades when its surface faces away", fromBehind?.visible === false && fadedBehind, fromBehind);
    await shot(page, "05b-pin-faces-away");
    await page.evaluate(() =>
      window.harness?.viewport.setCamera({
        position: [0.075, 1.34, 3],
        target: [0.075, 1.34, 0],
        up: [0, 1, 0],
        fov: 20,
      }),
    );
    await page.waitForTimeout(200);
    const behindEye = await bodyPoint(page, [0.075, 1.34, 0.14]);
    await page.evaluate((anchor) => {
      const harness = window.harness;
      if (!harness) return;
      harness.setOverlays([
        ...harness.overlays,
        { id: "behind-eye", number: null, state: "draft", anchor, selected: false },
      ]);
    }, behindEye.anchor);
    await page.waitForTimeout(300);
    const fadedEye = await page.evaluate(
      () => document.querySelector('[data-overlay-id="behind-eye"]')?.classList.contains("is-hidden-surface") ?? false,
    );
    check(
      "a pin fades when something in front hides its surface",
      behindEye.position !== null && behindEye.position.visible === false && fadedEye,
      behindEye.position,
    );
    await shot(page, "05c-pin-hidden-by-eye");
    await page.evaluate((camera) => {
      if (camera) window.harness?.viewport.setCamera(camera);
      window.harness?.setOverlays([]);
    }, savedCamera);
    await page.waitForTimeout(150);
    const from = await bodyPoint(page, [-0.08, 0.5, 0.2]);
    const to = await bodyPoint(page, [0.08, 0.62, 0.2]);
    const drag = async (a: typeof from, b: typeof from, modifier: "Shift" | "Control" | null) => {
      if (modifier) await page.keyboard.down(modifier);
      await page.mouse.move(origin.left + (a.position?.x ?? 0), origin.top + (a.position?.y ?? 0));
      await page.mouse.down();
      for (let step = 1; step <= 12; step++) {
        const t = step / 12;
        await page.mouse.move(
          origin.left + (a.position?.x ?? 0) + ((b.position?.x ?? 0) - (a.position?.x ?? 0)) * t,
          origin.top + (a.position?.y ?? 0) + ((b.position?.y ?? 0) - (a.position?.y ?? 0)) * t,
        );
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      if (modifier) await page.keyboard.up(modifier);
      await page.waitForTimeout(150);
    };
    await page.evaluate(() => window.harness?.viewport.setBrushSize(18));
    await drag(from, to, null);
    const painted = await page.evaluate(() => window.harness?.events.regionPainted.at(-1) ?? null);
    const count = (ranges: [number, number][] | undefined) =>
      (ranges ?? []).reduce((sum, [a, b]) => sum + b - a + 1, 0);
    const firstCount = count(painted?.anchor?.triangles);
    check(
      "a drag with the Comment tool paints a new region",
      painted?.overlayId === null && firstCount > 10,
      `${firstCount} triangles`,
    );
    const facing = await page.evaluate((anchor) => {
      const harness = window.harness;
      const mesh = harness?.scene.meshes[0];
      if (!harness || !mesh || !anchor) return { front: 0, back: 0 };
      const camera = harness.viewport.getCamera();
      let front = 0;
      let back = 0;
      for (const [start, end] of anchor.triangles) {
        for (let triangle = start; triangle <= end; triangle++) {
          const p = [0, 1, 2].map((k) => {
            const source = mesh.sourceVertex[mesh.indices[triangle * 3 + k] ?? 0] ?? 0;
            return [0, 1, 2].map((axis) => mesh.restPositions[source * 3 + axis] ?? 0);
          });
          const [a, b, c] = p as [number[], number[], number[]];
          const e1 = [0, 1, 2].map((axis) => (b[axis] ?? 0) - (a[axis] ?? 0));
          const e2 = [0, 1, 2].map((axis) => (c[axis] ?? 0) - (a[axis] ?? 0));
          const n = [
            (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
            (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
            (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
          ];
          const toCamera = [0, 1, 2].map((axis) => (camera.position[axis] ?? 0) - (a[axis] ?? 0));
          if (
            (n[0] ?? 0) * (toCamera[0] ?? 0) + (n[1] ?? 0) * (toCamera[1] ?? 0) + (n[2] ?? 0) * (toCamera[2] ?? 0) >
            0
          )
            front++;
          else back++;
        }
      }
      return { front, back };
    }, painted?.anchor ?? null);
    check("the brush paints only surface that faces the camera", facing.back === 0 && facing.front > 0, facing);
    await shot(page, "07-region");

    const up = await bodyPoint(page, [0, 0.38, 0.21]);
    await drag(to, up, "Shift");
    const added = await page.evaluate(() => window.harness?.events.regionPainted.at(-1) ?? null);
    const addedCount = count(added?.anchor?.triangles);
    check(
      "Shift adds to the selected region",
      added?.overlayId !== null && addedCount > firstCount,
      `${firstCount} -> ${addedCount}`,
    );
    await drag(from, to, "Control");
    const erased = await page.evaluate(() => window.harness?.events.regionPainted.at(-1) ?? null);
    const erasedCount = count(erased?.anchor?.triangles);
    check(
      "Ctrl erases from the selected region",
      erased?.overlayId !== null && erasedCount < addedCount,
      `${addedCount} -> ${erasedCount}`,
    );
    await shot(page, "08-region-edited");

    await page.evaluate(() => window.harness?.viewport.setTool("view"));
    await page.evaluate((anchor) => {
      const harness = window.harness;
      if (!harness) return;
      harness.setOverlays([...harness.overlays, { id: "pin", number: null, state: "sent", anchor, selected: false }]);
    }, pin);
    const png = await page.evaluate((options) => window.harness?.screenshotBase64(options) ?? "", {
      width: 960,
      height: 540,
      overlays: await page.evaluate(() => window.harness?.overlays ?? []),
    });
    const bytes = Buffer.from(png, "base64");
    writeFileSync(join(out, "09-api-screenshot.png"), bytes);
    const signature = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    check("screenshot returns PNG bytes at the requested size", signature && width === 960 && height === 540, {
      width,
      height,
    });
    console.log(`      screenshot ${join(out, "09-api-screenshot.png")}`);
    const framePng = await page.evaluate(() =>
      window.harness?.screenshotBase64({
        width: 640,
        height: 640,
        time: { kind: "frame", clip: "Creature|Sway", frame: 15 },
        camera: { position: [1.6, 1.4, 2.4], target: [0, 0.8, 0], up: [0, 1, 0], fov: 30 },
        overlays: window.harness.overlays,
      }),
    );
    writeFileSync(join(out, "10-api-screenshot-frame-15.png"), Buffer.from(framePng ?? "", "base64"));
    console.log(`      screenshot ${join(out, "10-api-screenshot-frame-15.png")}`);
    await shot(page, "11-after-screenshots");

    const context = await page.evaluate(
      (anchor) => window.harness?.viewport.computeContext(anchor, { kind: "frame", clip: "Creature|Sway", frame: 15 }),
      pin,
    );
    const names = ["Root", "Spine1", "Spine2", "Neck", "Head"];
    check(
      "computeContext gives bones, joints, centroid and a view label",
      !!context &&
        context.bones.length > 0 &&
        context.bones.every((bone) => names.includes(bone.name)) &&
        context.joints.length === context.bones.length &&
        context.centroid !== null &&
        context.viewLabel.length > 0,
      context,
    );
    const regionContext = await page.evaluate(
      (anchor) => (anchor ? window.harness?.viewport.computeContext(anchor, { kind: "none" }) : null),
      erased?.anchor ?? null,
    );
    check("computeContext covers a region", (regionContext?.vertexCount ?? 0) > 0, regionContext);

    const before = await page.evaluate(() => {
      const harness = window.harness;
      harness?.viewport.setClip("Creature|Sway");
      harness?.viewport.setTime(1.2);
      return harness?.viewport.getCamera();
    });
    await page.evaluate(() => window.harness?.viewport.setScene(window.harness.buildCreature(true)));
    const reload = await page.evaluate(() => ({
      camera: window.harness?.viewport.getCamera(),
      time: window.harness?.events.time.at(-1),
    }));
    check(
      "reloading keeps the camera, the clip and the time",
      JSON.stringify(reload.camera) === JSON.stringify(before) && Math.abs((reload.time?.seconds ?? 0) - 1.2) < 1e-6,
      reload.time,
    );
    await page.evaluate(() => {
      const harness = window.harness;
      if (!harness) return Promise.resolve();
      const scene = harness.buildCreature(false);
      scene.clips = scene.clips.filter((clip) => clip.name !== "Creature|Sway");
      return harness.viewport.setScene(scene);
    });
    const restAfter = await page.evaluate(() => window.harness?.events.time.at(-1));
    check("reloading without the clip shows the rest pose", restAfter?.seconds === 0, restAfter);
    await shot(page, "12-reloaded-without-clip");

    const cameraEvents = await page.evaluate(() => window.harness?.events.cameraChange ?? 0);
    await page.mouse.move(origin.left + 300, origin.top + 300);
    await page.mouse.down();
    await page.mouse.move(origin.left + 420, origin.top + 330, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const afterOrbit = await page.evaluate(() => window.harness?.events.cameraChange ?? 0);
    check(
      "orbiting with the View tool sends cameraChange",
      afterOrbit > cameraEvents,
      `${afterOrbit - cameraEvents} events`,
    );
    await shot(page, "13-orbited");

    const camera = () => page.evaluate(() => window.harness?.viewport.getCamera());
    const gesture = async (button: "left" | "middle" | "right", modifier: "Shift" | "Alt" | null) => {
      const before = await camera();
      if (modifier) await page.keyboard.down(modifier);
      await page.mouse.move(origin.left + 900, origin.top + 300);
      await page.mouse.down({ button });
      await page.mouse.move(origin.left + 960, origin.top + 340, { steps: 8 });
      await page.mouse.up({ button });
      if (modifier) await page.keyboard.up(modifier);
      await page.waitForTimeout(700);
      const after = await camera();
      const moved = (a: number[] | undefined, b: number[] | undefined) =>
        Math.hypot(...[0, 1, 2].map((axis) => (a?.[axis] ?? 0) - (b?.[axis] ?? 0))) > 1e-4;
      return { position: moved(before?.position, after?.position), target: moved(before?.target, after?.target) };
    };
    const right = await gesture("right", null);
    check("right-drag orbits", right.position && !right.target, right);
    const shiftRight = await gesture("right", "Shift");
    check("Shift with right-drag pans", shiftRight.target, shiftRight);
    const middle = await gesture("middle", null);
    check("middle-drag pans", middle.target, middle);
    await page.evaluate(() => window.harness?.viewport.setTool("comment"));
    const paintsBefore = await page.evaluate(() => window.harness?.events.regionPainted.length ?? 0);
    const alt = await gesture("left", "Alt");
    const paintsAfter = await page.evaluate(() => window.harness?.events.regionPainted.length ?? 0);
    check(
      "Alt-drag orbits with the Comment tool instead of painting",
      alt.position && paintsAfter === paintsBefore,
      alt,
    );
    await page.evaluate(() => window.harness?.viewport.setTool("view"));
    const beforeZoom = await camera();
    await page.mouse.move(origin.left + 640, origin.top + 380);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(700);
    const afterZoom = await camera();
    const distance = (anchor: typeof beforeZoom) =>
      Math.hypot(...[0, 1, 2].map((axis) => (anchor?.position[axis] ?? 0) - (anchor?.target[axis] ?? 0)));
    check("the wheel zooms", distance(afterZoom) < distance(beforeZoom), {
      before: distance(beforeZoom),
      after: distance(afterZoom),
    });
    await page.evaluate(() => window.harness?.viewport.frame(null, { animate: true }));
    await page.waitForTimeout(800);
    await shot(page, "14-framed");
    await page.evaluate(() => window.harness?.viewport.setScene(window.harness.scene));
    await page.evaluate(() => {
      const harness = window.harness;
      harness?.viewport.setClip(null);
      harness?.setOverlays([]);
      harness?.viewport.setTool("comment");
      harness?.viewport.setCamera({ position: [0, 0.16, 2.2], target: [0, 0.16, 0], up: [0, 1, 0], fov: 20 });
    });
    await page.waitForTimeout(300);
    const clickAt = async (position: { x: number; y: number } | null) => {
      const count = await page.evaluate(() => window.harness?.events.pinPlaced.length ?? 0);
      await page.mouse.click(origin.left + (position?.x ?? 0), origin.top + (position?.y ?? 0));
      await page.waitForFunction((n) => (window.harness?.events.pinPlaced.length ?? 0) > n, count, { timeout: 3000 });
      return page.evaluate(() => window.harness?.events.pinPlaced.at(-1)?.mesh ?? null);
    };
    const badgeCorner = await meshPoint(page, "Badge", [0.03, 0.13, 0.27], [0.94, 0.03, 0.03]);
    const badgeCenter = await meshPoint(page, "Badge", [0.03, 0.13, 0.27], [0.5, 0, 0.5]);
    await shot(page, "15-badge-cutout");
    const throughCorner = await clickAt(badgeCorner.position);
    const onCenter = await clickAt(badgeCenter.position);
    check(
      "a click passes through a cut-out texel and stops on an opaque one",
      throughCorner === "CreatureBody" && onCenter === badgeCenter.anchor.mesh,
      { corner: throughCorner, center: onCenter },
    );
    await page.evaluate(() => {
      window.harness?.setOverlays([]);
      window.harness?.viewport.setTool("view");
      window.harness?.viewport.setCamera({
        position: [1.2, 0.16, -0.2],
        target: [0, 0.16, 0.27],
        up: [0, 1, 0],
        fov: 20,
      });
    });
    await page.waitForTimeout(300);
    const badgeBack = await page.evaluate(
      (anchor) => window.harness?.viewport.screenPosition(anchor) ?? null,
      badgeCenter.anchor,
    );
    check("a pin on a double-sided surface stays visible from its back", badgeBack?.visible === true, badgeBack);
    await shot(page, "16-badge-from-behind");
    await page.evaluate(() =>
      window.harness?.viewport.setCamera({ position: [0.1, 1.35, 2.5], target: [0, 1.34, 0], up: [0, 1, 0], fov: 20 }),
    );
    await page.waitForTimeout(300);
    const mirroredEye = await meshPoint(page, "EyeLeft", [0.075, 1.34, 0.195]);
    check("a pin on a mirrored node faces the camera that sees it", mirroredEye.position?.visible === true, {
      position: mirroredEye.position,
    });

    await page.evaluate((anchor) => {
      window.harness?.setOverlays([
        { id: "composing", number: 7, state: "sent", anchor, selected: true, pending: true },
      ]);
    }, mirroredEye.anchor);
    await page.waitForTimeout(200);
    const pendingPin = await page.evaluate(() => {
      const element = document.querySelector('[data-overlay-id="composing"]');
      return {
        pending: element?.classList.contains("is-pending") ?? false,
        sent: element?.classList.contains("is-sent") ?? true,
        text: element?.textContent ?? null,
      };
    });
    check(
      "a pending pin is drawn in the feedback blue without a number",
      pendingPin.pending && !pendingPin.sent && pendingPin.text === "",
      pendingPin,
    );
    await shot(page, "17-pending-pin");
    await page.evaluate(() => window.harness?.setOverlays([]));

    const beforeLoss = await page.evaluate(() => window.harness?.screenshotBase64({ width: 480, height: 480 }));
    await page.evaluate(() => {
      const context = document.querySelector("canvas")?.getContext("webgl2");
      const lose = context?.getExtension("WEBGL_lose_context");
      Object.assign(window, { loseContext: lose });
      lose?.loseContext();
    });
    await page.waitForTimeout(400);
    const lost = await page.evaluate(() => window.harness?.events.contextLost ?? 0);
    await page.evaluate(() => {
      const lose = (window as unknown as { loseContext?: WEBGL_lose_context }).loseContext;
      lose?.restoreContext();
    });
    await page.waitForTimeout(800);
    const restored = await page.evaluate(() => window.harness?.events.contextRestored ?? 0);
    const afterRestore = await page.evaluate(() => window.harness?.screenshotBase64({ width: 480, height: 480 }));
    const difference = await page.evaluate(
      async ([first, second]) => {
        const pixels = async (base64: string) => {
          const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d");
          context?.drawImage(bitmap, 0, 0);
          return context?.getImageData(0, 0, bitmap.width, bitmap.height).data ?? new Uint8ClampedArray();
        };
        const a = await pixels(first ?? "");
        const b = await pixels(second ?? "");
        let total = 0;
        for (let i = 0; i < a.length; i++) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
        return a.length === b.length && a.length > 0 ? total / a.length : Number.POSITIVE_INFINITY;
      },
      [beforeLoss, afterRestore],
    );
    await shot(page, "18-after-context-restore");
    check(
      "after a lost and restored context the view renders as before",
      lost === 1 && restored === 1 && difference < 0.5,
      { lost, restored, meanDifference: difference },
    );
    await sampleChecks(page, origin);
    await compositionChecks(page);
    check("the page logged no errors", errors.length === 0, errors.slice(0, 5));
  } finally {
    await browser.close();
    await server.close();
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${out}`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
