import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { connectOrLaunch, connectToApp, userDataDir } from "./app-connection";
import type { Command } from "./args";
import { parseArgs, USAGE, UsageError } from "./args";

export interface Output {
  out(text: string): void;
  err(text: string): void;
}

/** Runs the command line and returns its exit code: 0 on success, 1 on failure, 2 for a usage error. */
export async function run(args: readonly string[], output: Output, cwd = process.cwd()): Promise<number> {
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
    }
  } catch (error) {
    output.err(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function status(output: Output): Promise<number> {
  const connection = await connectToApp(userDataDir());
  if (!connection) {
    output.out("Arcue is not running.\n");
    return 1;
  }
  try {
    const { assets } = await connection.client.query("asset.list", {});
    const lines = [`Arcue is running (process ${connection.info.pid}).`];
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

async function open(command: Extract<Command, { command: "open" }>, cwd: string, output: Output): Promise<number> {
  const given = resolve(cwd, command.path);
  const file = await stat(given).catch(() => null);
  if (!file?.isFile()) throw new Error(`${given} is not a file.`);
  const path = await realpath(given);
  const connection = await connectOrLaunch(userDataDir());
  try {
    const { assetId } = await connection.client.execute("asset.open", {
      path,
      ...(command.clip !== undefined ? { clip: command.clip } : {}),
      ...(command.frame !== undefined ? { frame: command.frame } : {}),
    });
    output.out(`Opened ${path} in Arcue as ${assetId}.\n`);
    return 0;
  } finally {
    connection.close();
  }
}
