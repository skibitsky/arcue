/** The port `arcue serve` uses without `--port`. */
export const DEFAULT_SERVE_PORT = 4530;

export type Command =
  | { command: "open"; path: string; clip?: string; frame?: number; view?: string; move?: boolean }
  | { command: "inspect"; path: string; json: boolean }
  | { command: "serve"; port?: number; detach?: boolean; idleStopMs?: number }
  | { command: "stop" }
  | { command: "status"; view?: string }
  | { command: "setup" }
  | { command: "help" };

export const USAGE = `Usage:
  arcue open <file> [--clip <name>] [--frame <number>] [--view <name>] [--move]
      Opens a model in Arcue. The model loads with the files its composition lists. Run by an agent, it shows the
      model in that agent session's view: the page of Arcue in the browser whose address "arcue status" prints, which
      holds the model until that page is open. Without Arcue in the browser, the desktop app shows it in its window,
      starting when it is not running, unless Arcue last ran in a browser: then it says to run "arcue serve --detach".
      Run by a person, it shows the model in the desktop app, starting the app when it is not running, or, where the
      app has never run or cannot start, in Arcue in the browser.
      --clip names a clip by its name in the file, such as "Armature|Walk" in an FBX or "Walk" in a .blend.
      --frame is a whole frame number from 0.
      --view names the session, in place of ARCUE_VIEW, CLAUDE_CODE_SESSION_ID, CODEX_SESSION_ID or CODEX_THREAD_ID,
      the first of which that is set names it otherwise.
      --move takes the model into this session's view when another view shows it. Unsaved comment text keeps it there.
  arcue inspect <file> [--json]
      Imports a model without the app and summarizes its meshes, parts, bones, materials, clips and warnings,
      composed with the files its composition lists, as opening it would.
      --json prints the full result for scripts and agents. Exits with 1 when the file cannot be read or parsed.
  arcue serve [--detach] [--port <number>]
      Runs Arcue in a browser beside the desktop app, serving its pages at http://localhost:${DEFAULT_SERVE_PORT}, or at the given
      port, to this computer only. Agents' "arcue open" shows their models there. It runs until stopped, and exits
      with 1 when Arcue already runs in a browser or an Arcue that can't share reviews runs.
      --detach runs it in the background: it returns once Arcue answers and prints its address, and Arcue stops by
      itself after 30 minutes with no page open. When Arcue already runs in a browser, it prints that address
      instead. Without --port it uses the port Arcue in the browser ran on last, when that port is free.
  arcue stop
      Stops Arcue in the browser for every agent session, once its changes in flight are saved. The desktop app
      keeps running. Exits with 1 when it does not stop.
  arcue status [--view <name>]
      Reports whether Arcue runs in a browser and in the desktop app, this session's view, and which assets each has
      open. Exits with 1 when neither runs.
  arcue setup
      Through the agent plugin's launcher, on a computer without Node 24 or later: downloads the Node build the
      plugin pins from nodejs.org once, checks its SHA-256 checksum, and keeps it in this user's cache. No other
      command downloads anything. Exits with 3 when arcue runs on a Node older than 24.
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
  if (command === "status") return parseStatus(rest);
  if (command === "stop") {
    if (rest.length > 0) throw new UsageError(`"arcue stop" takes no arguments, got "${rest.join(" ")}".`);
    return { command: "stop" };
  }
  if (command === "setup") {
    if (rest.length > 0) throw new UsageError(`"arcue setup" takes no arguments, got "${rest.join(" ")}".`);
    return { command: "setup" };
  }
  if (command === "inspect") return parseInspect(rest);
  if (command === "serve") return parseServe(rest);
  if (command !== "open") throw new UsageError(`Unknown command "${command}".`);
  let path: string | undefined;
  let clip: string | undefined;
  let frame: number | undefined;
  let view: string | undefined;
  let move = false;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index] ?? "";
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, undefined];
    if (flag === "--clip" || flag === "--frame" || flag === "--view") {
      const value = inline ?? rest[++index];
      if (value === undefined || value === "") throw new UsageError(`${flag} needs a value.`);
      if (flag === "--clip") clip = value;
      else if (flag === "--view") view = value;
      else frame = parseFrame(value);
    } else if (arg === "--move") {
      move = true;
    } else if (arg.startsWith("--")) {
      throw new UsageError(`Unknown option "${arg}".`);
    } else if (path === undefined) {
      path = arg;
    } else {
      throw new UsageError(`"arcue open" takes one file, got "${path}" and "${arg}".`);
    }
  }
  if (path === undefined) throw new UsageError('"arcue open" needs a file.');
  return {
    command: "open",
    path,
    ...(clip !== undefined ? { clip } : {}),
    ...(frame !== undefined ? { frame } : {}),
    ...(view !== undefined ? { view } : {}),
    ...(move ? { move } : {}),
  };
}

function parseStatus(args: readonly string[]): Command {
  let view: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, undefined];
    if (flag !== "--view") {
      throw new UsageError(
        arg.startsWith("--")
          ? `Unknown option "${arg}".`
          : `"arcue status" takes no arguments but --view, got "${args.join(" ")}".`,
      );
    }
    const value = inline ?? args[++index];
    if (value === undefined || value === "") throw new UsageError("--view needs a value.");
    view = value;
  }
  return { command: "status", ...(view !== undefined ? { view } : {}) };
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
  let detach = false;
  let idleStopMs: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? splitOnce(arg, "=") : [arg, undefined];
    if (flag === "--detach") {
      if (inline !== undefined) throw new UsageError("--detach takes no value.");
      detach = true;
      continue;
    }
    if (flag !== "--port" && flag !== "--idle-stop-ms") {
      throw new UsageError(
        arg.startsWith("--") ? `Unknown option "${arg}".` : `"arcue serve" takes no file, got "${arg}".`,
      );
    }
    const value = inline ?? args[++index];
    if (value === undefined || value === "") throw new UsageError(`${flag} needs a value.`);
    if (flag === "--port") port = parsePort(value);
    else idleStopMs = parseIdleStop(value);
  }
  if (detach && idleStopMs !== undefined) throw new UsageError("--idle-stop-ms is set by --detach.");
  return {
    command: "serve",
    ...(port !== undefined ? { port } : {}),
    ...(detach ? { detach } : {}),
    ...(idleStopMs !== undefined ? { idleStopMs } : {}),
  };
}

function parsePort(value: string): number {
  const port = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(port >= 1 && port <= 65535)) throw new UsageError(`--port takes a port from 1 to 65535, got "${value}".`);
  return port;
}

/** The longest delay a Node timer keeps; a longer one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

function parseIdleStop(value: string): number {
  const ms = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(ms >= 1)) {
    throw new UsageError(`--idle-stop-ms takes a whole number of milliseconds from 1, got "${value}".`);
  }
  if (ms > MAX_TIMER_MS) {
    throw new UsageError(`--idle-stop-ms takes at most ${MAX_TIMER_MS} milliseconds, got "${value}".`);
  }
  return ms;
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
