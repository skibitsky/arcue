import { readFile } from "node:fs/promises";
import type { Socket } from "node:net";
import { connect } from "node:net";
import { join } from "node:path";
import type { BridgeInfo, CoreClient, CoreKind } from "@arcue/protocol";
import {
  bridgeInfoFile,
  bridgeInfoSchema,
  connectBridge,
  createPeer,
  createRemoteClient,
  framedChannel,
  HANDSHAKE_MAX_FRAME_BYTES,
  jsonFrameCodec,
  sharesReviews,
} from "@arcue/protocol";
import { socketStream } from "./node-socket";

export interface CoreConnection {
  client: CoreClient;
  info: BridgeInfo;
  close(): void;
}

/** The live core that keeps a core of some kind from starting: a second one of its kind, or one that takes no locks. */
export interface BlockingCore {
  info: BridgeInfo;
  reason: "same" | "unshared";
}

/** The errors of a connect that mean nothing listens at the address. */
const NOTHING_LISTENS = new Set(["ENOENT", "ECONNREFUSED", "ENOTSOCK"]);

const timer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/** What the bridge file of a core of this kind says, or null when it is missing or not valid. */
export function readBridgeInfo(userData: string, kind: CoreKind): Promise<BridgeInfo | null> {
  return readBridgeFile(join(userData, bridgeInfoFile(kind)));
}

/** What a bridge file holds now, or null when it is missing or not valid. */
export async function readBridgeFile(path: string): Promise<BridgeInfo | null> {
  try {
    const parsed = bridgeInfoSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Connects to the core that the bridge file of this kind names and presents its token. Null when nothing listens;
 * rejects when something listens but refuses, stays silent, or cannot be reached.
 */
export async function connectToCore(
  userData: string,
  kind: CoreKind,
  handshakeMs = 5000,
): Promise<CoreConnection | null> {
  const info = await readBridgeInfo(userData, kind);
  return info ? connectWith(info, handshakeMs) : null;
}

/**
 * The core that the bridge file of this kind names, while something listens on its socket. A core that refuses the
 * token, does not answer in time or cannot be reached still listens there, so it counts as running.
 */
export async function runningCore(userData: string, kind: CoreKind, handshakeMs = 5000): Promise<BridgeInfo | null> {
  const info = await readBridgeInfo(userData, kind);
  return info && (await listens(info, handshakeMs)) ? info : null;
}

/** Whether something listens where the bridge file says: a core that answers, refuses, stays silent or is out of reach. */
export async function listens(info: BridgeInfo, handshakeMs = 5000): Promise<boolean> {
  try {
    const connection = await connectWith(info, handshakeMs);
    connection?.close();
    return connection !== null;
  } catch {
    return true;
  }
}

/**
 * The live core that keeps a core of `kind` from starting, or null. Cores of both kinds run side by side, so each kind
 * is kept out only by a second core of its own kind, or by a core that does not take the review locks this build
 * takes, in either bridge file. A core that refuses, stays silent or cannot be reached counts as live.
 */
export async function blockingCore(userData: string, kind: CoreKind, handshakeMs = 5000): Promise<BlockingCore | null> {
  const other: CoreKind = kind === "serve" ? "desktop" : "serve";
  const [own, beside] = await Promise.all([
    runningCore(userData, kind, handshakeMs),
    runningCore(userData, other, handshakeMs),
  ]);
  if (own) {
    const same = sharesReviews(own) && (kind === "serve" || own.kind === "desktop");
    return { info: own, reason: same ? "same" : "unshared" };
  }
  if (beside && !sharesReviews(beside)) return { info: beside, reason: "unshared" };
  return null;
}

async function connectWith(info: BridgeInfo, handshakeMs: number): Promise<CoreConnection | null> {
  const socket = await openSocket(info.socket);
  if (!socket) return null;
  const channel = framedChannel(socketStream(socket), jsonFrameCodec, {
    firstFrameMaxBytes: HANDSHAKE_MAX_FRAME_BYTES,
  });
  const endpoint = await connectBridge(channel, {
    token: info.token,
    timeout: { ms: handshakeMs, setTimer: timer },
  });
  const peer = createPeer(endpoint);
  return {
    client: createRemoteClient(peer),
    info,
    close: () => {
      peer.close();
      socket.destroy();
    },
  };
}

/** Resolves null when nothing listens at the path, and rejects when something there cannot be reached. */
function openSocket(path: string): Promise<Socket | null> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    socket.once("connect", () => resolve(socket));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code !== undefined && NOTHING_LISTENS.has(error.code)) resolve(null);
      else reject(error);
    });
  });
}
