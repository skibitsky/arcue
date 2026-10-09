export type Command =
  | { command: "open"; path: string; clip?: string; frame?: number }
  | { command: "status" }
  | { command: "help" };

export const USAGE = `Usage:
  arcue open <file> [--clip <name>] [--frame <number>]
      Opens an asset in the running Arcue app, starting the app when it is not running.
      --clip names a clip by its name in the file, such as "Armature|Walk"; --frame is a whole frame number from 0.
  arcue status
      Reports whether Arcue is running and which assets it has open. Exits with 1 when it is not running.
  arcue help
      Shows this text.
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
