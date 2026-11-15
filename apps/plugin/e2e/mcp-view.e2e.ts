import { execFile } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_VIEW_META_KEY, MCP_VIEW_URI, roundDataSchema } from "@arcue/protocol";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { McpUiHostCapabilities, McpUiResourceMeta } from "@modelcontextprotocol/ext-apps";
import type { Frame, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { build } from "vite";
import type { HostEvent } from "./mcp-host";

interface ViewProbe {
  arcueWindow?: {
    store: { activeSession(): { state: { get(): { viewportReady: boolean; summary: { path: string } } } } | null };
  };
}

const BUILT = fileURLToPath(new URL("../dist/plugins/arcue/skills/arcue/scripts", import.meta.url));
const SAMPLE = fileURLToPath(new URL("../../../samples/stone-striker.fbx", import.meta.url));
const HOST = fileURLToPath(new URL("./mcp-host.ts", import.meta.url));
const WALK = "StoneResonatorRig|Walk";
const CAPABILITIES: McpUiHostCapabilities = {
  serverTools: {},
  message: { text: {}, image: {} },
  updateModelContext: { text: {}, image: {} },
};

let temp: string;
let scripts: string;
let project: string;
let data: string;
let env: Record<string, string>;
let client: Client;
let hostScript: string;
let viewHtml: string;
const events: HostEvent[] = [];

function arcue(...args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(process.execPath, [join(scripts, "arcue.js"), ...args], { env }, (_, stdout, stderr) =>
      resolve(`${stdout}${stderr}`),
    );
  });
}

/** The policy the MCP Apps spec has a host set for a view, from the domains its resource asks for. */
function contentSecurityPolicy(csp: McpUiResourceMeta["csp"] = {}): string {
  const resources = (csp.resourceDomains ?? []).join(" ");
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline' ${resources}`,
    `style-src 'self' 'unsafe-inline' ${resources}`,
    `connect-src 'self' ${(csp.connectDomains ?? []).join(" ")}`,
    `img-src 'self' data: ${resources}`,
    `font-src 'self' ${resources}`,
    `media-src 'self' data: ${resources}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

async function callTool(name: string, args: Record<string, unknown>) {
  return client.callTool({ name, arguments: args });
}

/** A conversation's page that renders views, as an app that shows MCP Apps does. */
async function conversation(page: Page): Promise<void> {
  await page.exposeFunction("hostCallTool", callTool);
  await page.exposeFunction("hostEvent", (event: HostEvent) => {
    events.push(event);
  });
  await page.setContent(
    `<!doctype html><html><head><style>body{margin:0;padding:24px;background:#faf9f5}iframe{border:0;width:100%;display:block;margin-bottom:24px}iframe[data-mode=fullscreen]{position:fixed;inset:0;height:100vh!important;margin:0;z-index:9}</style></head><body><script>${hostScript}</script></body></html>`,
  );
}

/** Shows `open_model`'s result in a new view, and returns the view's frame. */
async function showView(page: Page, id: string, args: Record<string, unknown>): Promise<Frame> {
  const result = await callTool("open_model", args);
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  expect(result._meta?.[MCP_VIEW_META_KEY]).toMatchObject({ path: expect.stringContaining("stone-striker.fbx") });
  await page.evaluate(
    ({ id, html, capabilities, input, result }) =>
      window.startView({
        id,
        html,
        capabilities,
        context: {
          theme: "light",
          displayMode: "inline",
          availableDisplayModes: ["inline", "fullscreen"],
          platform: "desktop",
          containerDimensions: { maxHeight: 900 },
        },
        input,
        result,
      }),
    { id, html: viewHtml, capabilities: CAPABILITIES, input: args, result },
  );
  const frame = await (await page.$(`#${id}`))?.contentFrame();
  if (!frame) throw new Error(`The view ${id} has no frame.`);
  return frame;
}

/** Waits until the view's 3D view shows its active model. */
function ready(frame: Frame): Promise<void> {
  const shows = () =>
    frame
      .evaluate(() => {
        const state = (window as unknown as ViewProbe).arcueWindow?.store.activeSession()?.state.get();
        return state?.viewportReady === true;
      })
      .catch(() => false);
  return expect.poll(shows, { timeout: 60_000, intervals: [200] }).toBe(true);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-mcp-e2e-")));
  scripts = join(temp, "plugin", "scripts");
  cpSync(BUILT, scripts, { recursive: true });
  project = join(temp, "project");
  mkdirSync(join(project, ".git"), { recursive: true });
  copyFileSync(SAMPLE, join(project, "stone-striker.fbx"));
  data = join(temp, "data");
  const sessions = ["ARCUE_VIEW", "CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID"];
  env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      const [name, value] = entry;
      return value !== undefined && !sessions.includes(name);
    }),
  );
  env.ARCUE_USER_DATA = data;

  const built = await build({
    configFile: false,
    logLevel: "silent",
    build: { write: false, lib: { entry: HOST, formats: ["iife"], name: "host" } },
  });
  const outputs = (Array.isArray(built) ? built : [built]) as { output: { type: string; code?: string }[] }[];
  hostScript = outputs[0]?.output.find((file) => file.type === "chunk")?.code ?? "";

  client = new Client(
    { name: "test-host", version: "1.0.0" },
    { capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } } },
  );
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(scripts, "arcue.js"), "mcp", "--view", "conversation"],
      env,
      cwd: project,
      stderr: "inherit",
    }),
  );
  const resource = (await client.readResource({ uri: MCP_VIEW_URI })).contents[0];
  if (!resource || !("text" in resource)) throw new Error("The view's resource has no page.");
  const csp = (resource._meta?.ui as McpUiResourceMeta | undefined)?.csp;
  viewHtml = resource.text.replace(
    "<head>",
    `<head><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(csp)}">`,
  );
});

test.beforeEach(() => {
  events.length = 0;
});

test.afterAll(async () => {
  await client?.close();
  await arcue("stop");
  rmSync(temp, { recursive: true, force: true });
});

test("shows the model in the conversation, and sends its comments to the chat", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  await conversation(page);
  const frame = await showView(page, "first", { path: "stone-striker.fbx", clip: WALK, frame: 12 });
  const view = page.frameLocator("#first");
  await ready(frame);
  await expect(view.getByRole("img", { name: "Frame 12 of 60" })).toBeVisible();
  await expect(view.getByRole("button", { name: /Send to chat/ })).toBeHidden();

  await view.getByRole("button", { name: "Open full screen" }).click();
  await expect(page.locator("#first")).toHaveAttribute("data-mode", "fullscreen");
  await page.setViewportSize({ width: 700, height: 800 });
  const scrolls = () =>
    frame.evaluate(() => {
      const workspace = document.querySelector(".mcp-view");
      return workspace !== null && getComputedStyle(workspace).overflowY === "auto";
    });
  expect(await scrolls()).toBe(true);
  await view.getByRole("button", { name: "Comment", exact: true }).click();
  const rect = await view.locator("canvas").first().boundingBox();
  if (!rect) throw new Error("The 3D view has no box.");
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height * 0.48);
  const commentBox = view.getByRole("form", { name: "Comment 1" });
  await commentBox.getByRole("textbox", { name: "Comment text" }).fill("Round the shoulder plate.");
  await page.keyboard.press("Enter");
  await expect(commentBox).toBeHidden();
  await view.getByRole("button", { name: /Send to chat/ }).click();
  await expect(view.getByText("Sent 1 comment")).toBeVisible();

  const messages = events.filter((event) => event.kind === "message");
  expect(messages).toHaveLength(1);
  const posted = JSON.stringify(messages[0]?.params);
  expect(posted).toContain("Round the shoulder plate.");
  expect(posted).toContain('"type":"image"');
  const round = join(project, ".arcue", "reviews", "stone-striker.fbx", "rounds", "round-1");
  const saved = roundDataSchema.parse(JSON.parse(readFileSync(join(round, "round.json"), "utf8")));
  expect(saved.comments.map((comment) => comment.text)).toEqual(["Round the shoulder plate."]);
  expect(problems).toEqual([]);
});

test("gives the model to a later view, and takes it back when asked", async ({ page }) => {
  await conversation(page);
  const first = await showView(page, "first", { path: "stone-striker.fbx", frame: 12 });
  await ready(first);
  const second = await showView(page, "second", { path: "stone-striker.fbx", clip: WALK, frame: 30 });
  await ready(second);
  await expect(page.frameLocator("#second").getByRole("img", { name: "Frame 30 of 60" })).toBeVisible();
  const earlier = page.frameLocator("#first");
  await expect(earlier.getByText("stone-striker.fbx is open in a later view.")).toBeVisible();

  await earlier.getByRole("button", { name: "Show here" }).click();
  await expect(earlier.getByText("stone-striker.fbx is open in a later view.")).toBeHidden();
  await ready(first);
  await expect(page.frameLocator("#second").getByText("stone-striker.fbx is open in a later view.")).toBeVisible();
});
