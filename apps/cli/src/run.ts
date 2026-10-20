import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { connectToCore } from "@arcue/platform-node";
import type { CommandOutput } from "@arcue/protocol";
import { ArcueError, viewAddress } from "@arcue/protocol";
import { connectOrLaunch, userDataDir } from "./app-connection";
import type { Command } from "./args";
import { DEFAULT_SERVE_PORT, parseArgs, USAGE, UsageError } from "./args";
import { bundledImportWorker, formatInspection, inspectFile } from "./inspect";
import { bundledWebUi, startServer } from "./serve";
import { sessionView } from "./session-view";

const NODE_MAJOR = 24;

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
        return await status(command, env, output);
      case "open":
        return await open(command, env, cwd, output);
      case "inspect":
        return await inspect(command, env, cwd, output, options.importWorkerEntry ?? bundledImportWorker);
      case "serve":
        return await serve(command, env, output, options);
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
): Promise<number> {
  const connection = await connectToCore(userDataDir(env));
  if (!connection) {
    output.out("Arcue is not running.\n");
    return 1;
  }
  try {
    const { assets } = await connection.client.query("asset.list", {});
    const { url, pid } = connection.info;
    const view = sessionView(env, command.view);
    const lines = [
      url ? `Arcue is running in a browser at ${url} (process ${pid}).` : `Arcue is running (process ${pid}).`,
    ];
    if (url && view !== null) lines.push(`This session's view: ${viewAddress(url, view)}`);
    if (assets.length === 0) lines.push("No assets are open.");
    else
      lines.push(
        `Open assets:`,
        ...assets.map((asset) => `  ${asset.assetId}  ${asset.status.padEnd(7)}  ${asset.path}`),
      );
    output.out(`${lines.join("\n")}\n`);
    return 0;
  } finally {
    connection.close();
  }
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
): Promise<number> {
  const view = sessionView(env, command.view);
  if (command.move && view === null) {
    throw new Error("--move takes a model into an agent session's view, and no session names one. Give --view <name>.");
  }
  const path = await existingFile(cwd, command.path);
  const connection = await connectOrLaunch(userDataDir(env));
  const { url } = connection.info;
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
  const server = await startServer({
    userData: userDataDir(env),
    importWorkerEntry: options.importWorkerEntry ?? bundledImportWorker,
    webUi: options.webUi ?? bundledWebUi,
    port: command.port ?? DEFAULT_SERVE_PORT,
    onError: (error) => output.err(`${error instanceof Error ? error.message : String(error)}\n`),
    onWaitingForWindow: () => output.err(`Waiting for a browser to open ${server.url}.\n`),
  });
  output.out(`Arcue runs at ${server.url}. Open it in a browser; "arcue open" shows models there.\n`);
  await (options.stop ?? signalled());
  await server.close();
  return 0;
}

function signalled(): Promise<void> {
  return new Promise((resolve) => {
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
    const stop = () => {
      for (const signal of signals) process.off(signal, stop);
      resolve();
    };
    for (const signal of signals) process.on(signal, stop);
  });
}
