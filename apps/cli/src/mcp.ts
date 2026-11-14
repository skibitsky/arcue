import { realpath, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { warningPrompt } from "@arcue/core";
import { connectToCore, fromNativePath } from "@arcue/platform-node";
import type {
  AssetInspection,
  AssetSummary,
  CommandInput,
  CommandOutput,
  Comment,
  CoreClient,
  CoreKind,
  ReviewFile,
  TimeSelection,
} from "@arcue/protocol";
import { ArcueError, COMMENT_ID_PATTERN, MODEL_FILE_EXTENSIONS, viewAddress } from "@arcue/protocol";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { CallToolResult, ImageContent, TextContent } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import type { CardComment, CardData, CommentsCardData, InspectionCardData } from "./card-data";
import { CARD_META_KEY, CARD_URI } from "./card-data";
import { formatInspection, formatLabel, inspectFile } from "./inspect";
import { connectForOpen } from "./routing";

export interface ArcueMcpOptions {
  userData: string;
  view: string;
  /** Where relative paths start. */
  cwd: string;
  importWorkerEntry: string;
  /** Starts Arcue in the browser in the background, as `arcue serve --detach` does, or rejects saying why it did not. */
  startServe: () => Promise<void>;
  version: string;
  /** The page of Arcue's card, which apps that show MCP Apps render for `get_comments` and `inspect_model`. */
  cardHtml: () => Promise<string>;
  /** How long a tool waits for a model to load. Defaults to 2 minutes. */
  loadTimeoutMs?: number;
}

/** The card's page, which the build writes beside `arcue.js`. */
export const bundledCardPage = fileURLToPath(new URL("./card.html", import.meta.url));

/** The view of a server that has no `--view` and no session's variables. */
const DEFAULT_VIEW = "mcp";
const MAX_SCREENSHOTS = 8;
/** The most PNG bytes one result carries, so that it stays within what MCP clients read. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const LOAD_POLL_MS = 200;
const VIEW_READY_MS = 30_000;

const OLDER_CORE =
  "The Arcue that runs is older than this arcue command and cannot show models in a session's view. Restart it.";

const pathInput = z
  .string()
  .min(1)
  .describe("The model file, such as an FBX or .blend: absolute, or relative to the folder the server runs in.");
const clipInput = z
  .string()
  .min(1)
  .describe('A clip by its name in the file, as round.json and inspect_model give it, such as "Armature|Walk".');
const frameInput = z.int().min(0).max(0xffffffff).describe("A frame of the clip, counted from 0.");
const commentInput = z
  .string()
  .regex(new RegExp(`^${COMMENT_ID_PATTERN}$`), "Expected a comment id.")
  .describe('A comment id, such as "c01k9qv3m4x7r2t8w5y6z0abcde", from get_comments or round.json.');

const text = (value: string): TextContent => ({ type: "text", text: value });
const image = (png: Uint8Array): ImageContent => ({
  type: "image",
  data: Buffer.from(png).toString("base64"),
  mimeType: "image/png",
});
const result = (...content: (TextContent | ImageContent)[]): CallToolResult => ({ content });
const carded = (card: CardData, ...content: (TextContent | ImageContent)[]): CallToolResult => ({
  content,
  _meta: { [CARD_META_KEY]: card },
});
/** The longest lists of meshes and clips a card shows. */
const CARD_LIST_LIMIT = 200;

interface Core {
  client: CoreClient;
  kind: CoreKind;
  /** The address of the view's page, when Arcue runs in the browser. */
  page: string | null;
  /** The server started Arcue in the browser for this call. */
  started: boolean;
}

/** The MCP server of `arcue mcp`. Each tool call connects to the core that `arcue open` would use for the view. */
export function createArcueMcpServer(given: ArcueMcpOptions): McpServer {
  let starting: Promise<void> | null = null;
  const options: ArcueMcpOptions = {
    ...given,
    startServe: () =>
      (starting ??= given.startServe().finally(() => {
        starting = null;
      })),
  };
  const leases: Leases = new Map();
  const server = new McpServer(
    { name: "arcue", version: options.version },
    {
      instructions: [
        "Arcue is an app where people pin or paint comments on 3D models at a frame. These tools list the models open in Arcue, read a model's comments with their screenshots, send its queued comments as a round, show the model at a clip and frame, render screenshots, and resolve or reopen comments.",
        `Paths are model files, absolute or relative to ${options.cwd}. A comment's vertex numbers count the file's own vertices, in the file's order.`,
      ].join(" "),
    },
  );

  registerAppResource(
    server,
    "Arcue card",
    CARD_URI,
    { description: "Shows a model's comments, or what a model file holds." },
    async () => ({
      contents: [
        {
          uri: CARD_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await options.cardHtml(),
          _meta: { ui: { prefersBorder: false, csp: { resourceDomains: ["https://assets.claude.ai"] } } },
        },
      ],
    }),
  );

  server.registerTool(
    "list_models",
    {
      title: "List the models open in Arcue",
      description:
        "List the models open in Arcue, with the number of comments of each status. Starts nothing: without Arcue running, there are none.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const models = new Map<string, { path: string; status: AssetSummary["status"]; comments: Counts | null }>();
      for (const kind of ["serve", "desktop"] as const) {
        const connection = await connectToCore(options.userData, kind);
        if (!connection) continue;
        try {
          const { assets } = await connection.client.query("asset.list", {});
          for (const asset of assets) {
            if (models.has(asset.path)) continue;
            const review =
              asset.version === null ? null : await connection.client.query("review.get", { assetId: asset.assetId });
            models.set(asset.path, {
              path: asset.path,
              status: asset.status,
              comments: review ? countsOf(review.comments) : null,
            });
          }
        } finally {
          connection.close();
        }
      }
      if (models.size === 0) return result(text("No models are open in Arcue."));
      const head = models.size === 1 ? "1 model is open in Arcue." : `${models.size} models are open in Arcue.`;
      return result(text(head), text(JSON.stringify([...models.values()])));
    },
  );

  registerAppTool(
    server,
    "inspect_model",
    {
      title: "Inspect a model",
      description:
        "Read a model file without opening it in Arcue: format, exporter, axes, height, meshes with their triangles, parts, bones, materials and missing textures, clips, the files its composition adds, and import warnings. json gives the full result, with each mesh's vertex count and every bone.",
      inputSchema: z.object({
        path: pathInput,
        json: z.boolean().default(false).describe("Return the full result as JSON."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: CARD_URI } },
    },
    async ({ path, json }) => {
      const file = await modelFile(options.cwd, path);
      let workerError: unknown = null;
      const inspection = await inspectFile(file, {
        importWorkerEntry: options.importWorkerEntry,
        userData: options.userData,
        onError: (error) => {
          workerError ??= error;
        },
      }).catch((error: unknown) => {
        throw workerError ?? error;
      });
      return carded(
        inspectionCard(file, inspection),
        text(json ? JSON.stringify(inspection) : formatInspection(inspection)),
      );
    },
  );

  server.registerTool(
    "open_model",
    {
      title: "Show a model in Arcue",
      description:
        "Show a model in Arcue, at a clip and frame when given: in this session's page of Arcue in the browser, or in the Arcue desktop app. The result says where, with the page's address when it is not open yet.",
      inputSchema: z.object({
        path: pathInput,
        clip: clipInput.optional(),
        frame: frameInput.optional(),
        move: z.boolean().default(false).describe("Take the model from another session's view when one shows it."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, clip, frame, move }, { mcpReq: { signal } }) => {
      const file = await modelFile(options.cwd, path);
      return withCore(options, (core) =>
        leased(leases, core, file, true, async () => {
          const open = await openAsset(core, file);
          const at = open?.path ?? file;
          let named = clip;
          if (clip !== undefined) {
            const { assetId } = open ?? (await openInView(core, { path: at, view: options.view, move }));
            await loaded(core.client, assetId, options.loadTimeoutMs, signal);
            named = await clipNamed(core.client, { assetId, name: basename(file) }, clip, frame);
          }
          const input: CommandInput<"asset.openInView"> = {
            path: at,
            view: options.view,
            move,
            ...(named !== undefined ? { clip: named } : {}),
            ...(frame !== undefined ? { frame } : {}),
          };
          const { assetId, shown } = await openInView(core, input);
          const moment =
            named !== undefined
              ? ` at clip "${named}"${frame !== undefined ? `, frame ${frame}` : ""}`
              : frame !== undefined
                ? ` at frame ${frame}`
                : "";
          const name = `${basename(file)}${moment}`;
          const lines = startedLine(core);
          if (shown === "view") lines.push(`Arcue shows ${name} in this session's page as ${assetId}.`);
          else if (shown === "window" && core.page !== null) {
            lines.push(
              `Arcue shows ${name} as ${assetId} in another of its pages, since this session's page is not open: ${core.page}`,
            );
          } else if (shown === "window") lines.push(`Arcue shows ${name} in the Arcue app as ${assetId}.`);
          else if (core.page !== null) {
            lines.push(`Arcue holds ${name} as ${assetId} until this session's page opens: ${core.page}`);
          } else lines.push(`Arcue holds ${name} as ${assetId} until one of its windows opens.`);
          return result(text(lines.join("\n")));
        }),
      );
    },
  );

  registerAppTool(
    server,
    "get_comments",
    {
      title: "Read a model's comments",
      description:
        "List the review comments on a model, with their screenshots: each comment's id, status, rounds, messages, clip and frame, the mesh, vertices and bones it points at, and the camera. A draft waits in the reviewer's queue, sent went to the agent in a round, and resolved was fixed. Opens the model in Arcue when it is not open.",
      inputSchema: z.object({
        path: pathInput,
        status: z
          .array(z.enum(["draft", "sent", "resolved"]))
          .min(1)
          .default(["draft", "sent"])
          .describe("The statuses to list."),
        comments: z.array(commentInput).min(1).optional().describe("List only these comments, whatever their status."),
        screenshots: z
          .boolean()
          .default(true)
          .describe(`Add the screenshots of up to ${MAX_SCREENSHOTS} comments; the result says how many it left out.`),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: CARD_URI } },
    },
    async ({ path, status, comments, screenshots }) => {
      const file = await modelFile(options.cwd, path);
      return withCore(options, (core) =>
        withModel(core, file, options, leases, async (asset) => {
          const review = await core.client.query("review.get", { assetId: asset.assetId });
          const missing = comments?.find((id) => !review.comments.some((entry) => entry.id === id));
          if (missing !== undefined) throw new Error(`${asset.name} has no comment ${missing}.`);
          const listed = sorted(review.comments).filter((comment) =>
            comments ? comments.includes(comment.id) : status.includes(comment.status),
          );
          const content: (TextContent | ImageContent)[] = [
            text([...startedLine(core), summaryLine(asset.name, review, listed)].join("\n")),
          ];
          const card = commentsCard(file, asset.name, review, listed);
          if (listed.length === 0) return carded(card, ...content);
          content.push(text(JSON.stringify(listed.map(commentEntry))));
          if (screenshots) {
            const shots = listed
              .filter((comment) => comment.context.screenshot !== null)
              .map((comment) => ({ id: comment.id, label: comment.id }));
            const { content: images, ids, left } = await screenshotsOf(core.client, asset.assetId, shots);
            content.push(...images);
            card.screenshots = ids;
            if (left > 0) content.push(text(`${leftOut(left)} Pass their ids as comments to get them.`));
          }
          return carded(card, ...content);
        }),
      );
    },
  );

  server.registerTool(
    "send_round",
    {
      title: "Send the queued comments",
      description:
        "Send the comments in a model's queue as the next round, as Arcue's copy button does, and return the round's prompt with the screenshots and each comment's id. The comments become sent. Send only when the user asks. The prompt names the round's folder, whose round.json has each comment's exact vertices, positions, bones and camera; get_comments gives them too.",
      inputSchema: z.object({ path: pathInput }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ path }, { mcpReq: { signal } }) => {
      const file = await modelFile(options.cwd, path);
      return withCore(options, (core) =>
        withModel(core, file, options, leases, async (asset) => {
          const empty = () =>
            result(text([...startedLine(core), `${asset.name} has no comments in its queue.`].join("\n")));
          const before = await core.client.query("review.get", { assetId: asset.assetId });
          if (before.queue.length === 0) return empty();
          const current = await loaded(core.client, asset.assetId, options.loadTimeoutMs, signal);
          signal.throwIfAborted();
          let copy: CommandOutput<"round.copy">;
          try {
            copy = await core.client.execute("round.copy", { assetId: asset.assetId, clipboard: false });
          } catch (error) {
            const after = await core.client.query("review.get", { assetId: asset.assetId });
            if (after.queue.length === 0) return empty();
            throw error;
          }
          const review = await core.client.query("review.get", { assetId: asset.assetId });
          const ids = review.rounds.find((entry) => entry.number === copy.round)?.comments ?? [];
          const shots = ids.flatMap((id, index) =>
            review.comments.find((entry) => entry.id === id)?.context.screenshot
              ? [{ id, label: `comment ${index + 1}` }]
              : [],
          );
          const { content: images, left } = await screenshotsOf(core.client, asset.assetId, shots);
          const notes = [
            ...startedLine(core),
            ...staleLine(current),
            `The round's comments by number: ${ids.map((id, index) => `${index + 1} ${id}`).join(", ")}.`,
            ...(copy.copiedToClipboard ? ["Arcue also copied the prompt to the clipboard."] : []),
            ...(left > 0 ? [`${leftOut(left)} get_comments with their ids gives them.`] : []),
          ];
          return result(text(copy.prompt), ...images, text(notes.join("\n")));
        }),
      );
    },
  );

  server.registerTool(
    "resolve_comment",
    {
      title: "Resolve a comment",
      description:
        "Mark a sent comment resolved: the model's new version fixed it. Resolve only when the user asks or confirms the fix. A resolved comment stays resolved.",
      inputSchema: z.object({ path: pathInput, comment: commentInput }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, comment }) => {
      const file = await modelFile(options.cwd, path);
      return withCore(options, (core) =>
        withModel(core, file, options, leases, async (asset) => {
          const review = await core.client.query("review.get", { assetId: asset.assetId });
          const found = review.comments.find((entry) => entry.id === comment);
          if (!found) throw new Error(`${asset.name} has no comment ${comment}.`);
          if (found.status === "resolved") return result(text(`${comment} on ${asset.name} is already resolved.`));
          await core.client.execute("comment.resolve", { assetId: asset.assetId, commentId: comment });
          return result(text(`Resolved ${comment} on ${asset.name}.`));
        }),
      );
    },
  );

  server.registerTool(
    "reopen_comment",
    {
      title: "Reopen a comment",
      description:
        "Return a sent or resolved comment to the model's queue with a follow-up message, when its fix did not work. The next round sends it again. Reopen only when the user asks, with what they say is still wrong.",
      inputSchema: z.object({
        path: pathInput,
        comment: commentInput,
        text: z.string().trim().min(1).describe("What is still wrong."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ path, comment, text: message }) => {
      const file = await modelFile(options.cwd, path);
      return withCore(options, (core) =>
        withModel(core, file, options, leases, async (asset) => {
          await core.client.execute("comment.reopen", { assetId: asset.assetId, commentId: comment, text: message });
          return result(text(`Reopened ${comment} on ${asset.name}. It waits in the queue with the follow-up.`));
        }),
      );
    },
  );

  server.registerTool(
    "screenshot",
    {
      title: "Render a screenshot",
      description:
        "Render the model as Arcue's view shows it and return the PNG: as on screen, at a clip and frame, or at a comment's time and camera, on the model's current version. Needs an Arcue window that shows the model; open_model shows it.",
      inputSchema: z.object({
        path: pathInput,
        comment: commentInput.optional().describe("Render at this comment's time and camera."),
        clip: clipInput.optional(),
        frame: frameInput.optional(),
        width: z.int().min(16).max(2048).default(1280),
        height: z.int().min(16).max(2048).default(720),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, comment, clip, frame, width, height }, { mcpReq: { signal } }) => {
      const file = await modelFile(options.cwd, path);
      return withCore(options, (core) =>
        leased(leases, core, file, true, async () => {
          const open = await openAsset(core, file);
          const asset = open ?? {
            ...(await openInView(core, { path: file, view: options.view, move: false })),
            name: basename(file),
          };
          const current = await loaded(core.client, asset.assetId, options.loadTimeoutMs, signal);
          let time: TimeSelection | undefined;
          let camera: Comment["camera"] | undefined;
          if (comment !== undefined) {
            const review = await core.client.query("review.get", { assetId: asset.assetId });
            const found = review.comments.find((entry) => entry.id === comment);
            if (!found) throw new Error(`${asset.name} has no comment ${comment}.`);
            time = selectionOf(found.time);
            camera = found.camera;
          }
          if (clip !== undefined || frame !== undefined) {
            const onScreen =
              clip ?? clipOf(time) ?? (await core.client.query("viewState.get", { assetId: asset.assetId }))?.clip;
            if (onScreen === undefined || onScreen === null) throw new Error("A frame needs a clip.");
            const at = frame ?? (clip !== undefined ? frameOf(time) : undefined) ?? 0;
            time = { kind: "frame", clip: await clipNamed(core.client, asset, onScreen, at), frame: at };
          }
          const input: CommandInput<"view.screenshot"> = {
            assetId: asset.assetId,
            width,
            height,
            ...(time !== undefined ? { time } : {}),
            ...(camera !== undefined ? { camera } : {}),
          };
          const png = await screenshotWhenReady(core, asset.name, input, signal);
          return result(text([...staleLine(current), `${asset.name}${timeLabel(time)}:`].join("\n")), image(png));
        }),
      );
    },
  );

  return server;
}

/** Runs the server on stdin and stdout until the client closes stdin. */
export async function serveMcp(
  options: Omit<ArcueMcpOptions, "view"> & { view: string | null },
  streams: { stdin: Readable; stdout: Writable } = {
    stdin: process.stdin,
    stdout: process.stdout,
  },
): Promise<void> {
  const server = createArcueMcpServer({ ...options, view: options.view ?? DEFAULT_VIEW });
  const { promise: closed, resolve: close } = Promise.withResolvers<void>();
  server.server.onclose = () => close();
  await server.connect(new StdioServerTransport(streams.stdin, streams.stdout));
  await closed;
}

async function modelFile(cwd: string, path: string): Promise<string> {
  const given = resolve(cwd, path);
  const file = await stat(given).catch(() => null);
  if (!file?.isFile()) throw new Error(`${given} is not a file.`);
  if (!MODEL_FILE_EXTENSIONS.includes(extname(given).toLowerCase())) {
    throw new Error(`${given} is not a model. Arcue opens ${MODEL_FILE_EXTENSIONS.join(" and ")} files.`);
  }
  return realpath(given);
}

/**
 * Connects to the core `arcue open` would use for the view, and starts Arcue in the browser where `arcue open` would
 * say to.
 */
async function withCore<Value>(options: ArcueMcpOptions, work: (core: Core) => Promise<Value>): Promise<Value> {
  let started = false;
  const route = async () => {
    try {
      return await connectForOpen(options.userData, options.view);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("arcue serve --detach")) throw error;
    }
    await options.startServe();
    started = true;
    return connectForOpen(options.userData, options.view);
  };
  const { connection, kind } = await route();
  const url = kind === "serve" ? connection.info.url : undefined;
  const core: Core = {
    client: connection.client,
    kind,
    page: url !== undefined ? viewAddress(url, options.view) : null,
    started,
  };
  try {
    return await work(core);
  } catch (error) {
    if (!(error instanceof ArcueError) || error.code !== "disconnected") throw error;
    throw new Error(
      kind === "serve"
        ? "Arcue in the browser stopped during the call. Try again."
        : "Arcue quit during the call. Try again.",
    );
  } finally {
    connection.close();
  }
}

function startedLine(core: Core): string[] {
  return core.started && core.page !== null ? [`Started Arcue in the browser. This session's page: ${core.page}`] : [];
}

function staleLine(asset: AssetSummary): string[] {
  return asset.status === "failed"
    ? [`Arcue could not load the latest ${asset.name} and uses the version it loaded before: ${asset.error}`]
    : [];
}

async function openInView(
  core: Core,
  input: CommandInput<"asset.openInView">,
): Promise<{ assetId: string; shown: "view" | "window" | "held" }> {
  try {
    return await core.client.execute("asset.openInView", input);
  } catch (error) {
    if (!(error instanceof ArcueError)) throw error;
    if (error.code === "unknown-command") throw new Error(OLDER_CORE);
    if (error.code === "conflict" && !input.move) {
      throw new Error(`${error.message} Pass move to show it in this session's view instead.`);
    }
    throw error;
  }
}

/** The open asset of the file, also when it was opened through another path to it. */
async function openAsset(core: Core, file: string): Promise<AssetSummary | undefined> {
  const { assets } = await core.client.query("asset.list", {});
  const path = fromNativePath(file);
  const same = assets.find((asset) => asset.path === path);
  if (same) return same;
  for (const asset of assets) {
    if ((await realpath(asset.path).catch(() => null)) === file) return asset;
  }
  return undefined;
}

/** The tool calls on each file's model, and the model they opened for themselves alone. */
type Leases = Map<string, Lease>;

interface Lease {
  calls: number;
  opened: string | null;
  /** A call that shows the model ran, so the model stays open. */
  keep: boolean;
  closing: Promise<void> | null;
}

/** Runs `work` as one of the calls on the file's model; the last of them closes the model they opened for themselves. */
async function leased<Value>(
  leases: Leases,
  core: Core,
  file: string,
  keep: boolean,
  work: (lease: Lease) => Promise<Value>,
): Promise<Value> {
  let lease = leases.get(file);
  while (lease?.closing) {
    await lease.closing;
    lease = leases.get(file);
  }
  if (!lease) {
    lease = { calls: 0, opened: null, keep: false, closing: null };
    leases.set(file, lease);
  }
  lease.calls++;
  lease.keep ||= keep;
  try {
    return await work(lease);
  } finally {
    lease.calls--;
    if (lease.calls === 0) {
      const { opened } = lease;
      if (opened === null || lease.keep) leases.delete(file);
      else {
        lease.closing = core.client
          .execute("asset.close", { assetId: opened })
          .then(
            () => undefined,
            () => undefined,
          )
          .finally(() => leases.delete(file));
        await lease.closing;
      }
    }
  }
}

/**
 * Runs `work` on the file's open asset. When no window has it, it opens the file for the view, and the last call on it
 * closes it again unless this session's page shows it, so that it holds no model for a page nobody opened.
 */
async function withModel<Value>(
  core: Core,
  file: string,
  options: ArcueMcpOptions,
  leases: Leases,
  work: (asset: { assetId: string; name: string }) => Promise<Value>,
): Promise<Value> {
  return leased(leases, core, file, false, async (lease) => {
    const open = await openAsset(core, file);
    if (open) return work(open);
    const { assetId, shown } = await openInView(core, { path: file, view: options.view, move: false });
    if (shown !== "view") lease.opened = assetId;
    return work({ assetId, name: basename(file) });
  });
}

/**
 * Renders a screenshot, waiting while the window's 3D view gets the model ready, and says what to do when no window
 * shows it.
 */
async function screenshotWhenReady(
  core: Core,
  name: string,
  input: CommandInput<"view.screenshot">,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const deadline = Date.now() + VIEW_READY_MS;
  for (;;) {
    try {
      return (await core.client.execute("view.screenshot", input)).png;
    } catch (error) {
      if (!(error instanceof ArcueError) || error.code !== "unavailable") throw error;
      if (error.message.endsWith("is not ready.") && Date.now() < deadline) {
        await sleep(LOAD_POLL_MS, undefined, { signal });
        continue;
      }
      if (!error.message.startsWith("No window shows")) throw error;
      throw new Error(
        core.page !== null
          ? `No page shows ${name}. Open this session's page, ${core.page}, and keep it open, then try again.`
          : `No window shows ${name}. Show it with open_model, then try again.`,
      );
    }
  }
}

/** The asset once it has loaded and no reload is under way. A failed reload keeps the version loaded before it. */
async function loaded(
  client: CoreClient,
  assetId: string,
  timeoutMs = 120_000,
  signal?: AbortSignal,
): Promise<AssetSummary> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    const { assets } = await client.query("asset.list", {});
    const asset = assets.find((entry) => entry.assetId === assetId);
    if (!asset) throw new Error("Arcue closed the model.");
    if (asset.status === "failed" && asset.version === null) {
      throw new Error(`Arcue could not load ${asset.name}: ${asset.error}`);
    }
    if (asset.status !== "loading" && asset.version !== null) return asset;
    if (Date.now() >= deadline) throw new Error(`${asset.name} is still loading. Try again once it has loaded.`);
    await sleep(LOAD_POLL_MS, undefined, { signal });
  }
}

/** The clip by its name in the file, or by its display name when only one clip has it, checking the frame. */
async function clipNamed(
  client: CoreClient,
  asset: { assetId: string; name: string },
  clip: string,
  frame: number | undefined,
): Promise<string> {
  const { scene } = await client.query("scene.get", { assetId: asset.assetId });
  const byDisplayName = scene.clips.filter((entry) => entry.displayName === clip);
  const found =
    scene.clips.find((entry) => entry.name === clip) ?? (byDisplayName.length === 1 ? byDisplayName[0] : undefined);
  if (!found) {
    const names = scene.clips.map((entry) => `"${entry.name}"`).join(", ");
    throw new Error(`${asset.name} has no clip "${clip}". ${names ? `Its clips: ${names}.` : "It has no clips."}`);
  }
  if (frame !== undefined && frame >= found.frameCount) {
    throw new Error(`"${found.name}" has frames 0 to ${found.frameCount - 1}.`);
  }
  return found.name;
}

function sorted(comments: readonly Comment[]): Comment[] {
  return [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

type Counts = Record<Comment["status"], number>;

function countsOf(comments: readonly Comment[]): Counts {
  const counts: Counts = { draft: 0, sent: 0, resolved: 0 };
  for (const comment of comments) counts[comment.status]++;
  return counts;
}

function summaryLine(name: string, review: ReviewFile, listed: readonly Comment[]): string {
  if (review.comments.length === 0) return `${name} has no comments.`;
  const counts = Object.entries(countsOf(review.comments))
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`);
  const total = review.comments.length;
  const head = `${name} has ${total} ${total === 1 ? "comment" : "comments"}: ${counts.join(", ")}.`;
  return listed.length === total ? head : `${head} ${listed.length} listed.`;
}

function commentEntry(comment: Comment) {
  const messages = [comment.text, ...comment.followUps.map((followUp) => followUp.text)];
  const { context, target } = comment;
  return {
    id: comment.id,
    status: comment.status,
    rounds: comment.rounds,
    text: messages.at(-1) ?? comment.text,
    ...(messages.length > 1 ? { earlierMessages: messages.slice(0, -1) } : {}),
    time: timeEntry(comment.time),
    target:
      target === null
        ? null
        : target.kind === "surface"
          ? { kind: "point", mesh: target.mesh, vertices: target.vertices, weights: target.weights }
          : { kind: "region", mesh: target.mesh, vertices: target.vertices, vertexCount: context.vertexCount },
    ...(target !== null ? { anchorState: comment.anchorState, anchorVersion: comment.anchorVersion } : {}),
    bones: context.bones,
    view: context.viewLabel,
    camera: comment.camera,
    screenshot: context.screenshot !== null,
    ...(comment.parts ? { parts: comment.parts } : {}),
    ...(comment.warning ? { warning: comment.warning } : {}),
  };
}

function timeEntry(time: Comment["time"]) {
  if (time.kind === "none") return null;
  if (time.kind === "frame") return { clip: time.clip, frame: time.frame };
  return { clip: time.clip, frames: [time.start, time.end] };
}

function selectionOf(time: Comment["time"]): TimeSelection {
  if (time.kind === "none") return { kind: "none" };
  if (time.kind === "frame") return { kind: "frame", clip: time.clip, frame: time.frame };
  return { kind: "range", clip: time.clip, start: time.start, end: time.end };
}

function clipOf(time: TimeSelection | undefined): string | undefined {
  return time === undefined || time.kind === "none" ? undefined : time.clip;
}

function frameOf(time: TimeSelection | undefined): number | undefined {
  if (time === undefined || time.kind === "none") return undefined;
  return time.kind === "frame" ? time.frame : time.start;
}

function timeLabel(time: TimeSelection | undefined): string {
  if (time === undefined) return " as on screen";
  if (time.kind === "none") return " in the rest pose";
  if (time.kind === "frame") return ` at clip "${time.clip}", frame ${time.frame}`;
  return ` at clip "${time.clip}", frame ${time.start}`;
}

function commentsCard(file: string, name: string, review: ReviewFile, listed: readonly Comment[]): CommentsCardData {
  return {
    card: "comments",
    path: file,
    name,
    counts: countsOf(review.comments),
    queued: review.queue.length,
    comments: listed.map(cardComment),
    screenshots: [],
  };
}

function cardComment(comment: Comment): CardComment {
  const { time } = comment;
  return {
    id: comment.id,
    status: comment.status,
    text: comment.followUps.at(-1)?.text ?? comment.text,
    moment:
      time.kind === "none"
        ? null
        : time.kind === "frame"
          ? `${time.clipDisplayName}, frame ${time.frame}`
          : `${time.clipDisplayName}, frames ${time.start} to ${time.end}`,
    hasScreenshot: comment.context.screenshot !== null,
  };
}

function inspectionCard(file: string, inspection: AssetInspection): InspectionCardData {
  return {
    card: "inspection",
    path: file,
    name: inspection.file.name,
    format: formatLabel(inspection),
    height: inspection.height,
    triangles: inspection.triangles,
    meshes: inspection.meshes
      .slice(0, CARD_LIST_LIMIT)
      .map((mesh) => ({ name: mesh.name, triangles: mesh.triangles, skinned: mesh.skinned })),
    bones: inspection.bones.length,
    materials: inspection.materials.length,
    clips: inspection.clips
      .slice(0, CARD_LIST_LIMIT)
      .map((clip) => ({ name: clip.name, displayName: clip.displayName, frames: clip.frames })),
    warnings: inspection.warnings.map((warning) => ({ severity: warning.severity, message: warning.message })),
    prompt: inspection.warnings.length > 0 ? warningPrompt(inspection.file.path, inspection.warnings) : null,
  };
}

/**
 * The comments' screenshots, each after a line that names it, up to `MAX_SCREENSHOTS` and `MAX_IMAGE_BYTES`, and how
 * many it left out.
 */
async function screenshotsOf(
  client: CoreClient,
  assetId: string,
  shots: readonly { id: string; label: string }[],
): Promise<{ content: (TextContent | ImageContent)[]; ids: string[]; left: number }> {
  const content: (TextContent | ImageContent)[] = [];
  const ids: string[] = [];
  let bytes = 0;
  for (const [index, { id, label }] of shots.entries()) {
    if (ids.length === MAX_SCREENSHOTS) return { content, ids, left: shots.length - index };
    const png = await client.query("comment.screenshot", { assetId, commentId: id });
    if (png === null) continue;
    if (ids.length > 0 && bytes + png.byteLength > MAX_IMAGE_BYTES) return { content, ids, left: shots.length - index };
    content.push(text(`Screenshot of ${label}:`), image(png));
    ids.push(id);
    bytes += png.byteLength;
  }
  return { content, ids, left: 0 };
}

function leftOut(count: number): string {
  return count === 1
    ? "Left out the screenshot of 1 more comment."
    : `Left out the screenshots of ${count} more comments.`;
}
