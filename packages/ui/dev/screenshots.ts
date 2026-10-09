import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { chromium } from "playwright";

const base = process.env.HARNESS_URL ?? "http://localhost:5180/";
const mockup = process.env.MOCKUP_URL;
const out = process.argv[2] ?? fileURLToPath(new URL("./screenshots/", import.meta.url));

async function settle(page: Page, ms = 600) {
  await page.waitForTimeout(ms);
}

async function ready(page: Page) {
  await page.waitForSelector(".ws:not([hidden]) .vp-status", { state: "detached", timeout: 10_000 });
  await settle(page);
}

const browser = await chromium.launch();
await mkdir(out, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(`${base}?select=c7`);
await ready(page);
await page.screenshot({ path: `${out}/01-workspace.png` });

await page.getByRole("button", { name: /^Clip:/ }).click();
await settle(page, 300);
await page.screenshot({ path: `${out}/02-clip-menu.png` });
await page.keyboard.press("Escape");

await page.goto(`${base}?clip=${encodeURIComponent("Armature|Idle")}&frame=40`);
await ready(page);
await page.keyboard.press("c");
const viewport = page.locator(".ws:not([hidden]) .viewport");
const box = await viewport.boundingBox();
if (box) await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await settle(page);
await page.keyboard.type("The chest plate sits too low.");
await page.screenshot({ path: `${out}/03-new-comment.png` });
await page.keyboard.press("Enter");
await settle(page, 900);

const lane = page.locator(".ws:not([hidden]) .tl-lane");
const laneBox = await lane.boundingBox();
if (laneBox) {
  await page.mouse.move(laneBox.x + laneBox.width * 0.55, laneBox.y + laneBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(laneBox.x + laneBox.width * 0.7, laneBox.y + laneBox.height / 2, { steps: 6 });
  await page.mouse.up();
}
await settle(page);
await page.screenshot({ path: `${out}/04-idle-key-ticks-and-range.png` });

await page.getByRole("button", { name: "Copy prompt" }).click();
await settle(page, 700);
await page.screenshot({ path: `${out}/05-copy-sheet.png` });
await page.keyboard.press("Escape");
await settle(page);
await page.screenshot({ path: `${out}/06-after-copy-history.png` });

await page.goto(`${base}?empty`);
await settle(page);
await page.screenshot({ path: `${out}/07-empty.png` });

await page.setViewportSize({ width: 720, height: 1100 });
await page.goto(`${base}?select=c9`);
await ready(page);
await page.screenshot({ path: `${out}/08-narrow.png`, fullPage: true });

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}?select=c7`);
await ready(page);
await page.getByRole("button", { name: "Play", exact: true }).focus();
await page.keyboard.press("Tab");
await settle(page, 500);
await page.screenshot({ path: `${out}/09-focus-and-tooltip.png` });

if (mockup) {
  const mockupPage = await context.newPage();
  await mockupPage.goto(mockup, { waitUntil: "domcontentloaded" });
  await settle(mockupPage, 2500);
  await mockupPage.screenshot({ path: `${out}/00-mockup.png` });
}

await browser.close();
if (errors.length > 0) {
  console.error(`Page errors:\n${errors.join("\n")}`);
  process.exitCode = 1;
}
console.log(`Screenshots in ${out}`);
