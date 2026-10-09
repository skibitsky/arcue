import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { inspect } from "node:util";

export interface Log {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Appends timestamped lines to a file, keeping one older file as "<name>.1" once it passes 5 MB. Writes are
 * synchronous so the last lines before a crash reach the disk; logging never throws.
 */
export function fileLog(path: string, echo: (line: string) => void = () => undefined): Log {
  try {
    mkdirSync(dirname(path), { recursive: true });
    if ((statSync(path, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) renameSync(path, `${path}.1`);
  } catch {
    // A log that cannot rotate still appends.
  }
  const write = (level: string, message: string) => {
    const line = `${new Date().toISOString()} ${level} ${message}\n`;
    echo(line);
    try {
      appendFileSync(path, line);
    } catch {
      // Nowhere left to report it.
    }
  };
  return {
    info: (message) => write("info", message),
    error: (message, error) => write("error", error === undefined ? message : `${message}: ${describe(error)}`),
  };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  return inspect(error, { depth: 4 });
}
