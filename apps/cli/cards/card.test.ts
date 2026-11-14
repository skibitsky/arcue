// @vitest-environment jsdom

import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/client";
import type { McpUiHostCapabilities, McpUiHostContext, McpUiStyles } from "@modelcontextprotocol/ext-apps";
import { App } from "@modelcontextprotocol/ext-apps";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardComment, CommentsCardData, InspectionCardData } from "../src/card-data";
import { CARD_META_KEY } from "../src/card-data";
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
  options: { capabilities?: McpUiHostCapabilities; context?: McpUiHostContext; tools?: Tools; message?: boolean } = {},
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
    return options.message === false ? { isError: true } : {};
  };
  bridge.onupdatemodelcontext = async ({ content = [] }) => {
    contexts.push(content);
    return {};
  };
  bridge.onrequestdisplaymode = async ({ mode }) => {
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
    bones: 65,
    materials: 3,
    clips: [{ name: "Armature|Walk", displayName: "Walk", frames: 31 }],
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
    expect(texts(root, ".comment-meta")).toEqual(["draft · Walk, frame 12", "sent", "draft · Walk, frame 12"]);
    expect(texts(root, "button")).toEqual(["Send 2 comments"]);
  });

  it("shows the first comments inline and the rest in the full screen", async () => {
    const { root, result } = await host();
    const comments = ["c1", "c2", "c3", "c4", "c5"].map((id) => comment(id, { status: "sent" }));
    await result(carded(commentsCard(comments)));
    await vi.waitFor(() => expect(texts(root, ".comment-text")).toHaveLength(3));
    expect(root.querySelector(".card-more")?.textContent).toBe("2 more comments");
    expect(texts(root, "button")).toEqual(["Show all"]);

    click(root, "Show all");
    await vi.waitFor(() => expect(texts(root, ".comment-text")).toHaveLength(5));
    expect(root.classList.contains("is-fullscreen")).toBe(true);
    expect(root.querySelector(".card-more")).toBeNull();
    expect(texts(root, "button")).toEqual(Array(5).fill("Resolve"));
  });

  it("shows every comment, each with Resolve, where the host has no full screen", async () => {
    const { root, result } = await host({ context: { displayMode: "inline", availableDisplayModes: ["inline"] } });
    const comments = ["c1", "c2", "c3", "c4"].map((id) => comment(id, { status: "sent" }));
    await result(carded(commentsCard([...comments, comment("c5", { status: "resolved" })])));
    await vi.waitFor(() => expect(texts(root, ".comment-text")).toHaveLength(5));
    expect(texts(root, "button")).toEqual(Array(4).fill("Resolve"));
  });

  it("offers no actions where the host takes no messages or tool calls", async () => {
    const { root, result } = await host({ capabilities: {}, context: { displayMode: "inline" } });
    await result(carded(commentsCard([comment("c1"), comment("c2", { status: "sent", hasScreenshot: true })])));
    await vi.waitFor(() => expect(texts(root, ".comment-text")).toHaveLength(2));
    expect(root.querySelectorAll("button")).toHaveLength(0);
    expect(root.querySelector(".comment-shot.is-loading")).toBeNull();
  });

  it("shows the screenshots the result carries and asks for the rest", async () => {
    const { root, result, calls } = await host({
      tools: {
        get_comments: (args) => {
          const ids = args.comments as string[];
          return carded(commentsCard([], { screenshots: ids.slice(0, 1) }), ...ids.slice(0, 1).map(shot));
        },
      },
    });
    const comments = [
      comment("c1", { hasScreenshot: true }),
      comment("c2", { hasScreenshot: true }),
      comment("c3", { hasScreenshot: true }),
      comment("c4", { hasScreenshot: true }),
    ];
    await result(carded(commentsCard(comments, { screenshots: ["c1"] }), { type: "text", text: "A summary." }, shot()));
    await vi.waitFor(() => expect(root.querySelectorAll("img.comment-shot")).toHaveLength(3));
    expect(root.querySelector("img")?.getAttribute("src")).toBe(`data:image/png;base64,${PNG}`);
    expect(calls.map((call) => call.arguments)).toEqual([
      { path: PATH, comments: ["c2", "c3"], screenshots: true },
      { path: PATH, comments: ["c3"], screenshots: true },
    ]);
  });

  it("stops asking for a screenshot the model does not have", async () => {
    const { root, result, calls } = await host({
      tools: { get_comments: () => carded(commentsCard([])) },
    });
    await result(carded(commentsCard([comment("c1", { hasScreenshot: true })])));
    await vi.waitFor(() => expect(root.querySelector(".comment-shot.is-empty:not(.is-loading)")).not.toBeNull());
    expect(calls).toHaveLength(1);
  });

  it("sends the queue as a round and posts its prompt with the screenshots", async () => {
    let finish: () => void = () => {};
    const sent = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { root, result, calls, messages } = await host({
      tools: {
        send_round: async () => {
          await sent;
          return { content: [{ type: "text", text: "Round 1 prompt." }, shot()] };
        },
        get_comments: () => carded(commentsCard([comment("c1", { status: "sent" })])),
      },
    });
    await result(carded(commentsCard([comment("c1")])));
    await vi.waitFor(() => expect(button(root, "Send 1 comment")).toBeDefined());
    click(root, "Send 1 comment");
    await vi.waitFor(() => expect(button(root, "Sending")?.getAttribute("aria-disabled")).toBe("true"));
    finish();
    await vi.waitFor(() => expect(texts(root, ".comment-meta")).toEqual(["sent · Walk, frame 12"]));
    expect(calls.map((call) => call.name)).toEqual(["send_round", "get_comments"]);
    expect(calls[0]?.arguments).toEqual({ path: PATH });
    expect(calls[1]?.arguments).toEqual({ path: PATH, comments: ["c1"], screenshots: false });
    expect(messages).toEqual([[{ type: "text", text: "Round 1 prompt." }, shot()]]);
    expect(texts(root, "button")).toEqual([]);
  });

  it("gives the screenshots to the model's context where messages take only text", async () => {
    const { root, result, messages, contexts } = await host({
      capabilities: { serverTools: {}, message: { text: {} }, updateModelContext: { image: {} } },
      tools: {
        send_round: () => ({ content: [{ type: "text", text: "Round 1 prompt." }, shot()] }),
        get_comments: () => carded(commentsCard([comment("c1", { status: "sent" })])),
      },
    });
    await result(carded(commentsCard([comment("c1")])));
    await vi.waitFor(() => expect(button(root, "Send 1 comment")).toBeDefined());
    click(root, "Send 1 comment");
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0]).toEqual([{ type: "text", text: "Round 1 prompt." }]);
    expect(contexts).toEqual([[shot()]]);
  });

  it("says so when the round fails or the chat refuses its prompt", async () => {
    const failing = await host({
      tools: { send_round: () => ({ isError: true, content: [{ type: "text", text: "Arcue is not running." }] }) },
    });
    await failing.result(carded(commentsCard([comment("c1")])));
    await vi.waitFor(() => expect(button(failing.root, "Send 1 comment")).toBeDefined());
    click(failing.root, "Send 1 comment");
    await vi.waitFor(() =>
      expect(failing.root.querySelector(".card-notice")?.textContent).toBe("Arcue is not running."),
    );
    expect(button(failing.root, "Send 1 comment")?.hasAttribute("aria-disabled")).toBe(false);
    expect(failing.messages).toEqual([]);

    const refused = await host({
      message: false,
      tools: {
        send_round: () => ({ content: [{ type: "text", text: "Round 1 prompt." }] }),
        get_comments: () => carded(commentsCard([comment("c1", { status: "sent" })])),
      },
    });
    await refused.result(carded(commentsCard([comment("c1")])));
    await vi.waitFor(() => expect(button(refused.root, "Send 1 comment")).toBeDefined());
    click(refused.root, "Send 1 comment");
    await vi.waitFor(() =>
      expect(refused.root.querySelector(".card-notice")?.textContent).toBe(
        "Arcue saved the round, but the chat did not take its prompt.",
      ),
    );
  });

  it("resolves a sent comment and tells the model", async () => {
    const { root, result, calls, contexts } = await host({
      context: { displayMode: "fullscreen", availableDisplayModes: ["inline", "fullscreen"] },
      tools: { resolve_comment: () => ({ content: [{ type: "text", text: "Resolved c2." }] }) },
    });
    await result(carded(commentsCard([comment("c1"), comment("c2", { status: "sent" })])));
    await vi.waitFor(() => expect(button(root, "Resolve")).toBeDefined());
    click(root, "Resolve");
    await vi.waitFor(() => expect(texts(root, ".comment-meta")[1]).toBe("resolved · Walk, frame 12"));
    expect(calls).toEqual([{ name: "resolve_comment", arguments: { path: PATH, comment: "c2" } }]);
    expect(root.querySelector(".card-sub")?.textContent).toBe("1 draft · 1 resolved");
    expect(texts(root, "button")).toEqual(["Send 1 comment"]);
    expect(contexts).toEqual([[{ type: "text", text: "The person resolved comment c2 on Hero.fbx in Arcue's card." }]]);
  });

  it("keeps focus on a button while it works", async () => {
    let finish: () => void = () => {};
    const resolved = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { root, result } = await host({
      context: { displayMode: "fullscreen" },
      tools: {
        resolve_comment: async () => {
          await resolved;
          return { content: [{ type: "text", text: "Resolved." }] };
        },
      },
    });
    await result(carded(commentsCard([comment("c1", { status: "sent" }), comment("c2", { status: "sent" })])));
    await vi.waitFor(() => expect(root.querySelectorAll("button")).toHaveLength(2));
    const second = root.querySelectorAll("button")[1];
    second?.focus();
    second?.click();
    await vi.waitFor(() => expect(button(root, "Resolving")).toBeDefined());
    expect(document.activeElement).toBe(button(root, "Resolving"));
    expect(document.activeElement).not.toBe(second);
    finish();
    await vi.waitFor(() => expect(root.querySelectorAll("button")).toHaveLength(1));
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

  it("leaves out bones and clips a file does not have", async () => {
    const { root, result } = await host({ context: { displayMode: "inline" } });
    await result(carded(inspectionCard({ bones: 0, clips: [], meshes: [] })));
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
    const { root, result } = await host({ message: false });
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

  it("shows a cancelled call", async () => {
    const { root, bridge } = await host();
    await bridge.sendToolCancelled({});
    await vi.waitFor(() => expect(root.querySelector(".card-failure")?.textContent).toBe("The call was cancelled."));
  });

  it("shows the text of a result without a card", async () => {
    const { root, result } = await host();
    await result({ content: [{ type: "text", text: "Hero.fbx has no comments." }] });
    await vi.waitFor(() => expect(root.querySelector(".card-plain")?.textContent).toBe("Hero.fbx has no comments."));
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
