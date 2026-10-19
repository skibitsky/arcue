/** The oldest Node major the plugin's command line runs on. */
export const NODE_MAJOR = 24;

/** The pin file in `apps/plugin/launcher`, shipped beside the launchers. */
export const NODE_PINS_FILE = "node-sha256sums.txt";

/** The Node archives the launchers download, in the order of nodejs.org's SHASUMS256.txt. */
export const NODE_ARCHIVES = [
  "darwin-arm64.tar.xz",
  "darwin-x64.tar.xz",
  "linux-arm64.tar.gz",
  "linux-arm64.tar.xz",
  "linux-x64.tar.gz",
  "linux-x64.tar.xz",
  "win-arm64.zip",
  "win-x64.zip",
] as const;

export function archiveNames(version: string): string[] {
  return NODE_ARCHIVES.map((archive) => `node-v${version}-${archive}`);
}

/** The pin file's text for `version`, picked from that release's SHASUMS256.txt. */
export function pinsFromShasums(version: string, shasums: string): string {
  const lines = shasums.split(/\r?\n/);
  const missing: string[] = [];
  const pins: string[] = [];
  for (const name of archiveNames(version)) {
    const line = lines.find((candidate) => /^[0-9a-f]{64} {2}/.test(candidate) && candidate.slice(66) === name);
    if (line === undefined) missing.push(name);
    else pins.push(line);
  }
  if (missing.length > 0) throw new Error(`SHASUMS256.txt for Node ${version} has no ${missing.join(", ")}.`);
  return `${pins.join("\n")}\n`;
}

export interface NodePins {
  version: string;
  /** SHA-256 in lowercase hex, by archive file name. */
  sums: ReadonlyMap<string, string>;
}

/** Parses and checks the pin file. Throws when it is anything but what `pinsFromShasums` writes. */
export function parseNodePins(text: string): NodePins {
  const fail = (reason: string): never => {
    throw new Error(`${NODE_PINS_FILE} ${reason}. Write it with pnpm --filter @arcue/plugin pin-node <version>.`);
  };
  if (text.includes("\r")) fail("has a carriage return");
  if (!text.endsWith("\n")) fail("does not end with a newline");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== NODE_ARCHIVES.length) fail(`has ${lines.length} lines, not ${NODE_ARCHIVES.length}`);
  let version: string | undefined;
  const sums = new Map<string, string>();
  lines.forEach((line, index) => {
    const archive = NODE_ARCHIVES[index] ?? "";
    const match = /^([0-9a-f]{64}) {2}node-v(\d+\.\d+\.\d+)-(.+)$/.exec(line);
    if (!match || match[3] !== archive) fail(`line ${index + 1} is not "<sha256>  node-v<version>-${archive}"`);
    const [, sum = "", lineVersion = ""] = match ?? [];
    if (version !== undefined && lineVersion !== version) fail(`mixes Node ${version} and ${lineVersion}`);
    version = lineVersion;
    sums.set(`node-v${lineVersion}-${archive}`, sum);
  });
  const pinned = version ?? "";
  if (Number(pinned.split(".")[0]) !== NODE_MAJOR) fail(`pins Node ${pinned}, not Node ${NODE_MAJOR}`);
  return { version: pinned, sums };
}
