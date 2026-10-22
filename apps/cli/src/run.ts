import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { CoreConnection } from "@arcue/platform-node";
import { connectToCore, readBridgeInfo } from "@arcue/platform-node";
import type { BridgeInfo, CommandOutput, CoreKind } from "@arcue/protocol";
import { ArcueError, coreKindOf, SERVE_STOPPED_CLOSE_CODE, sharesReviews, viewAddress } from "@arcue/protocol";
import { userDataDir } from "./app-connection";
import type { Command } from "./args";
import { DEFAULT_SERVE_PORT, parseArgs, USAGE, UsageError } from "./args";
import { buildOf, detachServe, OTHER_BUILD, otherBuild } from "./detach";
import { bundledImportWorker, formatInspection, inspectFile } from "./inspect";
import { connectForOpen } from "./routing";
import { bundledWebUi, startServer } from "./serve";
import { sessionView } from "./session-view";
import { stopServe } from "./stop";

const NODE_MAJOR = 24;
const ANOTHER_VERSION = "It runs another version of Arcue, which can't share reviews with this arcue command.";

export interface Output {
  out(text: string): void;
  err(text: string): void;
}

export interface RunOptions {
  /** Defaults to the import worker bundled beside `arcue.js`. */
  importWorkerEntry?: string;
  /** The web UI `arcue serve` serves. Defaults to the one bundled beside `arcue.js`. */
  webUi?: string;
  /** Resolves when `arcue serve` should stop. Defaults to the process receiving SIGINT, SIGTERM or SIGHUP. */
  stop?: Promise<void>;
  /** The Node that runs `arcue.js`. Defaults to this process's. */
  node?: { version: string; execPath: string };
  /** The Node and the arcue.js that `serve --detach` runs. Defaults to this process's Node and the bundled `arcue.js`. */
  self?: { execPath: string; script: string };
  /** Which arcue.js this is, for `serve.json` and `status`. Defaults to the build id of `self.script`. */
  build?: string | null;
  /** How long `serve --detach` waits for Arcue in the browser to answer. Defaults to 30 seconds. */
  detachTimeoutMs?: number;
  /** How long `stop` waits for Arcue in the browser to stop. Defaults to 30 seconds. */
  stopTimeoutMs?: number;
  /** Sends a signal to a process, as `stop` does to an older `arcue serve`. Defaults to `process.kill`. */
  signal?: (pid: number, signal: NodeJS.Signals) => void;
  /** The system `stop` runs on, which decides whether it can stop an older `arcue serve`. */
  platform?: NodeJS.Platform;
  /** Called once a foreground `arcue serve` knows why it stops, before it closes. */
  onStopping?: () => void;
}

/**
 * Runs the command line in an environment, which names the data folder and the agent session, and returns its exit
 * code: 0 on success, 1 on failure, 2 for a usage error, and 3 when `setup` runs on a Node older than 24.
 */
export async function run(
  args: readonly string[],
  output: Output,
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
  options: RunOptions = {},
): Promise<number> {
  let command: Command;
  try {
    command = parseArgs(args);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    output.err(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  try {
    switch (command.command) {
      case "help":
        output.out(USAGE);
        return 0;
      case "status":
        return await status(command, env, output, options);
      case "open":
        return await open(command, env, cwd, output, options.platform ?? process.platform);
      case "inspect":
        return await inspect(command, env, cwd, output, options.importWorkerEntry ?? bundledImportWorker);
      case "serve":
        return await serve(command, env, output, options);
      case "stop":
        return await stopServe(env, output, options);
      case "setup":
        return setup(output, options.node ?? { version: process.versions.node, execPath: process.execPath });
    }
  } catch (error) {
    output.err(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function setup(output: Output, node: { version: string; execPath: string }): number {
  if (Number(node.version.split(".")[0]) >= NODE_MAJOR) {
    output.out(`Arcue runs on Node ${node.version} at ${node.execPath}, so there is nothing to set up.\n`);
    return 0;
  }
  output.err(
    `Arcue needs Node ${NODE_MAJOR} or later, and runs on Node ${node.version} at ${node.execPath}. Install Node ${NODE_MAJOR} or later and put it on PATH; with the agent plugin, run setup through the launcher in the skill's scripts folder.\n`,
  );
  return 3;
}

async function status(
  command: Extract<Command, { command: "status" }>,
  env: NodeJS.ProcessEnv,
  output: Output,
  options: RunOptions,
): Promise<number> {
  const userData = userDataDir(env);
  const view = sessionView(env, command.view);
  const cores = await Promise.all(
    (["serve", "desktop"] as const).map((file) =>
      connectToCore(userData, file).then(
        (connection) => ({ file, connection, error: null }),
        (error: unknown) => ({ file, connection: null, error }),
      ),
    ),
  );
  try {
    const build = cores.some(({ connection }) => connection?.info.build !== undefined) ? await buildOf(options) : null;
    const blocks: string[] = [];
    const platform = options.platform ?? process.platform;
    for (const { file, connection, error } of cores) {
      if (connection) {
        blocks.push(await describeCore(connection, file, view, build, platform));
      } else if (error !== null) {
        const info = await readBridgeInfo(userData, file);
        output.err(`${doesNotAnswer(info, file)}: ${messageOf(error)}\n`);
      }
    }
    if (blocks.length > 0) output.out(`${blocks.join("\n\n")}\n`);
    else if (cores.every(({ error }) => error === null)) output.out("Arcue is not running.\n");
    return blocks.length > 0 ? 0 : 1;
  } finally {
    for (const { connection } of cores) connection?.close();
  }
}

/** Whether the core a bridge file names is Arcue in the browser: in `serve.json`, or an older `arcue serve`. */
function inBrowser(info: BridgeInfo, file: CoreKind): info is BridgeInfo & { url: string } {
  return (file === "serve" || coreKindOf(info) === "serve") && info.url !== undefined;
}

/** One core's lines in `status`: where it runs, this session's view in a browser, and its assets. */
async function describeCore(
  connection: CoreConnection,
  file: CoreKind,
  view: string | null,
  build: string | null,
  platform: NodeJS.Platform,
): Promise<string> {
  const { info } = connection;
  const { assets } = await connection.client.query("asset.list", {});
  const lines: string[] = [];
  if (inBrowser(info, file)) {
    lines.push(`Arcue is running in a browser at ${info.url} (process ${info.pid}).`);
    if (info.kind === undefined) {
      lines.push(`It is older than this arcue command: ${stopOlderServe(platform)}, then arcue serve --detach.`);
    } else if (!sharesReviews(info)) {
      lines.push(ANOTHER_VERSION);
    } else if (otherBuild(info, build)) {
      lines.push(OTHER_BUILD);
    }
    if (view !== null) lines.push(`This session's view: ${viewAddress(info.url, view)}`);
  } else if (info.kind === undefined) {
    lines.push(`An older Arcue app is running (process ${info.pid}).`);
  } else {
    lines.push(`The Arcue app is running (process ${info.pid}).`);
    if (!sharesReviews(info)) lines.push(ANOTHER_VERSION);
  }
  if (assets.length === 0) lines.push("No assets are open.");
  else
    lines.push(
      "Open assets:",
      ...assets.map((asset) => `  ${asset.assetId}  ${asset.status.padEnd(7)}  ${asset.path}`),
    );
  return lines.join("\n");
}

/** What `status` says on stderr about a core that listens but does not answer. */
function doesNotAnswer(info: BridgeInfo | null, file: CoreKind): string {
  if (!info) return file === "serve" ? "Arcue in the browser does not answer" : "The Arcue app does not answer";
  if (inBrowser(info, file)) return `Arcue in the browser at ${info.url} (process ${info.pid}) does not answer`;
  return `The Arcue app (process ${info.pid}) does not answer`;
}

/** How to stop an older `arcue serve`, which `arcue stop` can't do on Windows. */
function stopOlderServe(platform: NodeJS.Platform): string {
  return platform === "win32" ? "stop it where it runs" : "run arcue stop";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function existingFile(cwd: string, relative: string): Promise<string> {
  const given = resolve(cwd, relative);
  const file = await stat(given).catch(() => null);
  if (!file?.isFile()) throw new Error(`${given} is not a file.`);
  return realpath(given);
}

async function inspect(
  command: Extract<Command, { command: "inspect" }>,
  env: NodeJS.ProcessEnv,
  cwd: string,
  output: Output,
  importWorkerEntry: string,
): Promise<number> {
  const path = await existingFile(cwd, command.path);
  let workerError: unknown = null;
  const inspection = await inspectFile(path, {
    importWorkerEntry,
    userData: userDataDir(env),
    onError: (error) => {
      workerError ??= error;
    },
  }).catch((error: unknown) => {
    throw workerError ?? error;
  });
  output.out(command.json ? `${JSON.stringify(inspection, null, 2)}\n` : formatInspection(inspection));
  return 0;
}

async function open(
  command: Extract<Command, { command: "open" }>,
  env: NodeJS.ProcessEnv,
  cwd: string,
  output: Output,
  platform: NodeJS.Platform,
): Promise<number> {
  const view = sessionView(env, command.view);
  if (command.move && view === null) {
    throw new Error("--move takes a model into an agent session's view, and no session names one. Give --view <name>.");
  }
  const path = await existingFile(cwd, command.path);
  const { connection, kind } = await connectForOpen(userDataDir(env), view);
  const url = kind === "serve" ? connection.info.url : undefined;
  const at = {
    path,
    ...(command.clip !== undefined ? { clip: command.clip } : {}),
    ...(command.frame !== undefined ? { frame: command.frame } : {}),
  };
  try {
    if (view === null) {
      const { assetId } = await connection.client.execute("asset.open", at);
      output.out(`Opened ${path} in Arcue as ${assetId}.\n`);
      return 0;
    }
    const opened = await connection.client.execute("asset.openInView", { ...at, view, move: command.move ?? false });
    const { text, shown } = openedInView(path, opened, url ? viewAddress(url, view) : null, url);
    output.out(`${text}\n`);
    return shown ? 0 : 1;
  } catch (error) {
    if (!(error instanceof ArcueError)) throw error;
    if (view !== null && error.code === "unknown-command") throw new Error(olderCore(connection.info, kind, platform));
    if (kind === "serve" && error.code === "disconnected") {
      throw new Error(
        `Arcue in the browser stopped while opening ${path}. Run arcue serve --detach, then arcue open again.`,
      );
    }
    if (url && error.code === "unavailable") {
      throw new Error(`${error.message} Arcue runs in a browser: open ${url} first.`);
    }
    if (view !== null && error.code === "conflict" && !command.move) {
      throw new Error(`${error.message} Add --move to show it in this session's view instead.`);
    }
    throw error;
  } finally {
    connection.close();
  }
}

/** What `arcue open` says when the running core predates agent sessions' views. */
function olderCore({ url, pid }: BridgeInfo, kind: CoreKind, platform: NodeJS.Platform): string {
  const [running, restart] =
    kind === "serve"
      ? [`The Arcue at ${url}`, `${stopOlderServe(platform)}, then arcue serve --detach`]
      : ["The Arcue app", "quit the app and run arcue open again"];
  return `${running} (process ${pid}) is older than this arcue command and cannot show models in a session's view. Restart it: ${restart}.`;
}

/**
 * What `arcue open` says about a model it opened for a session's view, and whether a window shows it or will. It names
 * the view's address only when the page is not open.
 */
function openedInView(
  path: string,
  { assetId, shown }: CommandOutput<"asset.openInView">,
  address: string | null,
  url: string | undefined,
): { text: string; shown: boolean } {
  if (shown === "view") return { text: `Opened ${path} in this session's view as ${assetId}.`, shown: true };
  if (shown === "window") {
    const text = url
      ? `Opened ${path} as ${assetId} in the Arcue page at ${url}, since this session's page is not open. Open ${address} in the built-in browser and keep it open.`
      : `Opened ${path} in Arcue as ${assetId}.`;
    return { text, shown: true };
  }
  if (address) {
    return {
      text: `Arcue holds ${path} as ${assetId} until this session's page opens. Open ${address} in the built-in browser and keep it open.`,
      shown: true,
    };
  }
  return {
    text: `No Arcue window opened in time to show ${path}. Arcue holds it as ${assetId}; run arcue open again once its window is open.`,
    shown: false,
  };
}

async function serve(
  command: Extract<Command, { command: "serve" }>,
  env: NodeJS.ProcessEnv,
  output: Output,
  options: RunOptions,
): Promise<number> {
  if (command.detach) return detachServe(command, env, output, options);
  const view = sessionView(env);
  const build = await buildOf(options);
  const server = await startServer({
    userData: userDataDir(env),
    importWorkerEntry: options.importWorkerEntry ?? bundledImportWorker,
    webUi: options.webUi ?? bundledWebUi,
    port: command.port ?? DEFAULT_SERVE_PORT,
    idleStopMs: command.idleStopMs,
    build: build ?? undefined,
    onError: (error) => output.err(`${error instanceof Error ? error.message : String(error)}\n`),
    onWaitingForWindow: (url) => output.err(`Waiting for a browser to open ${url}.\n`),
  });
  output.out(`Arcue runs at ${server.url}. Open it in a browser; agents' "arcue open" shows their models there.\n`);
  if (view !== null) output.out(`This session's view: ${viewAddress(server.url, view)}\n`);
  const signals = stopSignal(options.stop);
  const stop = await Promise.race([signals.stopped.then(() => null), server.stopped]);
  signals.dispose();
  options.onStopping?.();
  if (stop) output.out(`${stop.message}\n`);
  await server.close(SERVE_STOPPED_CLOSE_CODE);
  return 0;
}

/** The stop a caller gives, or else one that resolves when the process receives SIGINT, SIGTERM or SIGHUP. */
function stopSignal(given: Promise<void> | undefined): { stopped: Promise<void>; dispose(): void } {
  if (given) return { stopped: given, dispose: () => undefined };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const { promise, resolve: stopped } = Promise.withResolvers<void>();
  const dispose = () => {
    for (const signal of signals) process.off(signal, stop);
  };
  const stop = () => {
    dispose();
    stopped();
  };
  for (const signal of signals) process.on(signal, stop);
  return { stopped: promise, dispose };
}
