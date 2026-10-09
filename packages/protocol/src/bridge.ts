import { z } from "zod";
import type { Author } from "./author";
import { authorSchema } from "./author";
import { ArcueError } from "./errors";
import type { MessageEndpoint } from "./transport/endpoint";
import type { FramedChannel } from "./transport/framed";
import { framedEndpoint } from "./transport/framed";
import type { SetTimer } from "./transport/peer";

/**
 * The file in the desktop app's data folder that tells the command line where the core listens and which token to
 * present. The core rewrites it with a new token every time it starts, readable only by the user.
 */
export const BRIDGE_INFO_FILE = "bridge.json";

export const bridgeInfoSchema = z.object({
  version: z.literal(1),
  /** A Unix domain socket path, or a Windows named pipe such as "\\\\.\\pipe\\arcue-…". */
  socket: z.string().min(1),
  token: z.string().min(32),
  pid: z.int().positive(),
});

export type BridgeInfo = z.output<typeof bridgeInfoSchema>;

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
