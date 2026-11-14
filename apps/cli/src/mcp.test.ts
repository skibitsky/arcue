import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { FakeCore, FakeCoreOptions } from "@arcue/platform-node/test";
import { startFakeCore } from "@arcue/platform-node/test";
import type { Comment, ReviewFile } from "@arcue/protocol";
import { ArcueError, BRIDGE_INFO_FILE, SERVE_INFO_FILE } from "@arcue/protocol";
import { Client } from "@modelcontextprotocol/client";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ArcueMcpOptions } from "./mcp";
import { createArcueMcpServer } from "./mcp";

const SERVE_URL = "http://localhost:4530";
const VIEW = "review";
const PAGE = `${SERVE_URL}/?view=${VIEW}`;
const FIRST = "c01k9qv3m4x7r2t8w5y6z0abcde";
const SECOND = "c01k9qv3m4x7r2t8w5y6z0abcdf";
const THIRD = "c01k9qv3m4x7r2t8w5y6z0abcdg";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let temp: string;
let userData: string;
let model: string;
let fakes: FakeCore[];
let clients: Client[];
let starts: number;

beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-mcp-")));
  userData = join(temp, "data");
  model = join(temp, "Hero.fbx");
  writeFileSync(model, "");
  fakes = [];
  clients = [];
  starts = 0;
});

afterEach(async () => {
  await Promise.all(clients.map((client) => client.close()));
  await Promise.all(fakes.map((fake) => fake.close()));
  rmSync(temp, { recursive: true, force: true });
});

async function connect(overrides: Partial<ArcueMcpOptions> = {}): Promise<Client> {
  const server = createArcueMcpServer({
    userData,
    view: VIEW,
    cwd: temp,
    importWorkerEntry: join(temp, "import-worker.js"),
    startServe: async () => {
      starts++;
      throw new Error("Arcue in the browser did not start.");
    },
    version: "test",
    loadTimeoutMs: 2000,
    ...overrides,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

function texts(result: CallToolResult): string[] {
  return result.content.flatMap((block) => (block.type === "text" ? [block.text] : []));
}

function images(result: CallToolResult): string[] {
  return result.content.flatMap((block) => (block.type === "image" ? [block.data] : []));
}

const heroAsset = () => ({
  assetId: "a1",
  path: model,
  name: "Hero.fbx",
  status: "ready",
  version: "v1",
  error: null,
});

async function serve(answers: FakeCoreOptions["answers"] = {}): Promise<FakeCore> {
  const core = await startFakeCore(userData, {
    file: SERVE_INFO_FILE,
    kind: "serve",
    locks: 1,
    url: SERVE_URL,
    answers: { "asset.list": () => ({ assets: [heroAsset()] }), ...answers },
  });
  fakes.push(core);
  return core;
}

function comment(id: string, overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    text: "The thumb tip bends outward.",
    status: "sent",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    madeOnVersion: "v1",
    time: { kind: "frame", clip: "Armature|Charge", clipDisplayName: "Charge", frame: 34 },
    target: { kind: "surface", mesh: "Hero/Body", vertices: [812, 813, 830], weights: [0.2, 0.3, 0.5] },
    anchorVersion: "v1",
    anchorRestPositions: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
    ],
    camera: { position: [0.6, 1, 0.4], target: [0.4, 1.05, 0.07], up: [0, 1, 0], fov: 35 },
    context: {
      vertexCount: 3,
      bones: [{ name: "Right_ThumbDistal", share: 0.64 }],
      centroid: { rest: [0.4, 1, 0], posed: [0.4, 1.1, 0.1] },
      joints: [],
      viewLabel: "palm side",
      screenshot: `rounds/round-1/${id}.png`,
    },
    anchorState: "exact",
    followUps: [],
    rounds: [1],
    reopenedFrom: null,
    ...overrides,
  };
}

const walk = { name: "Armature|Walk", displayName: "Walk", frameCount: 31 };
const charge = { name: "Armature|Charge", displayName: "Charge", frameCount: 61 };
const scene = () => ({ version: "v1", scene: { clips: [walk, charge] } });

const viewState = (clip: string | null) => ({
  camera: comment(FIRST).camera,
  clip,
  frame: 3,
  range: null,
  display: { mode: "lit", skeleton: false },
  parts: { hidden: [], shown: [], isolated: null, lod: 0 },
  outlineOpen: false,
});

const requestsNamed = (core: FakeCore, name: string) =>
  core.requests.filter((request) => request.name === name).map((request) => request.input);

function review(comments: Comment[], rounds: ReviewFile["rounds"] = []): ReviewFile {
  return {
    schemaVersion: 1,
    asset: { path: "Hero.fbx" },
    versions: [],
    comments,
    queue: comments.filter((entry) => entry.status === "draft").map((entry) => entry.id),
    rounds,
    revision: 1,
  };
}

describe("arcue mcp", () => {
  it("lists its tools", async () => {
    const client = await connect();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_comments",
      "inspect_model",
      "list_models",
      "open_model",
      "reopen_comment",
      "resolve_comment",
      "screenshot",
      "send_round",
    ]);
    expect(tools.find((tool) => tool.name === "list_models")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((tool) => tool.name === "get_comments")?.annotations?.readOnlyHint).toBe(false);
  });

  describe("open_model", () => {
    it("shows a model in the session's view at a clip it names by its display name, and names the page", async () => {
      const core = await serve({
        "scene.get": scene,
        "asset.openInView": () => ({ assetId: "a1", shown: "held" }),
      });
      const client = await connect();

      const result = await call(client, "open_model", { path: "Hero.fbx", clip: "Walk", frame: 12 });

      expect(result.isError).toBeFalsy();
      expect(texts(result)).toEqual([
        `Arcue holds Hero.fbx at clip "Armature|Walk", frame 12 as a1 until this session's page opens: ${PAGE}`,
      ]);
      expect(requestsNamed(core, "asset.openInView")).toEqual([
        { path: model, view: VIEW, move: false, clip: "Armature|Walk", frame: 12 },
      ]);
    });

    it("refuses a clip or frame the model does not have, naming its clips", async () => {
      const core = await serve({ "scene.get": scene });
      const client = await connect();

      const clip = await call(client, "open_model", { path: model, clip: "Run" });
      const frame = await call(client, "open_model", { path: model, clip: "Armature|Walk", frame: 31 });

      expect(clip.isError).toBe(true);
      expect(texts(clip)).toEqual(['Hero.fbx has no clip "Run". Its clips: "Armature|Walk", "Armature|Charge".']);
      expect(texts(frame)).toEqual(['"Armature|Walk" has frames 0 to 30.']);
      expect(requestsNamed(core, "asset.openInView")).toEqual([]);
    });

    it("shows a model in the desktop app when Arcue runs only there", async () => {
      const core = await startFakeCore(userData, {
        file: BRIDGE_INFO_FILE,
        kind: "desktop",
        locks: 1,
        answers: {
          "asset.list": () => ({ assets: [] }),
          "asset.openInView": () => ({ assetId: "a2", shown: "window" }),
        },
      });
      fakes.push(core);
      const client = await connect();

      const result = await call(client, "open_model", { path: model });

      expect(texts(result)).toEqual(["Arcue shows Hero.fbx in the Arcue app as a2."]);
    });

    it("says when another page shows the model because the session's page is not open", async () => {
      await serve({ "asset.openInView": () => ({ assetId: "a1", shown: "window" }) });
      const client = await connect();

      const result = await call(client, "open_model", { path: model });

      expect(texts(result)).toEqual([
        `Arcue shows Hero.fbx as a1 in another of its pages, since this session's page is not open: ${PAGE}`,
      ]);
    });

    it("starts Arcue in the browser when no Arcue runs, then opens the model there", async () => {
      const client = await connect({
        startServe: async () => {
          starts++;
          await serve({
            "asset.list": () => ({ assets: [] }),
            "asset.openInView": () => ({ assetId: "a1", shown: "view" }),
          });
        },
      });

      const result = await call(client, "open_model", { path: model });

      expect(starts).toBe(1);
      expect(texts(result)).toEqual([
        `Started Arcue in the browser. This session's page: ${PAGE}\nArcue shows Hero.fbx in this session's page as a1.`,
      ]);
    });

    it("starts Arcue in the browser once for calls that need it at the same time", async () => {
      const client = await connect({
        startServe: async () => {
          starts++;
          await sleep(50);
          await serve({
            "asset.list": () => ({ assets: [] }),
            "asset.openInView": () => ({ assetId: "a1", shown: "view" }),
          });
        },
      });

      const results = await Promise.all([
        call(client, "open_model", { path: model }),
        call(client, "open_model", { path: model }),
      ]);

      expect(starts).toBe(1);
      expect(results.map((result) => result.isError ?? false)).toEqual([false, false]);
    });

    it("says why when Arcue in the browser does not start", async () => {
      const client = await connect();

      const result = await call(client, "open_model", { path: model });

      expect(starts).toBe(1);
      expect(result.isError).toBe(true);
      expect(texts(result)).toEqual(["Arcue in the browser did not start."]);
    });

    it("starts nothing when a running Arcue does not answer", async () => {
      fakes.push(
        await startFakeCore(userData, { file: SERVE_INFO_FILE, kind: "serve", locks: 1, url: SERVE_URL, refuse: true }),
      );
      const client = await connect();

      const result = await call(client, "open_model", { path: model });

      expect(result.isError).toBe(true);
      expect(texts(result)[0]).toContain("does not answer");
      expect(starts).toBe(0);
    });

    it("suggests move when another view shows the model, and passes the conflict on with move", async () => {
      await serve({
        "asset.openInView": () => {
          throw new ArcueError("conflict", "Another session's view shows Hero.fbx.");
        },
      });
      const client = await connect();

      const without = await call(client, "open_model", { path: model });
      const moved = await call(client, "open_model", { path: model, move: true });

      expect(without.isError).toBe(true);
      expect(texts(without)).toEqual([
        "Another session's view shows Hero.fbx. Pass move to show it in this session's view instead.",
      ]);
      expect(texts(moved)).toEqual(["Another session's view shows Hero.fbx."]);
    });

    it("says to restart an Arcue too old for views", async () => {
      await serve({
        "asset.openInView": () => {
          throw new ArcueError("unknown-command", 'There is no command named "asset.openInView".');
        },
      });
      const client = await connect();

      const result = await call(client, "open_model", { path: model });

      expect(texts(result)).toEqual([
        "The Arcue that runs is older than this arcue command and cannot show models in a session's view. Restart it.",
      ]);
    });
  });

  describe("get_comments", () => {
    it("lists the open comments with their screenshots, oldest first", async () => {
      const draft = comment(THIRD, {
        status: "draft",
        createdAt: "2026-11-03T10:00:00.000Z",
        time: { kind: "none" },
        target: null,
        anchorRestPositions: [],
        rounds: [],
        context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "", screenshot: null },
      });
      const sent = comment(SECOND, {
        createdAt: "2026-11-02T10:00:00.000Z",
        followUps: [{ text: "Still bent.", createdAt: "2026-11-02T11:00:00.000Z", afterRound: 1 }],
      });
      const resolved = comment(FIRST, { status: "resolved" });
      const core = await serve({
        "review.get": () => review([draft, sent, resolved]),
        "comment.screenshot": () => png,
      });
      const client = await connect();

      const result = await call(client, "get_comments", { path: model });

      const [summary, json, label] = texts(result);
      expect(summary).toBe("Hero.fbx has 3 comments: 1 draft, 1 sent, 1 resolved. 2 listed.");
      expect(JSON.parse(json ?? "[]")).toEqual([
        {
          id: SECOND,
          status: "sent",
          rounds: [1],
          text: "Still bent.",
          earlierMessages: ["The thumb tip bends outward."],
          time: { clip: "Armature|Charge", frame: 34 },
          target: { kind: "point", mesh: "Hero/Body", vertices: [812, 813, 830], weights: [0.2, 0.3, 0.5] },
          anchorState: "exact",
          anchorVersion: "v1",
          bones: [{ name: "Right_ThumbDistal", share: 0.64 }],
          view: "palm side",
          camera: { position: [0.6, 1, 0.4], target: [0.4, 1.05, 0.07], up: [0, 1, 0], fov: 35 },
          screenshot: true,
        },
        {
          id: THIRD,
          status: "draft",
          rounds: [],
          text: "The thumb tip bends outward.",
          time: null,
          target: null,
          bones: [],
          view: "",
          camera: { position: [0.6, 1, 0.4], target: [0.4, 1.05, 0.07], up: [0, 1, 0], fov: 35 },
          screenshot: false,
        },
      ]);
      expect(label).toBe(`Screenshot of ${SECOND}:`);
      expect(images(result)).toEqual([Buffer.from(png).toString("base64")]);
      expect(requestsNamed(core, "comment.screenshot")).toEqual([{ assetId: "a1", commentId: SECOND }]);
    });

    it("lists a region comment with its vertex ranges and a range of frames", async () => {
      const region = comment(FIRST, {
        time: { kind: "range", clip: "Armature|Walk", clipDisplayName: "Walk", start: 4, end: 20 },
        target: {
          kind: "region",
          mesh: "Hero/Body",
          triangles: [[0, 9]],
          vertices: [
            [3, 7],
            [12, 12],
          ],
        },
        context: { ...comment(FIRST).context, vertexCount: 6, screenshot: null },
      });
      await serve({ "review.get": () => review([region]) });
      const client = await connect();

      const result = await call(client, "get_comments", { path: model });

      expect(JSON.parse(texts(result)[1] ?? "[]")).toMatchObject([
        {
          time: { clip: "Armature|Walk", frames: [4, 20] },
          target: {
            kind: "region",
            mesh: "Hero/Body",
            vertices: [
              [3, 7],
              [12, 12],
            ],
            vertexCount: 6,
          },
        },
      ]);
    });

    it("lists the comments asked for whatever their status, and refuses an id the model has not", async () => {
      await serve({ "review.get": () => review([comment(FIRST, { status: "resolved" }), comment(SECOND)]) });
      const client = await connect();

      const asked = await call(client, "get_comments", { path: model, comments: [FIRST], screenshots: false });
      const unknown = await call(client, "get_comments", { path: model, comments: [THIRD] });

      expect(JSON.parse(texts(asked)[1] ?? "[]")).toMatchObject([{ id: FIRST, status: "resolved" }]);
      expect(texts(unknown)).toEqual([`Hero.fbx has no comment ${THIRD}.`]);
    });

    it("lists comments made at the same moment by id", async () => {
      await serve({ "review.get": () => review([comment(SECOND), comment(FIRST)]) });
      const client = await connect();

      const result = await call(client, "get_comments", { path: model, screenshots: false });

      expect(JSON.parse(texts(result)[1] ?? "[]").map((entry: { id: string }) => entry.id)).toEqual([FIRST, SECOND]);
    });

    it("leaves out the screenshots past the limit and says so", async () => {
      const ids = Array.from({ length: 9 }, (_, index) => `c01k9qv3m4x7r2t8w5y6z0abc${String(index).padStart(2, "0")}`);
      await serve({ "review.get": () => review(ids.map((id) => comment(id))), "comment.screenshot": () => png });
      const client = await connect();

      const result = await call(client, "get_comments", { path: model });

      expect(images(result)).toHaveLength(8);
      expect(texts(result).at(-1)).toBe(
        "Left out the screenshot of 1 more comment. Pass their ids as comments to get them.",
      );
    });

    it("leaves out the screenshots past the size budget", async () => {
      await serve({
        "review.get": () => review([comment(FIRST), comment(SECOND), comment(THIRD)]),
        "comment.screenshot": () => new Uint8Array(3 * 1024 * 1024),
      });
      const client = await connect();

      const result = await call(client, "get_comments", { path: model });

      expect(images(result)).toHaveLength(1);
      expect(texts(result).at(-1)).toBe(
        "Left out the screenshots of 2 more comments. Pass their ids as comments to get them.",
      );
    });

    it("opens a model that no window has to read its comments, and closes it again", async () => {
      const core = await serve({
        "asset.list": () => ({ assets: [] }),
        "asset.openInView": () => ({ assetId: "a3", shown: "held" }),
        "review.get": () => review([]),
        "asset.close": () => null,
      });
      const client = await connect();

      const result = await call(client, "get_comments", { path: model, status: ["resolved"] });

      expect(texts(result)).toEqual(["Hero.fbx has no comments."]);
      expect(requestsNamed(core, "review.get")).toEqual([{ assetId: "a3" }]);
      expect(requestsNamed(core, "asset.close")).toEqual([{ assetId: "a3" }]);
    });

    it("keeps a model it opened when the session's page shows it", async () => {
      const core = await serve({
        "asset.list": () => ({ assets: [] }),
        "asset.openInView": () => ({ assetId: "a3", shown: "view" }),
        "review.get": () => review([]),
      });
      const client = await connect();

      await call(client, "get_comments", { path: model });

      expect(requestsNamed(core, "asset.close")).toEqual([]);
    });

    it.runIf(process.platform !== "win32")("finds a model that Arcue opened through a link to it", async () => {
      const link = join(temp, "Link.fbx");
      symlinkSync(model, link);
      const core = await serve({
        "asset.list": () => ({ assets: [{ ...heroAsset(), path: link }] }),
        "review.get": () => review([]),
      });
      const client = await connect();

      await call(client, "get_comments", { path: model });

      expect(requestsNamed(core, "asset.openInView")).toEqual([]);
      expect(requestsNamed(core, "review.get")).toEqual([{ assetId: "a1" }]);
    });

    it("says when Arcue in the browser stops during a call", async () => {
      await serve({
        "review.get": () => {
          throw new ArcueError("disconnected", "The connection closed.");
        },
      });
      const client = await connect();

      const result = await call(client, "get_comments", { path: model });

      expect(texts(result)).toEqual(["Arcue in the browser stopped during the call. Try again."]);
    });
  });

  describe("send_round", () => {
    function roundCore(answers: FakeCoreOptions["answers"] = {}) {
      let copied = false;
      const draft = comment(FIRST, { status: "draft", rounds: [] });
      const loose = comment(SECOND, {
        status: "draft",
        rounds: [],
        createdAt: "2026-11-01T11:00:00.000Z",
        context: { ...comment(SECOND).context, screenshot: null },
      });
      return serve({
        "review.get": () =>
          copied
            ? review(
                [
                  { ...draft, status: "sent", rounds: [1] },
                  { ...loose, status: "sent", rounds: [1] },
                ],
                [{ number: 1, createdAt: "2026-11-04T10:00:00.000Z", version: "v1", comments: [FIRST, SECOND] }],
              )
            : review([draft, loose]),
        "round.copy": () => {
          copied = true;
          return { round: 1, prompt: "3D review · round 1 · 2 comments", copiedToClipboard: false };
        },
        "comment.screenshot": () => png,
        ...answers,
      });
    }

    it("sends the queued comments as a round without the clipboard, with their screenshots and ids", async () => {
      const core = await roundCore();
      const client = await connect();

      const result = await call(client, "send_round", { path: model });

      expect(texts(result)).toEqual([
        "3D review · round 1 · 2 comments",
        "Screenshot of comment 1:",
        `The round's comments by number: 1 ${FIRST}, 2 ${SECOND}.`,
      ]);
      expect(images(result)).toHaveLength(1);
      expect(requestsNamed(core, "round.copy")).toEqual([{ assetId: "a1", clipboard: false }]);
    });

    it("says when an older Arcue copied the prompt to the clipboard anyway", async () => {
      await roundCore({
        "round.copy": () => ({ round: 1, prompt: "3D review · round 1", copiedToClipboard: true }),
      });
      const client = await connect();

      const result = await call(client, "send_round", { path: model });

      expect(texts(result).at(-1)).toContain("Arcue also copied the prompt to the clipboard.");
    });

    it("sends nothing when the queue is empty", async () => {
      const core = await serve({ "review.get": () => review([comment(FIRST)]) });
      const client = await connect();

      const result = await call(client, "send_round", { path: model });

      expect(texts(result)).toEqual(["Hero.fbx has no comments in its queue."]);
      expect(core.requests.map((request) => request.name)).not.toContain("round.copy");
    });

    it("says the queue is empty when someone sent it first", async () => {
      let reads = 0;
      await serve({
        "review.get": () => review([comment(FIRST, { status: ++reads > 1 ? "sent" : "draft" })]),
        "round.copy": () => {
          throw new ArcueError("conflict", "The queue has no comments to copy.");
        },
      });
      const client = await connect();

      const result = await call(client, "send_round", { path: model });

      expect(result.isError).toBeFalsy();
      expect(texts(result)).toEqual(["Hero.fbx has no comments in its queue."]);
    });

    it("waits for the model to load before it sends a round", async () => {
      let lists = 0;
      await roundCore({
        "asset.list": () => ({
          assets: [{ ...heroAsset(), status: "loading", version: ++lists > 2 ? "v1" : null }],
        }),
      });
      const client = await connect();

      const result = await call(client, "send_round", { path: model });

      expect(result.isError).toBeFalsy();
      expect(lists).toBeGreaterThan(2);
    });

    it("says when the model failed to load or is still loading", async () => {
      let status = "failed";
      await roundCore({
        "asset.list": () => ({ assets: [{ ...heroAsset(), status, version: null, error: "Bad file." }] }),
      });
      const client = await connect({ loadTimeoutMs: 300 });

      const failed = await call(client, "send_round", { path: model });
      status = "loading";
      const loading = await call(client, "send_round", { path: model });

      expect(texts(failed)).toEqual(["Arcue could not load Hero.fbx: Bad file."]);
      expect(texts(loading)).toEqual(["Hero.fbx is still loading. Try again once it has loaded."]);
    });

    it("sends no round when the call is cancelled while the model loads", async () => {
      let cancelled = false;
      const core = await roundCore({
        "asset.list": () => ({
          assets: [{ ...heroAsset(), status: cancelled ? "ready" : "loading", version: cancelled ? "v1" : null }],
        }),
      });
      const client = await connect();
      const cancel = new AbortController();

      const sent = client.callTool({ name: "send_round", arguments: { path: model } }, { signal: cancel.signal });
      await sleep(300);
      cancel.abort();
      cancelled = true;

      await expect(sent).rejects.toThrow();
      await sleep(500);
      expect(core.requests.map((request) => request.name)).not.toContain("round.copy");
    });
  });

  describe("resolve_comment and reopen_comment", () => {
    it("resolves and reopens comments", async () => {
      const core = await serve({
        "review.get": () => review([comment(FIRST), comment(SECOND)]),
        "comment.resolve": () => null,
        "comment.reopen": () => null,
      });
      const client = await connect();

      const resolved = await call(client, "resolve_comment", { path: model, comment: FIRST });
      const reopened = await call(client, "reopen_comment", { path: model, comment: SECOND, text: "Still bent." });

      expect(texts(resolved)).toEqual([`Resolved ${FIRST} on Hero.fbx.`]);
      expect(texts(reopened)).toEqual([`Reopened ${SECOND} on Hero.fbx. It waits in the queue with the follow-up.`]);
      expect(core.requests.filter((request) => request.name.startsWith("comment.")).map((r) => r.input)).toEqual([
        { assetId: "a1", commentId: FIRST },
        { assetId: "a1", commentId: SECOND, text: "Still bent." },
      ]);
    });

    it("leaves a resolved comment resolved, and refuses a comment the model has not", async () => {
      const core = await serve({ "review.get": () => review([comment(FIRST, { status: "resolved" })]) });
      const client = await connect();

      const again = await call(client, "resolve_comment", { path: model, comment: FIRST });
      const unknown = await call(client, "resolve_comment", { path: model, comment: SECOND });

      expect(again.isError).toBeFalsy();
      expect(texts(again)).toEqual([`${FIRST} on Hero.fbx is already resolved.`]);
      expect(texts(unknown)).toEqual([`Hero.fbx has no comment ${SECOND}.`]);
      expect(requestsNamed(core, "comment.resolve")).toEqual([]);
    });

    it("refuses an id that is no comment id", async () => {
      const core = await serve();
      const client = await connect();

      const result = await call(client, "resolve_comment", { path: model, comment: "3" });

      expect(result.isError).toBe(true);
      expect(core.requests).toEqual([]);
    });
  });

  describe("screenshot", () => {
    it("renders a screenshot at a comment's time and camera", async () => {
      const core = await serve({
        "review.get": () => review([comment(FIRST)]),
        "view.screenshot": () => ({ png }),
      });
      const client = await connect();

      const result = await call(client, "screenshot", { path: model, comment: FIRST, width: 640, height: 360 });

      expect(texts(result)).toEqual(['Hero.fbx at clip "Armature|Charge", frame 34:']);
      expect(images(result)).toEqual([Buffer.from(png).toString("base64")]);
      expect(requestsNamed(core, "view.screenshot")).toEqual([
        {
          assetId: "a1",
          width: 640,
          height: 360,
          time: { kind: "frame", clip: "Armature|Charge", frame: 34 },
          camera: comment(FIRST).camera,
        },
      ]);
    });

    it("renders a range comment at its first frame, and a comment's frame on another clip", async () => {
      const range = comment(SECOND, {
        time: { kind: "range", clip: "Armature|Walk", clipDisplayName: "Walk", start: 4, end: 20 },
      });
      const early = comment(FIRST, {
        time: { kind: "frame", clip: "Armature|Charge", clipDisplayName: "Charge", frame: 12 },
      });
      const core = await serve({
        "review.get": () => review([early, range]),
        "scene.get": scene,
        "view.screenshot": () => ({ png }),
      });
      const client = await connect();

      const first = await call(client, "screenshot", { path: model, comment: SECOND });
      await call(client, "screenshot", { path: model, comment: FIRST, clip: "Walk" });

      expect(texts(first)).toEqual(['Hero.fbx at clip "Armature|Walk", frame 4:']);
      expect(requestsNamed(core, "view.screenshot").map((input) => (input as { time: unknown }).time)).toEqual([
        { kind: "range", clip: "Armature|Walk", start: 4, end: 20 },
        { kind: "frame", clip: "Armature|Walk", frame: 12 },
      ]);
    });

    it("renders a frame of the clip on screen, and needs a clip for a frame", async () => {
      let clip: string | null = "Armature|Walk";
      const core = await serve({
        "viewState.get": () => viewState(clip),
        "scene.get": scene,
        "view.screenshot": () => ({ png }),
      });
      const client = await connect();

      await call(client, "screenshot", { path: model, frame: 20 });
      clip = null;
      const without = await call(client, "screenshot", { path: model, frame: 20 });

      expect(requestsNamed(core, "view.screenshot")).toMatchObject([
        { time: { kind: "frame", clip: "Armature|Walk", frame: 20 } },
      ]);
      expect(texts(without)).toEqual(["A frame needs a clip."]);
    });

    it("waits while the window's 3D view gets ready", async () => {
      let shots = 0;
      await serve({
        "view.screenshot": () => {
          if (++shots < 3) throw new ArcueError("unavailable", "The 3D view of asset a1 is not ready.");
          return { png };
        },
      });
      const client = await connect();

      const result = await call(client, "screenshot", { path: model });

      expect(result.isError).toBeFalsy();
      expect(texts(result)).toEqual(["Hero.fbx as on screen:"]);
      expect(shots).toBe(3);
    });

    it("names the session's page when no page shows the model", async () => {
      await serve({
        "view.screenshot": () => {
          throw new ArcueError("unavailable", "No window shows Hero.fbx.");
        },
      });
      const client = await connect();

      const result = await call(client, "screenshot", { path: model });

      expect(result.isError).toBe(true);
      expect(texts(result)).toEqual([
        `No page shows Hero.fbx. Open this session's page, ${PAGE}, and keep it open, then try again.`,
      ]);
    });

    it("says to show the model when no window of the desktop app shows it", async () => {
      fakes.push(
        await startFakeCore(userData, {
          file: BRIDGE_INFO_FILE,
          kind: "desktop",
          locks: 1,
          answers: {
            "asset.list": () => ({ assets: [heroAsset()] }),
            "view.screenshot": () => {
              throw new ArcueError("unavailable", "No window shows Hero.fbx.");
            },
          },
        }),
      );
      const client = await connect();

      const result = await call(client, "screenshot", { path: model });

      expect(texts(result)).toEqual(["No window shows Hero.fbx. Show it with open_model, then try again."]);
    });
  });

  describe("list_models", () => {
    it("lists the models open in Arcue with their comments", async () => {
      const other = join(temp, "Other.fbx");
      await serve({
        "asset.list": () => ({
          assets: [
            heroAsset(),
            { ...heroAsset(), assetId: "a2", path: other, name: "Other.fbx", status: "loading", version: null },
          ],
        }),
        "review.get": () => review([comment(FIRST, { status: "draft" }), comment(SECOND)]),
      });
      const client = await connect();

      const result = await call(client, "list_models", {});

      expect(texts(result)[0]).toBe("2 models are open in Arcue.");
      expect(JSON.parse(texts(result)[1] ?? "[]")).toEqual([
        { path: model, status: "ready", comments: { draft: 1, sent: 1, resolved: 0 } },
        { path: other, status: "loading", comments: null },
      ]);
    });

    it("starts nothing when no Arcue runs", async () => {
      const client = await connect();

      const result = await call(client, "list_models", {});

      expect(texts(result)).toEqual(["No models are open in Arcue."]);
      expect(starts).toBe(0);
    });
  });

  describe("files", () => {
    it("says when a file is missing or is no model", async () => {
      writeFileSync(join(temp, "README.md"), "");
      const client = await connect();

      const missing = await call(client, "get_comments", { path: "Missing.fbx" });
      const readme = await call(client, "get_comments", { path: "README.md" });

      expect(missing.isError).toBe(true);
      expect(texts(missing)).toEqual([`${join(temp, "Missing.fbx")} is not a file.`]);
      expect(texts(readme)).toEqual([`${join(temp, "README.md")} is not a model. Arcue opens .fbx and .blend files.`]);
      expect(starts).toBe(0);
    });
  });
});
