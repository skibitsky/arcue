import type { ChildProcess } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import type { Socket } from "node:net";
import { createServer } from "node:net";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import type { BridgeInfo, CoreKind, IncomingRequest, LastCore, LaunchInfo, LockRecord } from "@arcue/protocol";
import {
  ArcueError,
  acceptBridge,
  createPeer,
  framedChannel,
  HANDSHAKE_MAX_FRAME_BYTES,
  jsonFrameCodec,
  LAST_CORE_FILE,
  LAUNCH_INFO_FILE,
} from "@arcue/protocol";
import { bridgeAddress } from "./bridge-server";
import { readBridgeFile } from "./core-connection";
import { lockNamespace } from "./file-lock";
import { socketStream } from "./node-socket";
import { startLockPath } from "./start-claim";

/** The variables that tie a process to an agent session or its view, which no child of a test may inherit. */
const SESSION_VARIABLES = ["CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID", "ARCUE_VIEW"];

export interface FakeCoreOptions {
  file: "bridge.json" | "serve.json";
  kind?: CoreKind;
  locks?: number;
  url?: string;
  build?: string;
  /** The pid the bridge file names: this process, or a child the test owns. */
  pid?: number;
  /** Rejects every token. */
  refuse?: boolean;
  /** Never answers a hello. */
  silent?: boolean;
  /** Answers commands and queries by name; anything else fails as "unknown-command". */
  answers?: Readonly<Record<string, (input: unknown, core: FakeCore) => unknown>>;
}

export interface FakeCore {
  readonly info: BridgeInfo;
  /** Every command and query the fake core received, in order. */
  readonly requests: IncomingRequest[];
  /** Ends the open connections and keeps listening. */
  disconnect(): void;
  /** Stops listening, ends the connections, and removes its bridge file while the file still names it. */
  close(): Promise<void>;
}

/**
 * Listens like a core of any build, past or future, on a socket in the data folder, and writes its bridge file. It
 * speaks the real handshake, so the command line and other cores take it for a running core.
 */
export async function startFakeCore(userData: string, options: FakeCoreOptions): Promise<FakeCore> {
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  const address = await bridgeAddress(userData);
  const token = randomBytes(32).toString("base64url");
  const sockets = new Set<Socket>();
  const requests: IncomingRequest[] = [];
  const info: BridgeInfo = {
    version: 1,
    socket: address.socket,
    token,
    pid: options.pid ?? process.pid,
    ...(options.url !== undefined ? { url: options.url } : {}),
    ...(options.kind !== undefined ? { kind: options.kind } : {}),
    ...(options.locks !== undefined ? { locks: options.locks } : {}),
    ...(options.build !== undefined ? { build: options.build } : {}),
  };
  const infoPath = join(userData, options.file);
  let closing: Promise<void> | null = null;
  const fake: FakeCore = {
    info,
    requests,
    disconnect() {
      for (const socket of sockets) socket.destroy();
    },
    close() {
      closing ??= (async () => {
        const closed = new Promise<void>((resolve) => server.close(() => resolve()));
        fake.disconnect();
        await closed;
        if ((await readBridgeFile(infoPath))?.token === token) await rm(infoPath, { force: true });
        await address.remove();
      })();
      return closing;
    },
  };
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    if (options.silent) return;
    const channel = framedChannel(socketStream(socket), jsonFrameCodec, {
      firstFrameMaxBytes: HANDSHAKE_MAX_FRAME_BYTES,
    });
    const expected = options.refuse ? randomBytes(32).toString("base64url") : token;
    acceptBridge(channel, { token: expected, timeout: { ms: 5000, setTimer: unrefTimer } }).then(
      ({ endpoint }) => {
        createPeer(endpoint, {
          handleRequest: (request) => {
            requests.push(request);
            const answer = options.answers?.[request.name];
            if (!answer) throw new ArcueError("unknown-command", `The fake core does not answer "${request.name}".`);
            return answer(request.input, fake);
          },
        });
      },
      () => undefined,
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(address.socket, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const temporary = `${infoPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(info)}\n`, { mode: 0o600 });
  await rename(temporary, infoPath);
  return fake;
}

/** Records a launch command that runs Node with `script`, standing in for the desktop app. */
export function writeLaunchInfo(userData: string, script: string): void {
  const info: LaunchInfo = { version: 1, command: process.execPath, args: ["-e", script] };
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, LAUNCH_INFO_FILE), JSON.stringify(info));
}

/** Writes `last-core.json` as a core of this kind would. */
export function writeLastCoreFile(userData: string, kind: CoreKind, serveUrl?: string): void {
  const record: LastCore = { version: 1, kind, ...(serveUrl !== undefined ? { serveUrl } : {}) };
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, LAST_CORE_FILE), JSON.stringify(record));
}

/** This process's environment without the variables that tie it to an agent session. */
export function outsideSessions(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  for (const name of SESSION_VARIABLES) delete copy[name];
  return copy;
}

/** A child process this test owns that runs until it is killed, for a pid that stays alive. */
export function sleeper(): { pid: number; kill(): void } {
  const child: ChildProcess = spawn(process.execPath, ["-e", "setInterval(() => {}, 1 << 30)"], {
    stdio: "ignore",
    env: outsideSessions(),
  });
  const pid = child.pid;
  if (pid === undefined) throw new Error("The sleeper did not start.");
  return { pid, kill: () => child.kill("SIGKILL") };
}

/**
 * Writes the start lock of the data folder as another Arcue that holds it would, naming a child this test owns, so
 * nothing in this process takes it for its own. `release` removes the lock file as that Arcue would; `kill` ends the
 * child.
 */
export function holdStartLock(userData: string): { pid: number; release(): void; kill(): void } {
  const holder = sleeper();
  const record: LockRecord = {
    arcueLock: 1,
    token: randomBytes(16).toString("hex"),
    instance: randomBytes(16).toString("hex"),
    pid: holder.pid,
    host: hostname().slice(0, 255),
    ns: lockNamespace(),
    acquiredAt: Date.now(),
  };
  const path = startLockPath(userData);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record));
  return { pid: holder.pid, release: () => rmSync(path, { force: true }), kill: holder.kill };
}

/** The pid of a process that has ended. */
export function deadPid(): number {
  return spawnSync(process.execPath, ["-e", ""], { env: outsideSessions() }).pid;
}

function unrefTimer(delayMs: number, callback: () => void): () => void {
  const handle = setTimeout(callback, delayMs);
  handle.unref();
  return () => clearTimeout(handle);
}
