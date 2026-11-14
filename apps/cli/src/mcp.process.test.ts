import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { connectToCore } from "@arcue/platform-node";
import { writeLastCoreFile } from "@arcue/platform-node/test";
import type { CommandInput, CoreClient } from "@arcue/protocol";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { outsideSessions, sessionView } from "./session-view";
import { registerPid } from "./test-pids";

const processRun = inject("processRun");
const crate = fileURLToPath(new URL("../../../samples/crate.fbx", import.meta.url));
const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const camera: CommandInput<"comment.create">["camera"] = {
  position: [0, 1, 3],
  target: [0, 0.5, 0],
  up: [0, 1, 0],
  fov: 30,
};

let userData: string;
let work: string;
let client: Client;
let transport: StdioClientTransport;

interface ToolResult {
  isError?: boolean;
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
}

/** The test's environment for arcue: its own data folder, and no agent session's variables. */
function env(): NodeJS.ProcessEnv {
  return outsideSessions({ ...process.env, ARCUE_USER_DATA: userData });
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (typeof address !== "object" || !address) throw new Error("No port was free.");
  return address.port;
}

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

const texts = (result: ToolResult) => result.content.flatMap((part) => (part.type === "text" ? [part.text] : []));
const images = (result: ToolResult) => result.content.filter((part) => part.type === "image");

/** The serve core's client, after it loaded the asset, with the version comments are made on. */
async function served(assetId: string): Promise<{ core: CoreClient; version: string; close: () => void }> {
  const connection = await connectToCore(userData, "serve");
  if (!connection) throw new Error("No Arcue in the browser answers.");
  registerPid(processRun.folder, connection.info.pid);
  for (;;) {
    const asset = (await connection.client.query("asset.list", {})).assets.find((entry) => entry.assetId === assetId);
    if (asset?.version) return { core: connection.client, version: asset.version, close: () => connection.close() };
    if (asset?.status === "failed") throw new Error(asset.error ?? "The asset failed.");
    await sleep(100);
  }
}

beforeEach(async () => {
  userData = mkdtempSync(join(processRun.folder, "data-"));
  work = mkdtempSync(join(processRun.folder, "work-"));
  copyFileSync(crate, join(work, "crate.fbx"));
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [processRun.arcue, "mcp", "--view", "review"],
    env: env() as Record<string, string>,
    cwd: work,
    stderr: "inherit",
  });
  client = new Client({ name: "test", version: "1" });
  await client.connect(transport);
  if (transport.pid !== null) registerPid(processRun.folder, transport.pid);
});

afterEach(async () => {
  await client.close();
  const connection = await connectToCore(userData, "serve").catch(() => null);
  if (connection) {
    registerPid(processRun.folder, connection.info.pid);
    connection.close();
  }
  spawnSync(process.execPath, [processRun.arcue, "stop"], { env: env(), timeout: 60_000 });
  rmSync(userData, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe("arcue mcp", () => {
  it("starts Arcue in the browser, then reads, sends, resolves and reopens a model's comments", async () => {
    const port = await freePort();
    writeLastCoreFile(userData, "serve", `http://localhost:${port}`);
    const page = `http://localhost:${port}/?view=${sessionView({}, "review")}`;

    const opened = await call("open_model", { path: "crate.fbx" });

    expect(opened.isError, texts(opened).join("\n")).toBeFalsy();
    expect(texts(opened)).toEqual([
      `Started Arcue in the browser. This session's page: ${page}\nArcue holds crate.fbx as a1 until this session's page opens: ${page}`,
    ]);
    const { core, version, close } = await served("a1");
    try {
      const context = { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" };
      const base = { assetId: "a1", version, time: { kind: "none" as const }, target: null, camera, context };
      const { commentId: first } = await core.execute("comment.create", {
        ...base,
        text: "The lid sits too high.",
        screenshot: png,
      });
      const { commentId: second } = await core.execute("comment.create", {
        ...base,
        text: "Darken the bands.",
        screenshot: null,
      });

      const models = await call("list_models", {});
      expect(texts(models)[0]).toBe("1 model is open in Arcue.");
      expect(JSON.parse(texts(models)[1] ?? "[]")).toMatchObject([
        { status: "ready", comments: { draft: 2, sent: 0, resolved: 0 } },
      ]);

      const listed = await call("get_comments", { path: join(work, "crate.fbx") });
      expect(texts(listed)[0]).toBe("crate.fbx has 2 comments: 2 draft.");
      expect(JSON.parse(texts(listed)[1] ?? "[]")).toMatchObject([
        { id: first, status: "draft", text: "The lid sits too high.", screenshot: true },
        { id: second, status: "draft", text: "Darken the bands.", screenshot: false },
      ]);
      expect(images(listed)).toEqual([
        { type: "image", mimeType: "image/png", data: Buffer.from(png).toString("base64") },
      ]);

      const sent = await call("send_round", { path: "crate.fbx" });
      expect(sent.isError, texts(sent).join("\n")).toBeFalsy();
      expect(texts(sent)[0]).toContain("The lid sits too high.");
      expect(texts(sent)[0]).toContain("Darken the bands.");
      expect(texts(sent)[1]).toBe("Screenshot of comment 1:");
      expect(images(sent)).toHaveLength(1);
      expect((await core.query("review.get", { assetId: "a1" })).rounds).toMatchObject([
        { number: 1, comments: [first, second] },
      ]);
      expect(texts(await call("send_round", { path: "crate.fbx" }))).toEqual([
        "crate.fbx has no comments in its queue.",
      ]);

      expect(texts(await call("resolve_comment", { path: "crate.fbx", comment: first }))).toEqual([
        `Resolved ${first} on crate.fbx.`,
      ]);
      expect(
        texts(await call("reopen_comment", { path: "crate.fbx", comment: first, text: "Still too high." })),
      ).toEqual([`Reopened ${first} on crate.fbx. It waits in the queue with the follow-up.`]);
      const after = await call("get_comments", { path: "crate.fbx", status: ["draft"], screenshots: false });
      expect(texts(after)[0]).toBe("crate.fbx has 2 comments: 1 draft, 1 sent. 1 listed.");
      expect(JSON.parse(texts(after)[1] ?? "[]")).toMatchObject([
        {
          id: first,
          status: "draft",
          rounds: [1],
          text: "Still too high.",
          earlierMessages: ["The lid sits too high."],
        },
      ]);
      expect(images(after)).toEqual([]);

      const shot = await call("screenshot", { path: "crate.fbx" });
      expect(shot.isError).toBe(true);
      expect(texts(shot)[0]).toContain(`Open this session's page, ${page}, and keep it open, then try again.`);
    } finally {
      close();
    }
  });

  it("inspects a model without Arcue running", async () => {
    const result = await call("inspect_model", { path: "crate.fbx", json: true });

    expect(result.isError, texts(result).join("\n")).toBeFalsy();
    expect(JSON.parse(texts(result)[0] ?? "{}")).toMatchObject({
      file: { name: "crate.fbx" },
      meshes: [{ name: "Crate", triangles: 756 }],
    });
    await expect(connectToCore(userData, "serve")).resolves.toBeNull();
  });

  it("ends when its client closes its input", async () => {
    const child = spawn(process.execPath, [processRun.arcue, "mcp"], {
      env: env(),
      cwd: work,
      stdio: ["pipe", "ignore", "inherit"],
    });
    if (child.pid !== undefined) registerPid(processRun.folder, child.pid);
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    await sleep(500);

    child.stdin?.end();

    const ended = await Promise.race([exited, sleep(3000).then(() => null)]);
    child.kill("SIGKILL");
    expect(ended).toEqual({ code: 0, signal: null });
  });
});
