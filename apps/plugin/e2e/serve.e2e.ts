import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CoreClient } from "@arcue/protocol";
import { roundDataSchema } from "@arcue/protocol";
import { expect, test } from "@playwright/test";

const ARCUE = fileURLToPath(new URL("../dist/plugins/arcue/skills/arcue/scripts/arcue.js", import.meta.url));
const SAMPLE = fileURLToPath(new URL("../../../samples/stone-striker.fbx", import.meta.url));
const PORT = 4536;
const ADDRESS = `http://localhost:${PORT}`;

let temp: string;
let project: string;
let model: string;
let env: NodeJS.ProcessEnv;
let server: ChildProcess;

function arcue(...args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [ARCUE, ...args], { env }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, out: `${stdout}${stderr}` });
    });
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-plugin-e2e-")));
  project = join(temp, "project");
  mkdirSync(join(project, ".git"), { recursive: true });
  model = join(project, "stone-striker.fbx");
  copyFileSync(SAMPLE, model);
  env = { ...process.env, ARCUE_USER_DATA: join(temp, "data") };
  server = spawn(process.execPath, [ARCUE, "serve", "--port", String(PORT)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("Arcue runs at")) resolve();
    };
    server.stdout?.on("data", onData);
    server.stderr?.on("data", onData);
    server.once("exit", (code) => reject(new Error(`arcue serve exited with ${code}: ${output}`)));
  });
});

test.afterAll(async () => {
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  }
  rmSync(temp, { recursive: true, force: true });
});

test("shows the model arcue open opens, at its clip and frame, and again after a reload", async ({ page }) => {
  await page.goto(ADDRESS);
  await expect(page.getByText("Ask your agent to show you a model")).toBeVisible();

  const opened = await arcue("open", model, "--clip", "StoneResonatorRig|Walk", "--frame", "12");
  expect(opened).toMatchObject({ code: 0, out: expect.stringContaining("Opened") });
  await expect(page.getByRole("tab", { name: "stone-striker.fbx" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Frame 12 of 60" })).toBeVisible();
  expect((await arcue("status")).out).toContain(`Arcue is running in a browser at ${ADDRESS}`);

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { client } = (window as unknown as { arcueWindow: { client: CoreClient } }).arcueWindow;
        const [asset] = (await client.query("asset.list", {})).assets;
        return asset ? (await client.query("viewState.get", { assetId: asset.assetId }))?.frame : null;
      }),
    )
    .toBe(12);
  await page.reload();
  await expect(page.getByRole("img", { name: "Frame 12 of 60" })).toBeVisible();
});

test("saves a review round beside the model, as the desktop app does", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ADDRESS });
  await page.goto(ADDRESS);
  await expect(page.getByRole("img", { name: "Frame 12 of 60" })).toBeVisible();

  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const canvas = page.locator("canvas").first();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("The 3D view has no box.");
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height * 0.48);
  const commentBox = page.getByRole("form", { name: "Comment 1" });
  await commentBox.getByRole("textbox", { name: "Comment text" }).fill("Round the shoulder plate.");
  await page.keyboard.press("Enter");
  await expect(commentBox).toBeHidden();
  await page.getByRole("button", { name: /Copy prompt/ }).click();
  await expect(page.getByText("Copied 1 comment as round 1")).toBeVisible();

  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('Clip "Walk", frame 12');
  const round = join(project, ".arcue", "reviews", "stone-striker.fbx", "rounds", "round-1");
  expect(prompt).toContain(round);
  const data = roundDataSchema.parse(JSON.parse(readFileSync(join(round, "round.json"), "utf8")));
  expect(data.comments.map((comment) => comment.text)).toEqual(["Round the shoulder plate."]);
  expect(readdirSync(round).filter((file) => file.endsWith(".png"))).toHaveLength(1);
});

test("refuses a second server while one runs", async () => {
  expect(await arcue("serve", "--port", String(PORT + 1))).toMatchObject({
    code: 1,
    out: expect.stringContaining(`Arcue is already running at ${ADDRESS}`),
  });
});
