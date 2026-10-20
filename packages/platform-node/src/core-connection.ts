import { readFile } from "node:fs/promises";
import type { Socket } from "node:net";
import { connect } from "node:net";
import { join } from "node:path";
import type { BridgeInfo, CoreClient } from "@arcue/protocol";
import {
  BRIDGE_INFO_FILE,
  bridgeInfoSchema,
  connectBridge,
  createPeer,
  createRemoteClient,
  framedChannel,
  HANDSHAKE_MAX_FRAME_BYTES,
  jsonFrameCodec,
} from "@arcue/protocol";
import { socketStream } from "./node-socket";

export interface CoreConnection {
  client: CoreClient;
  info: BridgeInfo;
  close(): void;
}

const timer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/** What `bridge.json` in the data folder says, or null when it is missing or not valid. */
export async function readBridgeInfo(userData: string): Promise<BridgeInfo | null> {
  try {
    const parsed = bridgeInfoSchema.safeParse(JSON.parse(await readFile(join(userData, BRIDGE_INFO_FILE), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Connects to the core that `bridge.json` names and presents its token; null when nothing listens on its socket. */
export async function connectToCore(userData: string, handshakeMs = 5000): Promise<CoreConnection | null> {
  const info = await readBridgeInfo(userData);
  return info ? connectWith(info, handshakeMs) : null;
}

/**
 * The core that `bridge.json` names, while something listens on its socket. Only one core may run for a data folder,
 * since two would overwrite each other's review files. A core that refuses the token or does not answer in time still
 * listens there, so it counts as running.
 */
export async function runningCore(userData: string, handshakeMs = 5000): Promise<BridgeInfo | null> {
  const info = await readBridgeInfo(userData);
  if (!info) return null;
  try {
    const connection = await connectWith(info, handshakeMs);
    connection?.close();
    return connection ? info : null;
  } catch {
    return info;
  }
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

function openSocket(path: string): Promise<Socket | null> {
  let socket: Socket;
  try {
    socket = connect(path);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    socket.once("connect", () => resolve(socket));
    socket.once("error", () => {
      socket.destroy();
      resolve(null);
    });
  });
}
