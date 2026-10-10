import { fileURLToPath } from "node:url";
import type { CoreClient } from "@arcue/protocol";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

interface ArcueGlobal {
  client: CoreClient;
}

const SHOTS = fileURLToPath(new URL("../screenshots/", import.meta.url));
const WALK_12 = "/?sample=pebble-golem&clip=Armature%7CWalk&frame=12";

interface PixelStats {
  /** Share of pixels that differ clearly from the top-left corner, which shows the backdrop. */
  covered: number;
  /** Share of pixels where red leads green and blue clearly, as the feedback orange does. */
  feedback: number;
}

async function pixelStats(page: Page, png: Buffer): Promise<PixelStats> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context.");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const [r0 = 0, g0 = 0, b0 = 0] = data;
    let covered = 0;
    let feedback = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) > 60) covered++;
      if (r - b > 50 && r - g > 30) feedback++;
    }
    const total = data.length / 4;
    return { covered: covered / total, feedback: feedback / total };
  }, png.toString("base64"));
}

async function difference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const decode = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No 2D context.");
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [a, b] = await Promise.all([decode(first), decode(second)]);
      let changed = 0;
      for (let index = 0; index < a.length; index += 4) {
        const delta =
          Math.abs((a[index] ?? 0) - (b[index] ?? 0)) +
          Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0)) +
          Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0));
        if (delta > 30) changed++;
      }
      return changed / (a.length / 4);
    },
    [before.toString("base64"), after.toString("base64")] as const,
  );
}

async function openWalk(page: Page, url = WALK_12): Promise<Locator> {
  await page.goto(url);
  await expect(page.getByRole("img", { name: /^Frame \d+ of 30$/ })).toBeVisible();
  const canvas = page.locator(".arcue-vp-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await pixelStats(page, await canvas.screenshot())).covered).toBeGreaterThan(0.05);
  return canvas;
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("The element has no box.");
  return rect;
}

async function placePin(page: Page, canvas: Locator, text: string): Promise<void> {
  const rect = await box(canvas);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height * 0.48);
  const pending = page.locator(".arcue-vp-pin.is-pending .arcue-vp-pin-dot");
  await expect(pending).toBeVisible();
  const commentBox = page.getByRole("form", { name: "Comment 1" });
  await expect(commentBox).toBeVisible();
  await commentBox.getByRole("textbox", { name: "Comment text" }).fill(text);
  await page.keyboard.press("Enter");
  await expect(commentBox).toBeHidden();
  await expect(pending).toHaveCount(0);
  await expect(page.locator(".arcue-vp-pin-dot", { hasText: /^1$/ })).toBeVisible();
}

async function paintRegion(page: Page, canvas: Locator, text: string, number: number): Promise<void> {
  const rect = await box(canvas);
  const y = rect.y + rect.height * 0.62;
  await page.mouse.move(rect.x + rect.width * 0.45, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++)
    await page.mouse.move(rect.x + rect.width * (0.45 + step * 0.008), y, { steps: 2 });
  await page.mouse.up();
  const commentBox = page.getByRole("form", { name: `Comment ${number}` });
  await expect(commentBox).toBeVisible();
  await commentBox.getByRole("textbox", { name: "Comment text" }).fill(text);
  await page.keyboard.press("Enter");
  await expect(commentBox).toBeHidden();
}

/** Waits for finite animations, such as a new queue item's flash, so screenshots show the resting state. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

function feedbackColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--feedback)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

test("the canvas renders the model and orbiting changes the view", async ({ page }) => {
  const canvas = await openWalk(page);
  const before = await canvas.screenshot();
  const stats = await pixelStats(page, before);
  expect(stats.covered).toBeGreaterThan(0.05);

  const rect = await box(canvas);
  await page.mouse.move(rect.x + rect.width * 0.3, rect.y + rect.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.45, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => difference(page, before, await canvas.screenshot())).toBeGreaterThan(0.02);
});

test("playing a clip advances the thin red playhead", async ({ page }) => {
  await openWalk(page);
  const head = page.locator(".tl-head");
  const style = await head.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { color: computed.borderLeftColor, width: Number.parseFloat(computed.borderLeftWidth) };
  });
  expect(style.color).toBe("rgb(255, 75, 69)");
  expect(style.width).toBeLessThanOrEqual(2);

  const start = (await box(head)).x;
  await page.locator(".timeline").getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await box(head)).x, { timeout: 5000 }).not.toBe(start);
  await page.locator(".timeline").getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("img", { name: /^Frame \d+ of 30$/ })).not.toHaveAccessibleName("Frame 12 of 30");
});

test("a click pins, a drag paints in the feedback color, and a copied round names the clip, frame and mesh", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const canvas = await openWalk(page);
  await page.getByRole("button", { name: "Comment", exact: true }).click();

  await placePin(page, canvas, "Round the shoulder plate.");
  await page.mouse.move(5, 5);
  const feedback = await feedbackColor(page);
  const pin = page.locator(".arcue-vp-pin-dot", { hasText: /^1$/ });
  await expect.poll(() => pin.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(feedback);

  const beforePaint = await pixelStats(page, await canvas.screenshot());
  await paintRegion(page, canvas, "Thicken the belly.", 2);
  const afterPaint = await pixelStats(page, await canvas.screenshot());
  expect(afterPaint.feedback - beforePaint.feedback).toBeGreaterThan(0.002);

  const panel = page.getByRole("complementary", { name: "Comments" });
  await expect(panel.getByRole("button", { name: "Comment 1: Round the shoulder plate." })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Comment 2: Thicken the belly." })).toBeVisible();
  await page.mouse.move(5, 5);
  await settle(page);
  await page.screenshot({ path: `${SHOTS}walk-two-comments.png` });

  const mesh = await page.evaluate(async () => {
    const { client } = (window as unknown as { arcue: ArcueGlobal }).arcue;
    const { assets } = await client.query("asset.list", {});
    const asset = assets[0];
    if (!asset) throw new Error("No asset.");
    const { comments } = await client.query("review.get", { assetId: asset.assetId });
    const target = comments[0]?.target;
    return target && "mesh" in target ? target.mesh : null;
  });
  expect(mesh).not.toBeNull();

  await page.getByRole("button", { name: /Copy prompt/ }).click();
  await expect(page.getByText("Copied 2 comments as round 1")).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('Clip "Walk", frame 12');
  expect(prompt).toContain(`"${mesh}"`);
  expect(prompt).toContain("Round the shoulder plate.");
  await expect(panel.getByRole("list", { name: "Drafts" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Round 1: Round the shoulder plate." })).toBeVisible();
});

test("a deep link opens the view at its frame", async ({ page }) => {
  await openWalk(page);
  await expect(page.getByRole("img", { name: "Frame 12 of 30" })).toBeVisible();
  const head = await box(page.locator(".tl-head"));
  const ruler = await box(page.locator(".tl-ruler"));
  expect((head.x - ruler.x) / ruler.width).toBeCloseTo(12 / 30, 1);
});

test("the gallery lists the samples", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^stone-striker\.fbx/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^pebble-golem/ })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}gallery.png` });
});

test("a lane drag selects a range in the feedback color, and a resolved comment turns olive", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWalk(page);
  const lane = await box(page.locator(".tl-lane"));
  const xAt = (frame: number) => lane.x + (lane.width * frame) / 30;
  await page.mouse.move(xAt(8), lane.y + lane.height / 2);
  await page.mouse.down();
  await page.mouse.move(xAt(20), lane.y + lane.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".range-chip")).toContainText("f8–20");
  const range = page.locator(".tl-range");
  const feedback = await feedbackColor(page);
  const rangeStyle = await range.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { fill: computed.backgroundColor, edges: computed.boxShadow };
  });
  expect(rangeStyle.fill).toBe("rgba(221, 101, 61, 0.16)");
  expect(rangeStyle.edges).toContain(feedback);
  await page.screenshot({ path: `${SHOTS}timeline-range.png` });

  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.locator(".arcue-vp-canvas").click({ position: { x: 560, y: 320 } });
  const commentBox = page.getByRole("form", { name: "Comment 1" });
  await commentBox.getByRole("textbox", { name: "Comment text" }).fill("Slow the step down.");
  await page.keyboard.press("Enter");
  await expect(commentBox).toBeHidden();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Copy prompt/ }).click();
  await expect(page.getByText("Copied 1 comment as round 1")).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('Clip "Walk", frames 8–20');

  const panel = page.getByRole("complementary", { name: "Comments" });
  await panel.getByRole("button", { name: "Mark resolved" }).click();
  await panel.getByRole("button", { name: "Round 1: Slow the step down." }).click();
  const resolved = page.locator(".arcue-vp-pin.is-resolved .arcue-vp-pin-dot");
  await expect(resolved).toBeVisible();
  const dim = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--feedback-resolved)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await page.mouse.move(5, 5);
  await expect.poll(() => resolved.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(dim);
  await expect(page.locator(".mk.is-resolved")).toBeVisible();
  await expect(page.getByText("Copied 1 comment as round 1")).toBeHidden({ timeout: 10_000 });
  await settle(page);
  await page.screenshot({ path: `${SHOTS}resolved-comment.png` });
});
