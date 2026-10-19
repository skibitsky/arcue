import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { archiveNames, NODE_MAJOR, NODE_PINS_FILE, parseNodePins, pinsFromShasums } from "../src/node-pins.ts";

const USAGE = "Usage: pin-node <version> [--skip-signature], or pin-node --check";
const DIST = "https://nodejs.org/dist";
const RELEASE_KEYS = "https://raw.githubusercontent.com/nodejs/release-keys/HEAD/gpg-only-active-keys/pubring.kbx";
const RELEASE_FILES = ["osx-arm64-tar", "osx-x64-tar", "linux-arm64", "linux-x64", "win-arm64-zip", "win-x64-zip"];
const pinsPath = fileURLToPath(new URL(`../launcher/${NODE_PINS_FILE}`, import.meta.url));

interface Release {
  version: string;
  lts: string | false;
  files: string[];
}

function withoutLogin(url: string): string {
  if (!URL.canParse(url)) return url;
  const parsed = new URL(url);
  parsed.username = "";
  parsed.password = "";
  return parsed.href;
}

async function download(url: string): Promise<Response> {
  const response = await fetch(url).catch((error: unknown) => {
    const reason = (error instanceof Error ? error.message : String(error)).replaceAll(url, withoutLogin(url));
    throw new Error(`Could not download ${withoutLogin(url)}: ${reason}`);
  });
  if (!response.ok) throw new Error(`Could not download ${withoutLogin(url)}: HTTP ${response.status}.`);
  return response;
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function checkRelease(version: string): Promise<void> {
  const releases = (await (await download(`${DIST}/index.json`)).json()) as Release[];
  const release = releases.find((entry) => entry.version === `v${version}`);
  if (!release) throw new Error(`nodejs.org lists no Node ${version}.`);
  if (!release.lts) throw new Error(`Node ${version} is not an LTS release.`);
  const missing = RELEASE_FILES.filter((file) => !release.files.includes(file));
  if (missing.length > 0) throw new Error(`Node ${version} has no ${missing.join(", ")} builds.`);
  const newer = releases
    .filter((entry) => entry.lts && entry.version.startsWith(`v${NODE_MAJOR}.`))
    .map((entry) => entry.version.slice(1))
    .filter((other) => compareVersions(other, version) > 0)
    .sort(compareVersions)
    .at(-1);
  if (newer) console.log(`Note: Node ${newer} is a newer ${NODE_MAJOR}.x LTS.`);
}

async function verifiedShasums(version: string, skipSignature: boolean): Promise<string> {
  const base = `${DIST}/v${version}`;
  const shasums = await (await download(`${base}/SHASUMS256.txt`)).text();
  if (skipSignature) return shasums;
  const folder = await mkdtemp(join(tmpdir(), "arcue-pin-node-"));
  try {
    const signature = Buffer.from(await (await download(`${base}/SHASUMS256.txt.sig`)).arrayBuffer());
    const keyring = Buffer.from(await (await download(RELEASE_KEYS)).arrayBuffer());
    await writeFile(join(folder, "SHASUMS256.txt"), shasums);
    await writeFile(join(folder, "SHASUMS256.txt.sig"), signature);
    await writeFile(join(folder, "pubring.kbx"), keyring);
    const result = spawnSync(
      "gpgv",
      ["--keyring", join(folder, "pubring.kbx"), "SHASUMS256.txt.sig", "SHASUMS256.txt"],
      {
        cwd: folder,
        encoding: "utf8",
      },
    );
    if (result.error) {
      throw new Error(
        "pin-node needs gpgv to check Node's signature: install GnuPG, or pass --skip-signature to trust HTTPS alone.",
      );
    }
    if (result.status !== 0)
      throw new Error(`gpgv did not accept SHASUMS256.txt for Node ${version}:\n${result.stderr}`);
    return shasums;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function pin(given: string, skipSignature: boolean): Promise<void> {
  const version = given.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`"${given}" is not a Node version such as 24.23.0.\n${USAGE}`);
  if (Number(version.split(".")[0]) !== NODE_MAJOR) {
    throw new Error(
      `Node ${version} is another major. Raising the floor changes floor= in apps/plugin/launcher/arcue and arcue-node.cmd, NODE_MAJOR in apps/plugin/src/node-pins.ts and apps/cli/src/run.ts, target in apps/cli/vite.config.ts, and "Node ${NODE_MAJOR} or later" in USAGE, SKILL.md and apps/plugin/README.md; node-pins.test.ts lists them.`,
    );
  }
  await checkRelease(version);
  const text = pinsFromShasums(version, await verifiedShasums(version, skipSignature));
  parseNodePins(text);
  const previous = await readFile(pinsPath, "utf8")
    .then((old) => parseNodePins(old).version)
    .catch(() => "none");
  await writeFile(pinsPath, text);
  console.log(
    `Pinned Node ${version} (was ${previous}). Run pnpm test and commit apps/plugin/launcher/${NODE_PINS_FILE}.`,
  );
}

async function sha256Of(url: string): Promise<string> {
  const response = await download(url);
  const hash = createHash("sha256");
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`Could not download ${withoutLogin(url)}: the response has no body.`);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

async function check(): Promise<boolean> {
  const { version, sums } = parseNodePins(await readFile(pinsPath, "utf8"));
  const mirror = (process.env.ARCUE_NODE_MIRROR ?? DIST).replace(/\/$/, "");
  let ok = true;
  for (const name of archiveNames(version)) {
    const pinned = sums.get(name) ?? "";
    const actual = await sha256Of(`${mirror}/v${version}/${name}`);
    if (actual === pinned) {
      console.log(`ok ${name}`);
    } else {
      console.log(`${name}: expected ${pinned}, got ${actual}`);
      ok = false;
    }
  }
  return ok;
}

async function main(args: string[]): Promise<number> {
  if (args.includes("--check")) {
    if (args.length !== 1) throw new Error(`--check takes no version.\n${USAGE}`);
    return (await check()) ? 0 : 1;
  }
  const skipSignature = args.includes("--skip-signature");
  const rest = args.filter((arg) => arg !== "--skip-signature");
  if (rest.length !== 1 || rest[0]?.startsWith("-")) throw new Error(USAGE);
  await pin(rest[0] ?? "", skipSignature);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
