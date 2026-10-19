import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { ArcueError } from "@arcue/protocol";
import { connectOrLaunch, connectToApp, userDataDir } from "./app-connection";
import type { Command } from "./args";
import { DEFAULT_SERVE_PORT, parseArgs, USAGE, UsageError } from "./args";
import { bundledImportWorker, formatInspection, inspectFile } from "./inspect";
import { bundledWebUi, startServer } from "./serve";

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
 * Runs the command line and returns its exit code: 0 on success, 1 on failure, 2 for a usage error, and 3 when `setup`
 * runs on a Node older than 24.
 */
export async function run(
  args: readonly string[],
  output: Output,
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
        return await status(output);
      case "open":
        return await open(command, cwd, output);
      case "inspect":
        return await inspect(command, cwd, output, options.importWorkerEntry ?? bundledImportWorker);
      case "serve":
        return await serve(command, output, options);
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

async function status(output: Output): Promise<number> {
  const connection = await connectToApp(userDataDir());
  if (!connection) {
    output.out("Arcue is not running.\n");
    return 1;
  }
  try {
    const { assets } = await connection.client.query("asset.list", {});
    const { url, pid } = connection.info;
    const lines = [
      url ? `Arcue is running in a browser at ${url} (process ${pid}).` : `Arcue is running (process ${pid}).`,
    ];
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
  cwd: string,
  output: Output,
  importWorkerEntry: string,
): Promise<number> {
  const path = await existingFile(cwd, command.path);
  let workerError: unknown = null;
  const inspection = await inspectFile(path, {
    importWorkerEntry,
    userData: userDataDir(),
    onError: (error) => {
      workerError ??= error;
    },
  }).catch((error: unknown) => {
    throw workerError ?? error;
  });
  output.out(command.json ? `${JSON.stringify(inspection, null, 2)}\n` : formatInspection(inspection));
  return 0;
}

async function open(command: Extract<Command, { command: "open" }>, cwd: string, output: Output): Promise<number> {
  const path = await existingFile(cwd, command.path);
  const connection = await connectOrLaunch(userDataDir());
  try {
    const { assetId } = await connection.client.execute("asset.open", {
      path,
      ...(command.clip !== undefined ? { clip: command.clip } : {}),
      ...(command.frame !== undefined ? { frame: command.frame } : {}),
    });
    output.out(`Opened ${path} in Arcue as ${assetId}.\n`);
    return 0;
  } catch (error) {
    const { url } = connection.info;
    if (url && error instanceof ArcueError && error.code === "unavailable") {
      throw new Error(`${error.message} Arcue runs in a browser: open ${url} first.`);
    }
    throw error;
  } finally {
    connection.close();
  }
}

async function serve(
  command: Extract<Command, { command: "serve" }>,
  output: Output,
  options: RunOptions,
): Promise<number> {
  const server = await startServer({
    userData: userDataDir(),
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
