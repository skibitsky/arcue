// @vitest-environment jsdom

import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/client";
import type { McpUiHostCapabilities, McpUiHostContext, McpUiStyles } from "@modelcontextprotocol/ext-apps";
import { App } from "@modelcontextprotocol/ext-apps";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardComment, CommentsCardData, InspectionCardData } from "../src/card-data";
import { CARD_META_KEY, ROUND_META_KEY } from "../src/card-data";
import { Card } from "./card";

const PATH = "/work/Hero.fbx";
const PNG = "iVBORw0KGgo=";
const ALL: McpUiHostCapabilities = {
  serverTools: {},
  message: { text: {}, image: {} },
  updateModelContext: { text: {}, image: {} },
};
const INLINE: McpUiHostContext = { displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] };

type Tools = Record<string, (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>>;

interface Host {
  root: HTMLElement;
  bridge: AppBridge;
  calls: { name: string; arguments: Record<string, unknown> }[];
  messages: ContentBlock[][];
  contexts: ContentBlock[][];
  result(result: CallToolResult): Promise<void>;
}

const bridges: AppBridge[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()));
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-theme");
});

async function host(
  options: {
    capabilities?: McpUiHostCapabilities;
    context?: McpUiHostContext;
    tools?: Tools;
    /** How the chat takes a message: it posts it, refuses it, or fails. */
    message?: "post" | "refuse" | "fail";
    /** Whether the host grants the full screen. */
    fullscreen?: boolean;
  } = {},
): Promise<Host> {
  const capabilities = options.capabilities ?? ALL;
  const tools = options.tools ?? {};
  const calls: Host["calls"] = [];
  const messages: Host["messages"] = [];
  const contexts: Host["contexts"] = [];
  const bridge = new AppBridge(null, { name: "Test host", version: "1" }, capabilities, {
    hostContext: options.context ?? INLINE,
  });
  bridges.push(bridge);
  bridge.oncalltool = async ({ name, arguments: args = {} }) => {
    calls.push({ name, arguments: args });
    const tool = tools[name];
    if (!tool) throw new Error(`No tool ${name}.`);
    return tool(args);
  };
  bridge.onmessage = async ({ content }) => {
    messages.push(content);
    if (options.message === "fail") throw new Error("The chat is busy.");
    return options.message === "refuse" ? { isError: true } : {};
  };
  bridge.onupdatemodelcontext = async ({ content = [] }) => {
    contexts.push(content);
    return {};
  };
  bridge.onrequestdisplaymode = async ({ mode }) => {
    if (options.fullscreen === false) return { mode: "inline" };
    bridge.setHostContext({ ...(options.context ?? INLINE), displayMode: mode });
    return { mode };
  };
  const initialized = new Promise<void>((resolve) => {
    bridge.oninitialized = () => resolve();
  });
  const [hostSide, viewSide] = InMemoryTransport.createLinkedPair();
  await bridge.connect(hostSide);
  const root = document.createElement("main");
  document.body.append(root);
  const app = new App(
    { name: "Arcue", version: "1" },
    { availableDisplayModes: ["inline", "fullscreen"] },
    {
      autoResize: false,
    },
  );
  const card = new Card(root, app);
  await app.connect(viewSide);
  card.started();
  await initialized;
  return {
    root,
    bridge,
    calls,
    messages,
    contexts,
    async result(result) {
      await bridge.sendToolInput({ arguments: { path: PATH } });
      await bridge.sendToolResult(result);
    },
  };
}

function comment(id: string, overrides: Partial<CardComment> = {}): CardComment {
  return { id, status: "draft", text: `Comment ${id}`, moment: "Walk, frame 12", hasScreenshot: false, ...overrides };
}

function commentsCard(comments: CardComment[], overrides: Partial<CommentsCardData> = {}): CommentsCardData {
  const counts = { draft: 0, sent: 0, resolved: 0 };
  for (const entry of comments) counts[entry.status]++;
  return {
    card: "comments",
    path: PATH,
    name: "Hero.fbx",
    counts,
    queued: counts.draft,
    comments,
    screenshots: [],
    ...overrides,
  };
}

function inspectionCard(overrides: Partial<InspectionCardData> = {}): InspectionCardData {
  return {
    card: "inspection",
    path: PATH,
    name: "Hero.fbx",
    format: "FBX from Blender 4.2",
    height: 1.8234,
    triangles: 12480,
    meshes: [
      { name: "Body", triangles: 12000, skinned: true },
      { name: "Sword", triangles: 480, skinned: false },
    ],
    meshCount: 2,
    bones: 65,
    materials: 3,
    clips: [{ name: "Armature|Walk", displayName: "Walk", frames: 31 }],
    clipCount: 1,
    warnings: [],
    prompt: null,
    ...overrides,
  };
}

function carded(card: CommentsCardData | InspectionCardData, ...content: ContentBlock[]): CallToolResult {
  return {
    content: content.length > 0 ? content : [{ type: "text", text: "A summary." }],
    _meta: { [CARD_META_KEY]: card },
  };
}

const shot = (): ContentBlock => ({ type: "image", data: PNG, mimeType: "image/png" });
const line = (text: string): ContentBlock => ({ type: "text", text });

/** A result like `send_round`'s: the prompt, each screenshot after its label, and the notes. */
function round(ids: string[]): CallToolResult {
  return {
    content: [line("Round 1 prompt."), line("Screenshot of comment 1:"), shot(), line("Notes.")],
    _meta: { [ROUND_META_KEY]: { round: 1, comments: ids } },
  };
}

/** A promise that the test settles. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}
const texts = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll(selector)].map((element) => element.textContent);
const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll("button")].find((element) => element.textContent === label);

function click(root: HTMLElement, label: string): void {
  const target = button(root, label);
  if (!target) throw new Error(`No button ${label}: ${texts(root, "button").join(", ")}`);
  target.click();
}

describe("the comments card", () => {
  it("shows a placeholder until the result, then the model's comments", async () => {
    const { root, result } = await host();
    expect(root.querySelector(".card-skeleton")).not.toBeNull();
    await result(carded(commentsCard([comment("c1"), comment("c2", { status: "sent", moment: null }), comment("c3")])));
    await vi.waitFor(() => expect(root.querySelector("h1")?.textContent).toBe("Hero.fbx"));
    expect(root.querySelector(".card-sub")?.textContent).toBe("2 draft · 1 sent");
    expect(texts(root, ".comment-text")).toEqual(["Comment c1", "Comment c2", "Comment c3"]);
    expect(texts(root, ".comment-meta")).toEqual(["Draft · Walk, frame 12", "Sent", "Draft · Walk, frame 12"]);
    expect(texts(root, "button")).toEqual(["Resolve", "Send 2 comments"]);
  });

  it("shows the first comments inline and the rest in the full screen", async () => {
    const { root, result } = await host();
    const comments = ["c1", "c2", "c3", "c4", "c5"].map((id) => comment(id, { status: "sent" }));
    await result(carded(commentsCard(comments)));
    await vi.waitFor(() => expect(texts(root, ".comment-text")).toHaveLength(3));
    expect(root.querySelector(".card-more")?.textContent).toBe("2 more comments");
    expect(texts(root, "button")).toEqual(["Resolve", "Resolve", "Resolve", "Show all"]);

    click(root, "Show all");
    await vi.waitFor(() => expect(texts(root, ".comment-text")).toHaveLength(5));
    expect(root.classList.contains("is-fullscreen")).toBe(true);
    expect(root.querySelector(".card-more")).toBeNull();
    expect(texts(root, "button")).toEqual(Array(5).fill("Resolve"));
  });

  it("shows every comment inline where the host has no full screen or turns it down", async () => {
    const without = await host({ context: { displayMode: "inline", availableDisplayModes: ["inline"] } });
    const comments = ["c1", "c2", "c3", "c4"].map((id) => comment(id));
    await without.result(carded(commentsCard(comments)));
    await vi.waitFor(() => expect(texts(without.root, ".comment-text")).toHaveLength(4));
    expect(texts(without.root, "button")).toEqual(["Send 4 comments"]);

    const refusing = await host({ fullscreen: false });
    await refusing.result(carded(commentsCard(comments)));
    await vi.waitFor(() => expect(button(refusing.root, "Show all")).toBeDefined());
    click(refusing.root, "Show all");
    await vi.waitFor(() => expect(texts(refusing.root, ".comment-text")).toHaveLength(4));
    expect(refusing.root.classList.contains("is-fullscreen")).toBe(false);
    expect(texts(refusing.root, "button")).toEqual(["Send 4 comments"]);
  });

  it("offers no actions where the host takes no messages or tool calls", async () => {
    const { root, result } = await host({ capabilities: {}, context: { displayMode: "inline" } });
    await result(carded(commentsCard([comment("c1"), comment("c2", { status: "sent", hasScreenshot: true })])));
    await vi.waitFor(() => expect(texts(root, ".comment-text")).toHaveLength(2));
    expect(root.querySelectorAll("button")).toHaveLength(0);
    expect(root.querySelector(".comment-shot.is-loading")).toBeNull();
  });

  it("shows the screenshots the result carries and asks for the ones on screen it left out", async () => {
    const { root, result, calls } = await host({
      tools: {
        get_comments: (args) => {
          const ids = (args.comments as string[]).slice(0, 1);
          return carded(commentsCard([], { screenshots: ids }), ...ids.map(shot));
        },
      },
    });
    const comments = ["c1", "c2", "c3", "c4"].map((id) => comment(id, { hasScreenshot: true }));
    await result(carded(commentsCard(comments, { screenshots: ["c1"] }), line("A summary."), shot()));
    await vi.waitFor(() => expect(root.querySelectorAll("img.comment-shot")).toHaveLength(3));
    expect(root.querySelector("img")?.getAttribute("src")).toBe(`data:image/png;base64,${PNG}`);
    expect(calls.map((call) => call.arguments)).toEqual([
      { path: PATH, comments: ["c2", "c3"], screenshots: true },
      { path: PATH, comments: ["c3"], screenshots: true },
    ]);
  });

  it("asks for one batch of screenshots at a time", async () => {
    let running = 0;
    let most = 0;
    const { root, result, calls } = await host({
      context: { displayMode: "fullscreen" },
      tools: {
        get_comments: async (args) => {
          running++;
          most = Math.max(most, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running--;
          const ids = args.comments as string[];
          return carded(commentsCard([], { screenshots: ids }), ...ids.map(shot));
        },
      },
    });
    const comments = Array.from({ length: 20 }, (_, index) => comment(`c${index}`, { hasScreenshot: true }));
    await result(carded(commentsCard(comments)));
    await vi.waitFor(() => expect(root.querySelectorAll("img.comment-shot")).toHaveLength(20));
    expect(calls.map((call) => (call.arguments.comments as string[]).length)).toEqual([8, 8, 4]);
    expect(most).toBe(1);
  });

  it("stops asking for screenshots the model does not have, or that a failed call did not bring", async () => {
    const missing = await host({ tools: { get_comments: () => carded(commentsCard([])) } });
    await missing.result(carded(commentsCard([comment("c1", { hasScreenshot: true })])));
    await vi.waitFor(() => expect(missing.root.querySelector(".comment-shot.is-loading")).toBeNull());
    expect(missing.calls).toHaveLength(1);

    const failing = await host({
      tools: { get_comments: () => ({ isError: true, content: [line("Arcue is not running.")] }) },
    });
    const comments = ["c1", "c2", "c3"].map((id) => comment(id, { hasScreenshot: true }));
    await failing.result(carded(commentsCard(comments)));
    await vi.waitFor(() => expect(failing.root.querySelector(".comment-shot.is-loading")).toBeNull());
    expect(failing.calls).toHaveLength(1);
  });

  it("sends the queue as a round and posts its prompt with the screenshots", async () => {
    const sending = gate();
    const { root, result, calls, messages } = await host({
      tools: {
        send_round: async () => {
          await sending.wait;
          return round(["c1"]);
        },
        get_comments: () => carded(commentsCard([comment("c1", { status: "sent" })])),
      },
    });
    await result(carded(commentsCard([comment("c1"), comment("c2", { status: "resolved" })])));
    await vi.waitFor(() => expect(button(root, "Send 1 comment")).toBeDefined());
    click(root, "Send 1 comment");
    await vi.waitFor(() => expect(button(root, "Sending")?.getAttribute("aria-disabled")).toBe("true"));
    sending.open();
    await vi.waitFor(() => expect(calls.map((call) => call.name)).toEqual(["send_round", "get_comments"]));
    await vi.waitFor(() => expect(texts(root, ".comment-meta")).toEqual(["Sent · Walk, frame 12"]));
    expect(calls[0]?.arguments).toEqual({ path: PATH });
    expect(calls[1]?.arguments).toEqual({ path: PATH, comments: ["c1", "c2"], screenshots: false });
    expect(messages).toEqual([round(["c1"]).content]);
    expect(texts(root, "button")).toEqual(["Resolve"]);
  });

  it("keeps the round on the card when the chat refuses its prompt or the card cannot read the comments again", async () => {
    for (const message of ["refuse", "fail"] as const) {
      const { root, result } = await host({
        message,
        tools: {
          send_round: () => round(["c1", "c3"]),
          get_comments: () => ({ isError: true, content: [line("Arcue is not running.")] }),
        },
      });
      await result(carded(commentsCard([comment("c1"), comment("c2", { status: "sent" })], { queued: 2 })));
      await vi.waitFor(() => expect(button(root, "Send 2 comments")).toBeDefined());
      click(root, "Send 2 comments");
      await vi.waitFor(() =>
        expect(root.querySelector(".card-notice")?.textContent).toBe(
          "Arcue saved the round, but the chat did not take its prompt.",
        ),
      );
      expect(root.querySelector(".card-sub")?.textContent).toBe("3 sent");
      expect(texts(root, ".comment-meta")).toEqual(["Sent · Walk, frame 12", "Sent · Walk, frame 12"]);
      expect(button(root, "Send 2 comments")).toBeUndefined();
    }
  });

  it("gives the screenshots and their labels to the model's context where messages take only text", async () => {
    const { root, result, messages, contexts } = await host({
      capabilities: { serverTools: {}, message: { text: {} }, updateModelContext: { text: {}, image: {} } },
      context: { displayMode: "inline", availableDisplayModes: ["inline"] },
      tools: {
        resolve_comment: () => ({ content: [line("Resolved c2.")] }),
        send_round: () => round(["c1"]),
        get_comments: () => carded(commentsCard([comment("c1", { status: "sent" }), comment("c2")])),
      },
    });
    await result(carded(commentsCard([comment("c1"), comment("c2", { status: "sent" })])));
    await vi.waitFor(() => expect(button(root, "Resolve")).toBeDefined());
    click(root, "Resolve");
    await vi.waitFor(() => expect(contexts).toHaveLength(1));
    click(root, "Send 1 comment");
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0]).toEqual([line("Round 1 prompt."), line("Notes.")]);
    expect(contexts[1]).toEqual([
      line("The person resolved comment c2 on Hero.fbx in Arcue's card."),
      line("Screenshot of comment 1:"),
      shot(),
    ]);
  });

  it("posts nothing when the round is empty or fails", async () => {
    const empty = await host({
      tools: {
        send_round: () => ({ content: [line("Hero.fbx has no comments in its queue.")] }),
        get_comments: () => carded(commentsCard([comment("c1", { status: "sent" })])),
      },
    });
    await empty.result(carded(commentsCard([comment("c1")])));
    await vi.waitFor(() => expect(button(empty.root, "Send 1 comment")).toBeDefined());
    click(empty.root, "Send 1 comment");
    await vi.waitFor(() =>
      expect(empty.root.querySelector(".card-notice")?.textContent).toBe("Hero.fbx has no comments in its queue."),
    );
    await vi.waitFor(() => expect(texts(empty.root, ".comment-meta")).toEqual(["Sent · Walk, frame 12"]));
    expect(empty.messages).toEqual([]);

    const failing = await host({
      tools: { send_round: () => ({ isError: true, content: [line("Arcue is not running.")] }) },
    });
    await failing.result(carded(commentsCard([comment("c1")])));
    await vi.waitFor(() => expect(button(failing.root, "Send 1 comment")).toBeDefined());
    click(failing.root, "Send 1 comment");
    await vi.waitFor(() =>
      expect(failing.root.querySelector(".card-notice")?.textContent).toBe("Arcue is not running."),
    );
    expect(button(failing.root, "Send 1 comment")?.hasAttribute("aria-disabled")).toBe(false);
    expect(failing.messages).toEqual([]);
  });

  it("resolves a sent comment inline and tells the model", async () => {
    const { root, result, calls, contexts } = await host({
      tools: { resolve_comment: () => ({ content: [line("Resolved c2.")] }) },
    });
    await result(carded(commentsCard([comment("c1"), comment("c2", { status: "sent" })])));
    await vi.waitFor(() => expect(button(root, "Resolve")).toBeDefined());
    click(root, "Resolve");
    await vi.waitFor(() => expect(texts(root, ".comment-meta")[1]).toBe("Resolved · Walk, frame 12"));
    expect(calls).toEqual([{ name: "resolve_comment", arguments: { path: PATH, comment: "c2" } }]);
    expect(root.querySelector(".card-sub")?.textContent).toBe("1 draft · 1 resolved");
    expect(texts(root, "button")).toEqual(["Send 1 comment"]);
    expect(contexts).toEqual([[line("The person resolved comment c2 on Hero.fbx in Arcue's card.")]]);
  });

  it("runs one action at a time, and keeps focus on its button while it works", async () => {
    const resolving = gate();
    const { root, result, calls } = await host({
      tools: {
        resolve_comment: async () => {
          await resolving.wait;
          return { content: [line("Resolved.")] };
        },
      },
    });
    await result(carded(commentsCard([comment("c1", { status: "sent" }), comment("c2")])));
    await vi.waitFor(() => expect(button(root, "Resolve")).toBeDefined());
    const resolve = button(root, "Resolve");
    resolve?.focus();
    resolve?.click();
    await vi.waitFor(() => expect(button(root, "Resolving")).toBeDefined());
    expect(document.activeElement).toBe(button(root, "Resolving"));
    expect(document.activeElement).not.toBe(resolve);
    expect(button(root, "Send 1 comment")?.getAttribute("aria-disabled")).toBe("true");
    click(root, "Send 1 comment");
    resolving.open();
    await vi.waitFor(() => expect(button(root, "Resolving")).toBeUndefined());
    expect(calls.map((call) => call.name)).toEqual(["resolve_comment"]);
    expect(document.activeElement).toBe(root);
  });
});

describe("the inspection card", () => {
  it("shows what the file holds", async () => {
    const { root, result } = await host();
    await result(carded(inspectionCard()));
    await vi.waitFor(() => expect(root.querySelector("h1")?.textContent).toBe("Hero.fbx"));
    expect(root.querySelector(".card-sub")?.textContent).toBe("FBX from Blender 4.2");
    expect(texts(root, ".fact")).toEqual(["Triangles12,480", "Meshes2", "Bones65", "Clips1", "Height1.82 m"]);
    expect(root.querySelector(".warnings")).toBeNull();
    expect(texts(root, "button")).toEqual(["Show details"]);

    click(root, "Show details");
    await vi.waitFor(() => expect(root.querySelector(".details")).not.toBeNull());
    expect(texts(root, ".rows li")).toEqual(["Body12,000 triangles, skinned", "Sword480 triangles", "Walk31 frames"]);
    expect(texts(root, "button")).toEqual([]);
  });

  it("counts every mesh and clip, past the ones it lists", async () => {
    const { root, result } = await host({ context: { displayMode: "fullscreen" } });
    await result(carded(inspectionCard({ meshCount: 350, clipCount: 240 })));
    await vi.waitFor(() => expect(texts(root, ".fact")).toContain("Meshes350"));
    expect(texts(root, ".fact")).toContain("Clips240");
  });

  it("leaves out bones and clips a file does not have", async () => {
    const { root, result } = await host({ context: { displayMode: "inline" } });
    await result(carded(inspectionCard({ bones: 0, clips: [], clipCount: 0, meshes: [], meshCount: 0 })));
    await vi.waitFor(() => expect(texts(root, ".fact dt")).toEqual(["Triangles", "Meshes", "Height"]));
    expect(root.querySelectorAll("button")).toHaveLength(0);
  });

  it("asks the chat to fix the warnings", async () => {
    const warnings = ["One", "Two", "Three", "Four"].map((message) => ({ severity: "warning" as const, message }));
    const { root, result, messages } = await host();
    await result(carded(inspectionCard({ warnings, prompt: "Fix these warnings." })));
    await vi.waitFor(() => expect(texts(root, ".warning")).toEqual(["One", "Two", "Three"]));
    expect(root.querySelector(".card-more")?.textContent).toBe("1 more warning");
    expect(texts(root, "button")).toEqual(["Fix 4 warnings", "Show details"]);

    click(root, "Fix 4 warnings");
    await vi.waitFor(() => expect(messages).toEqual([[{ type: "text", text: "Fix these warnings." }]]));
    expect(button(root, "Asked")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("offers the fix again when the chat refuses it", async () => {
    const { root, result } = await host({ message: "refuse" });
    const warnings = [{ severity: "error" as const, message: "Broken." }];
    await result(carded(inspectionCard({ warnings, prompt: "Fix it." })));
    await vi.waitFor(() => expect(button(root, "Fix 1 warning")).toBeDefined());
    click(root, "Fix 1 warning");
    await vi.waitFor(() =>
      expect(root.querySelector(".card-notice")?.textContent).toBe("The chat did not take the request."),
    );
    expect(button(root, "Fix 1 warning")?.hasAttribute("aria-disabled")).toBe(false);
  });
});

describe("the card", () => {
  it("shows a failed call's error", async () => {
    const { root, result } = await host();
    await result({ isError: true, content: [{ type: "text", text: "Hero.fbx is not a model file." }] });
    await vi.waitFor(() =>
      expect(root.querySelector(".card-failure")?.textContent).toBe("Hero.fbx is not a model file."),
    );
  });

  it("shows a cancelled call, but keeps a result that came before the cancellation", async () => {
    const cancelled = await host();
    await cancelled.bridge.sendToolCancelled({});
    await vi.waitFor(() =>
      expect(cancelled.root.querySelector(".card-failure")?.textContent).toBe("The call was cancelled."),
    );

    const finished = await host();
    await finished.result(carded(inspectionCard()));
    await vi.waitFor(() => expect(finished.root.querySelector("h1")).not.toBeNull());
    await finished.bridge.sendToolCancelled({});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(finished.root.querySelector(".card-failure")).toBeNull();
  });

  it("shows the text of a result without a card", async () => {
    const plain = await host();
    await plain.result({ content: [line("Hero.fbx has no comments.")] });
    await vi.waitFor(() =>
      expect(plain.root.querySelector(".card-plain")?.textContent).toBe("Hero.fbx has no comments."),
    );

    const empty = await host();
    await empty.result({ content: [] });
    await vi.waitFor(() =>
      expect(empty.root.querySelector(".card-plain")?.textContent).toBe("The result has nothing to show."),
    );
  });

  it("takes the host's theme and style variables", async () => {
    const { bridge } = await host({
      context: { ...INLINE, theme: "light", styles: { variables: { "--color-text-primary": "black" } as McpUiStyles } },
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--color-text-primary")).toBe("black");
    bridge.setHostContext({ ...INLINE, theme: "dark" });
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
  });
});
