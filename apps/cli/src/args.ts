/** The port `arcue serve` uses without `--port`. */
export const DEFAULT_SERVE_PORT = 4530;

export type Command =
  | { command: "open"; path: string; clip?: string; frame?: number }
  | { command: "inspect"; path: string; json: boolean }
  | { command: "serve"; port?: number }
  | { command: "status" }
  | { command: "help" };

export const USAGE = `Usage:
  arcue open <file> [--clip <name>] [--frame <number>]
      Opens a model in the running Arcue app, starting the app when it is not running. The model loads with the
      files its composition lists.
      --clip names a clip by its name in the file, such as "Armature|Walk" in an FBX or "Walk" in a .blend.
      --frame is a whole frame number from 0.
  arcue inspect <file> [--json]
      Imports a model without the app and summarizes its meshes, parts, bones, materials, clips and warnings,
      composed with the files its composition lists, as opening it would.
      --json prints the full result for scripts and agents. Exits with 1 when the file cannot be read or parsed.
  arcue serve [--port <number>]
      Runs Arcue in a browser instead of the desktop app, until stopped: serves its window at
      http://localhost:${DEFAULT_SERVE_PORT}, or at the given port, to this computer only. "arcue open" then shows models
      there. Exits with 1 when Arcue already runs.
  arcue status
      Reports whether Arcue is running, where a browser shows it, and which assets it has open. Exits with 1 when it is
      not running.
  arcue help
      Shows this text.

A model's composition is composition.json in its review folder: .arcue/reviews/<path from the repository root>/
inside a git repository, otherwise reviews/<absolute path>/ in Arcue's data folder. Its paths are relative to the
model's folder.
`;

export class UsageError extends Error {
  override readonly name = "UsageError";
}

/** Parses the arguments after the program name. Throws a `UsageError` for anything it does not understand. */
export function parseArgs(args: readonly string[]): Command {
  const [command, ...rest] = args;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }
  if (command === "status") {
    if (rest.length > 0) throw new UsageError(`"arcue status" takes no arguments, got "${rest.join(" ")}".`);
    return { command: "status" };
  }
  if (command === "inspect") return parseInspect(rest);
  if (command === "serve") return parseServe(rest);
  if (command !== "open") throw new UsageError(`Unknown command "${command}".`);
  let path: string | undefined;
  let clip: string | undefined;
  let frame: number | undefined;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index] ?? "";
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, undefined];
    if (flag === "--clip" || flag === "--frame") {
      const value = inline ?? rest[++index];
      if (value === undefined || value === "") throw new UsageError(`${flag} needs a value.`);
      if (flag === "--clip") clip = value;
      else frame = parseFrame(value);
    } else if (arg.startsWith("--")) {
      throw new UsageError(`Unknown option "${arg}".`);
    } else if (path === undefined) {
      path = arg;
    } else {
      throw new UsageError(`"arcue open" takes one file, got "${path}" and "${arg}".`);
    }
  }
  if (path === undefined) throw new UsageError('"arcue open" needs a file.');
  return { command: "open", path, ...(clip !== undefined ? { clip } : {}), ...(frame !== undefined ? { frame } : {}) };
}

function parseInspect(args: readonly string[]): Command {
  let path: string | undefined;
  let json = false;
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("--")) throw new UsageError(`Unknown option "${arg}".`);
    else if (path === undefined) path = arg;
    else throw new UsageError(`"arcue inspect" takes one file, got "${path}" and "${arg}".`);
  }
  if (path === undefined) throw new UsageError('"arcue inspect" needs a file.');
  return { command: "inspect", path, json };
}

function parseServe(args: readonly string[]): Command {
  let port: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, undefined];
    if (flag !== "--port") {
      throw new UsageError(
        arg.startsWith("--") ? `Unknown option "${arg}".` : `"arcue serve" takes no file, got "${arg}".`,
      );
    }
    const value = inline ?? args[++index];
    if (value === undefined || value === "") throw new UsageError("--port needs a value.");
    port = parsePort(value);
  }
  return { command: "serve", ...(port !== undefined ? { port } : {}) };
}

function parsePort(value: string): number {
  const port = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(port >= 1 && port <= 65535)) throw new UsageError(`--port takes a port from 1 to 65535, got "${value}".`);
  return port;
}

function parseFrame(value: string): number {
  if (!/^\d+$/.test(value)) throw new UsageError(`--frame takes a whole number from 0, got "${value}".`);
  const frame = Number(value);
  if (!Number.isSafeInteger(frame)) throw new UsageError(`--frame ${value} is too large.`);
  return frame;
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  return [value.slice(0, index), value.slice(index + 1)];
}
