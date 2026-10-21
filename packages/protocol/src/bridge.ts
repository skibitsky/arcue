import { z } from "zod";
import type { Author } from "./author";
import { authorSchema } from "./author";
import { ArcueError } from "./errors";
import type { MessageEndpoint } from "./transport/endpoint";
import type { FramedChannel } from "./transport/framed";
import { framedEndpoint } from "./transport/framed";
import type { SetTimer } from "./transport/peer";

export const coreKindSchema = z.enum(["desktop", "serve"]);

export type CoreKind = z.output<typeof coreKindSchema>;

/**
 * The desktop app's bridge file. Builds from before cores ran side by side also wrote it for `arcue serve`, with a
 * `url`.
 */
export const BRIDGE_INFO_FILE = "bridge.json";

/** The bridge file of Arcue in the browser, which `arcue serve` runs beside the desktop app. */
export const SERVE_INFO_FILE = "serve.json";

/** The bridge file a core of this kind writes in the data folder. */
export function bridgeInfoFile(kind: CoreKind): string {
  return kind === "serve" ? SERVE_INFO_FILE : BRIDGE_INFO_FILE;
}

/** The lock protocol this build follows. A core that names another never runs beside this one. */
export const LOCK_PROTOCOL = 1;

/**
 * A bridge file, which tells the command line where a core listens and which token to present. The core rewrites it
 * with a new token every time it starts, readable only by the user.
 */
export const bridgeInfoSchema = z.object({
  /** Never raised: older readers take a file with any other version for no core at all. */
  version: z.literal(1),
  /** A Unix domain socket path, or a Windows named pipe such as "\\\\.\\pipe\\arcue-…". */
  socket: z.string().min(1),
  token: z.string().min(32),
  pid: z.int().positive(),
  /** Where a browser shows the core's pages, for Arcue in the browser. */
  url: z.url().optional(),
  /** Which core wrote the file. Builds from before cores ran side by side leave it out and take no locks. */
  kind: coreKindSchema.optional(),
  /** The lock protocol the core follows. */
  locks: z.int().positive().optional(),
  /** Which arcue.js runs the core, for Arcue in the browser: the first 16 hex digits of its SHA-256. */
  build: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
});

export type BridgeInfo = z.output<typeof bridgeInfoSchema>;

/** Whether the core takes the same review locks as this build, so it may run beside it. */
export function sharesReviews(info: BridgeInfo): boolean {
  return info.kind !== undefined && info.locks === LOCK_PROTOCOL;
}

/** The kind of core a bridge file names: its `kind`, or for older builds "serve" when it has a url. */
export function coreKindOf(info: BridgeInfo): CoreKind {
  return info.kind ?? (info.url === undefined ? "desktop" : "serve");
}

/** Which kind of core started, stopped cleanly or was being started last, for "arcue open" while nothing runs. */
export const LAST_CORE_FILE = "last-core.json";

export const lastCoreSchema = z.object({
  version: z.literal(1),
  kind: coreKindSchema,
  /** Where Arcue in the browser served its pages last, which `arcue serve --detach` takes its port from. */
  serveUrl: z.url().optional(),
});

export type LastCore = z.output<typeof lastCoreSchema>;

/** The close code a page's socket gets when Arcue in the browser stops on purpose. */
export const SERVE_STOPPED_CLOSE_CODE = 4000;

/** The marker the page of Arcue in the browser carries, so a page reloads only into another build of itself. */
export const LOCAL_PAGE_MARKER = { name: "arcue-page", content: "local" } as const;

/**
 * Where the page an `arcue serve` server serves connects to its core as a window, over a WebSocket that carries one
 * `binaryFrameCodec` frame per message. The path names the format, so a page left open across an update of its server
 * fails to connect rather than misreads.
 */
export const SERVE_CORE_PATH = "/core/2";

/** The file in the app's data folder that tells the command line how to start the app when it is not running. */
export const LAUNCH_INFO_FILE = "launch.json";

export const launchInfoSchema = z.object({
  version: z.literal(1),
  command: z.string().min(1),
  args: z.array(z.string()),
});

export type LaunchInfo = z.output<typeof launchInfoSchema>;

/** The largest hello or reply either side accepts, so an unauthenticated peer cannot make the other buffer much. */
export const HANDSHAKE_MAX_FRAME_BYTES = 4096;

const helloSchema = z.object({
  type: z.literal("arcue.hello"),
  version: z.literal(1),
  token: z.string(),
  /** Who the bridge acts for, checked against `authorSchema` once the token matches. */
  user: z.unknown().optional(),
});

const replySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("arcue.welcome") }),
  z.object({ type: z.literal("arcue.rejected"), message: z.string() }),
]);

export interface HandshakeOptions {
  token: string;
  /** How long to wait for the other side's first message. */
  timeout: { ms: number; setTimer: SetTimer };
}

export interface ConnectBridgeOptions extends HandshakeOptions {
  /** Who the bridge acts for. The core records it as the author of the comments and rounds the bridge makes. */
  user?: Author;
}

export interface AcceptedBridge {
  /** Carries envelopes once the handshake is done. */
  endpoint: MessageEndpoint;
  /** Who the bridge acts for, when its hello names someone. */
  user?: Author;
}

/**
 * The core's side of a bridge connection: the first message must carry the token. On success the returned endpoint
 * carries envelopes; otherwise the channel is closed and the promise rejects as "forbidden".
 */
export async function acceptBridge(channel: FramedChannel, options: HandshakeOptions): Promise<AcceptedBridge> {
  const hello = helloSchema.safeParse(await firstMessage(channel, options.timeout));
  const refuse = (message: string, reason: string) => {
    channel.send({ type: "arcue.rejected", message });
    channel.close();
    return new ArcueError("forbidden", reason);
  };
  if (!hello.success || !sameToken(hello.data.token, options.token)) {
    throw refuse("The token does not match the running app.", "A bridge connected without the app's token.");
  }
  const user = authorSchema.optional().safeParse(hello.data.user);
  if (!user.success) throw refuse("The user name is not valid.", "A bridge named a user that is not valid.");
  channel.send({ type: "arcue.welcome" });
  const endpoint = framedEndpoint(channel);
  return user.data ? { endpoint, user: user.data } : { endpoint };
}

/** The bridge's side: presents the token and resolves once the core accepts it. */
export async function connectBridge(channel: FramedChannel, options: ConnectBridgeOptions): Promise<MessageEndpoint> {
  channel.send({
    type: "arcue.hello",
    version: 1,
    token: options.token,
    ...(options.user ? { user: options.user } : {}),
  });
  const reply = replySchema.safeParse(await firstMessage(channel, options.timeout));
  if (!reply.success || reply.data.type === "arcue.rejected") {
    channel.close();
    const reason = reply.success && reply.data.type === "arcue.rejected" ? reply.data.message : "It sent no welcome.";
    throw new ArcueError("forbidden", `Arcue refused the connection. ${reason}`);
  }
  return framedEndpoint(channel);
}

function firstMessage(channel: FramedChannel, timeout: HandshakeOptions["timeout"]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const cancelTimer = timeout.setTimer(timeout.ms, () => {
      channel.close();
      reject(new ArcueError("timeout", `The handshake took longer than ${timeout.ms} ms.`));
    });
    channel.receive().then(
      (value) => {
        cancelTimer();
        resolve(value);
      },
      (error: unknown) => {
        cancelTimer();
        reject(error);
      },
    );
  });
}

/** Compares in time that depends only on the length, so the token cannot be guessed byte by byte. */
function sameToken(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < given.length; index++) difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}
