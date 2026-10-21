export interface ExitOptions {
  exit?: (code?: number) => void;
  setTimer?: (ms: number, run: () => void) => { unref(): void };
}

const EXIT_AFTER_MS = 5000;

const exitProcess = (code?: number) => process.exit(code);
const unrefTimer = (ms: number, run: () => void) => setTimeout(run, ms);

/** Sets the exit code and makes sure the process ends within 5 seconds, whatever handles stay open. */
export function exitAfterRun(code: number, { exit = exitProcess, setTimer = unrefTimer }: ExitOptions = {}): void {
  process.exitCode = code;
  setTimer(EXIT_AFTER_MS, () => exit(code)).unref();
}

/** Ends the process with 1 after `ms` unless it ended first, saying so on stderr. */
export function armHardExit(
  ms: number,
  {
    exit = exitProcess,
    setTimer = unrefTimer,
    err = (text) => process.stderr.write(text),
  }: ExitOptions & { err?: (text: string) => void } = {},
): void {
  setTimer(ms, () => {
    err(`Arcue did not stop within ${Math.round(ms / 1000)} seconds, so it exits now.\n`);
    exit(1);
  }).unref();
}
