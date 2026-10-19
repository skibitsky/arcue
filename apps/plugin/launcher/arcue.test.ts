import { type ChildProcess, execFile, execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lf } from "../src/assemble";
import { NODE_ARCHIVES, NODE_PINS_FILE } from "../src/node-pins";

const VERSION = "24.1.0";
const TOOLS = [
  "sh",
  "dash",
  "bash",
  "uname",
  "dirname",
  "readlink",
  "cat",
  "mkdir",
  "mktemp",
  "mv",
  "rm",
  "find",
  "id",
  "ls",
  "sleep",
  "tar",
  "xz",
  "gzip",
  "curl",
  "wget",
  "sha256sum",
  "shasum",
  "openssl",
  "sw_vers",
  "getconf",
];
const SHELLS = ["sh", "dash", "bash"];
const ZEROS = "0".repeat(64);
const source = fileURLToPath(new URL("arcue", import.meta.url));

type Archive = (typeof NODE_ARCHIVES)[number];
type MirrorMode = "normal" | "corrupt" | "404" | "trickle";

interface Mirror {
  url: string;
  mode: MirrorMode;
  requests: string[];
  readonly socketClosed: Promise<void>;
  close(): Promise<void>;
}

interface Result {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

interface FakeNode {
  version?: string;
  fails?: boolean;
  cr?: boolean;
  trapTerm?: boolean;
}

interface LaunchOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
  shell?: string;
  path?: string;
  umask?: string;
  script?: string;
}

function hostTool(name: string): string | undefined {
  for (const folder of (process.env.PATH ?? "").split(delimiter)) {
    if (!folder.startsWith("/")) continue;
    const candidate = join(folder, name);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return undefined;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const corrupted = (data: Buffer) => {
  const copy = Buffer.from(data);
  copy[copy.length - 1] = (copy[copy.length - 1] ?? 0) ^ 0xff;
  return copy;
};

function fakeNodeScript({ version = `v${VERSION}`, fails, cr, trapTerm }: FakeNode = {}): string {
  const versionLine = fails
    ? `printf '%s\\n' "version 'GLIBC_2.28' not found" >&2; exit 1`
    : cr
      ? `printf '%s\\r\\n' '${version}'; exit 0`
      : `printf '%s\\n' '${version}'; exit 0`;
  const run = trapTerm
    ? `trap ': >"$ARCUE_TEST_ARGV.term"; exit 0' TERM
: >"$ARCUE_TEST_ARGV.started"
while :; do sleep 1; done`
    : "";
  return `#!/bin/sh
if [ "$1" = --version ]; then
  [ -z "$NODE_OPTIONS" ] || exit 9
  ${versionLine}
fi
printf '%s\\0' "$0" "$@" >"$ARCUE_TEST_ARGV"
printf '%s|%s|%s' "$NODE_OPTIONS" "$(umask)" "$PATH" >"$ARCUE_TEST_ARGV.env"
${run}
`;
}

async function fakeNode(path: string, options: FakeNode = {}): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, fakeNodeScript(options), { flag: "wx", mode: 0o755 });
}

async function writeFake(path: string, text: string): Promise<void> {
  await writeFile(path, text, { flag: "wx", mode: 0o755 });
}

function startMirror(files: ReadonlyMap<string, Buffer>): Promise<Mirror> {
  const sockets = new Set<Socket>();
  let socketClosed: Promise<void> = new Promise(() => {});
  const server = createServer((request, response) => {
    mirror.requests.push(request.url ?? "");
    socketClosed = new Promise((resolve) => request.socket.once("close", () => resolve()));
    const prefix = `/v${VERSION}/`;
    const name = request.url?.startsWith(prefix) ? request.url.slice(prefix.length) : "";
    const file = files.get(name);
    if (!file || mirror.mode === "404") {
      response.writeHead(404).end();
      return;
    }
    const body = mirror.mode === "corrupt" ? corrupted(file) : file;
    response.writeHead(200, { "content-length": body.length });
    if (mirror.mode !== "trickle") {
      response.end(body);
      return;
    }
    let offset = 0;
    const timer = setInterval(() => {
      response.write(body.subarray(offset, offset + 4096));
      offset += 4096;
      if (offset >= body.length) {
        clearInterval(timer);
        response.end();
      }
    }, 200);
    response.on("close", () => clearInterval(timer));
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const mirror: Mirror = {
    url: "",
    mode: "normal",
    requests: [],
    get socketClosed() {
      return socketClosed;
    },
    close: () =>
      new Promise<void>((done) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => done());
      }),
  };
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      mirror.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve(mirror);
    });
  });
}

async function until(condition: () => boolean | Promise<boolean>, what: string, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const exited = (child: ChildProcess) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );

describe.skipIf(process.platform === "win32")("the shell launcher", { timeout: 30_000 }, () => {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  let toolsBase: string;
  let toolbox: string;
  const toolboxes = new Map<string, string>();
  let gnuTar = false;
  let plat: string;
  let ext: string;
  let size: number;
  const archives = new Map<string, Buffer>();
  const hashes = new Map<string, string>();

  const has = (tool: string) => existsSync(join(toolbox, tool));

  async function makeToolbox(folder: string, without: readonly string[]): Promise<void> {
    await mkdir(folder);
    for (const tool of TOOLS) {
      const found = hostTool(tool);
      if (found && !without.includes(tool)) await symlink(found, join(folder, tool));
    }
  }

  async function toolboxWithout(tools: string[]): Promise<string> {
    const key = [...tools].sort().join(",");
    const existing = toolboxes.get(key);
    if (existing) return existing;
    const folder = join(toolsBase, `without-${toolboxes.size}`);
    await makeToolbox(folder, tools);
    toolboxes.set(key, folder);
    return folder;
  }

  async function archive(
    archiveOs: string,
    arch: string,
    archiveExt: string,
    nodeScript: string,
    { ownerUid }: { ownerUid?: number } = {},
  ): Promise<Buffer> {
    const work = await mkdtemp(join(toolsBase, "archive-"));
    const top = `node-v${VERSION}-${archiveOs}-${arch}`;
    const windows = archiveOs === "win";
    const node = join(work, top, windows ? "node.exe" : join("bin", "node"));
    await mkdir(dirname(node), { recursive: true });
    await writeFile(node, nodeScript);
    await chmod(node, 0o755);
    if (!windows) {
      await writeFile(join(work, top, "bin", "npm"), "#!/bin/sh\n", { mode: 0o755 });
      await mkdir(join(work, top, "lib", "node_modules", "npm"), { recursive: true });
      await writeFile(join(work, top, "lib", "node_modules", "npm", "index.js"), "");
      await mkdir(join(work, top, "include", "node"), { recursive: true });
      await writeFile(join(work, top, "include", "node", "node.h"), "");
      await writeFile(join(work, top, "padding"), randomBytes(256 * 1024));
    }
    const file = join(work, `${top}.${archiveExt}`);
    const flags = windows ? "-cf" : archiveExt === "tar.xz" ? "-cJf" : "-czf";
    const owner = ownerUid === undefined ? [] : [`--owner=${ownerUid}`];
    execFileSync(hostTool("tar") ?? "tar", [...owner, flags, file, "-C", work, top]);
    const data = await readFile(file);
    await rm(work, { recursive: true, force: true });
    return data;
  }

  beforeAll(async () => {
    toolsBase = await realpath(await mkdtemp(join(tmpdir(), "arcue-toolbox-")));
    toolbox = join(toolsBase, "all");
    await makeToolbox(toolbox, []);
    const expected = os === "darwin" ? "Darwin" : "Linux";
    const kernel = execFileSync(join(toolbox, "uname"), ["-s"], { encoding: "utf8" }).trim();
    if (kernel !== expected) {
      throw new Error(
        `The host's uname -s prints "${kernel}", not "${expected}". Restore it before running the launcher tests.`,
      );
    }
    const machine = execFileSync(join(toolbox, "uname"), ["-m"], { encoding: "utf8" }).trim();
    const rosetta =
      os === "darwin" && machine === "x86_64"
        ? execFileSync("/usr/sbin/sysctl", ["-n", "hw.optional.arm64"], { encoding: "utf8" }).trim() === "1"
        : false;
    plat = `${os}-${machine === "arm64" || machine === "aarch64" || rosetta ? "arm64" : "x64"}`;
    ext = os === "linux" && !has("xz") ? "tar.gz" : "tar.xz";
    size = ext === "tar.gz" ? 60 : 30;
    gnuTar = execFileSync(join(toolbox, "tar"), ["--version"], { encoding: "utf8" }).includes("GNU tar");
    const exts = os === "linux" ? ["tar.gz", ...(has("xz") ? ["tar.xz"] : [])] : ["tar.xz"];
    for (const arch of ["arm64", "x64"]) {
      for (const archiveExt of exts) {
        const name = `node-v${VERSION}-${os}-${arch}.${archiveExt}`;
        archives.set(name, await archive(os, arch, archiveExt, fakeNodeScript()));
      }
    }
    archives.set(`node-v${VERSION}-win-x64.zip`, await archive("win", "x64", "zip", fakeNodeScript()));
    for (const [name, data] of archives) hashes.set(name, sha256(data));
  }, 60_000);

  afterAll(async () => {
    if (toolsBase) await rm(toolsBase, { recursive: true, force: true });
  });

  let temp: string;
  let scripts: string;
  let launcher: string;
  let fakes: string;
  let home: string;
  let cwd: string;
  let runtime: string;
  let argvFile: string;
  let mirror: Mirror;
  const extraMirrors: Mirror[] = [];

  const hostArchive = () => `node-v${VERSION}-${plat}.${ext}`;
  const install = () => join(runtime, `node-v${VERSION}-${plat}`);
  const pinned = () => join(install(), "node");

  async function writePins(overrides: Record<string, string> = {}): Promise<void> {
    const lines = NODE_ARCHIVES.map((archive: Archive) => {
      const name = `node-v${VERSION}-${archive}`;
      return `${overrides[name] ?? hashes.get(name) ?? ZEROS}  ${name}\n`;
    });
    await writeFile(join(scripts, NODE_PINS_FILE), lines.join(""));
  }

  async function seedRuntime(): Promise<void> {
    await mkdir(runtime, { mode: 0o700 });
  }

  beforeEach(async () => {
    temp = await realpath(await mkdtemp(join(tmpdir(), "arcue-launcher-")));
    scripts = join(temp, "my scripts");
    launcher = join(scripts, "arcue");
    fakes = join(temp, "fakes");
    home = join(temp, "home");
    cwd = join(temp, "cwd");
    runtime = join(temp, "runtime");
    argvFile = join(temp, "argv");
    for (const folder of [scripts, fakes, home, cwd]) await mkdir(folder);
    await writeFile(launcher, lf(await readFile(source, "utf8")), { mode: 0o755 });
    await chmod(launcher, 0o755);
    await writeFile(join(scripts, "arcue.js"), "placeholder\n");
    await writePins();
    mirror = await startMirror(archives);
  });

  afterEach(async () => {
    await mirror.close();
    for (const extra of extraMirrors.splice(0)) await extra.close();
    await rm(temp, { recursive: true, force: true });
  });

  function command(args: string[], options: LaunchOptions): { file: string; args: string[]; env: NodeJS.ProcessEnv } {
    const env: NodeJS.ProcessEnv = {
      PATH: options.path ?? `${fakes}:${toolbox}`,
      HOME: home,
      ARCUE_RUNTIME_DIR: runtime,
      ARCUE_NODE_MIRROR: mirror.url,
      ARCUE_TEST_ARGV: argvFile,
    };
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    const shell = join(toolbox, options.shell ?? "sh");
    const script = options.script ?? launcher;
    if (options.umask === undefined) return { file: shell, args: [script, ...args], env };
    return {
      file: join(toolbox, "sh"),
      args: ["-c", `umask ${options.umask}; exec "$@"`, "sh", shell, script, ...args],
      env,
    };
  }

  function launch(args: string[], options: LaunchOptions = {}): Promise<Result> {
    const { file, args: argv, env } = command(args, options);
    return new Promise((resolve) => {
      execFile(file, argv, { env, cwd: options.cwd ?? cwd, encoding: "utf8" }, (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, signal: null, stdout, stderr });
          return;
        }
        const code = typeof error.code === "number" ? error.code : null;
        resolve({ code, signal: error.signal ?? null, stdout, stderr });
      });
    });
  }

  function start(args: string[], options: LaunchOptions & { detached?: boolean } = {}): ChildProcess {
    const { file, args: argv, env } = command(args, options);
    return spawn(file, argv, { env, cwd: options.cwd ?? cwd, detached: options.detached, stdio: "ignore" });
  }

  async function argv(): Promise<string[]> {
    return (await readFile(argvFile, "utf8")).split("\0").slice(0, -1);
  }

  async function runtimeEntries(): Promise<string[]> {
    return existsSync(runtime) ? ((await readdir(runtime, { recursive: true })) as string[]).sort() : [];
  }

  const noNodeMessage = (found: string, root = runtime, mb = size) =>
    `Arcue needs Node 24 or later, and ${found}. Ask the user before you run sh "${launcher}" setup: it downloads Node ${VERSION} from ${mirror.url} (about ${mb} MB) into ${root}, once. Nothing was downloaded.\n`;

  it("runs on the host's real platform, without node in its tool folder", () => {
    expect(() => execFileSync(join(toolbox, "sh"), ["-c", "command -v node"], { env: { PATH: toolbox } })).toThrow();
  });

  it("runs arcue.js on Node 24 or later from PATH, without reading the pins or contacting the mirror", async () => {
    await fakeNode(join(fakes, "node"), { version: "v24.0.0" });
    await writeFile(join(scripts, NODE_PINS_FILE), "garbage\n");

    const result = await launch(["inspect", "x"]);

    expect(result.code, result.stderr).toBe(0);
    expect(await argv()).toEqual([join(fakes, "node"), join(scripts, "arcue.js"), "inspect", "x"]);
    expect(mirror.requests).toEqual([]);
    expect(existsSync(runtime)).toBe(false);
  });

  it.for(SHELLS)("passes every argument through unchanged under %s", async (shell, context) => {
    if (!has(shell)) context.skip();
    await fakeNode(join(fakes, "node"));
    const args = [
      "open",
      "My Models/Hero.fbx",
      "--clip",
      "Armature|Walk",
      'a"b',
      "it's",
      "100%PATH%",
      "$HOME",
      "`id`",
      "*",
      "-n",
      "--",
      "",
      "two\nlines",
      "ünïcødé",
      "!z",
      "^q",
      "x&y",
      "semi;colon",
      "back\\slash",
    ];

    const result = await launch(args, { shell });

    expect(result.code, result.stderr).toBe(0);
    expect((await argv()).slice(2)).toEqual(args);
  });

  it("gives arcue.js the caller's PATH, NODE_OPTIONS and umask", async () => {
    await fakeNode(join(fakes, "node"));
    const path = `${fakes}::${toolbox}`;

    const result = await launch(["status"], { path, env: { NODE_OPTIONS: "--bogus" }, umask: "002" });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(`${argvFile}.env`, "utf8")).toBe(`--bogus|0002|${path}`);
  });

  it("execs node, so a signal for the launcher reaches node", async () => {
    await fakeNode(join(fakes, "node"), { trapTerm: true });

    const child = start(["serve"]);
    const exit = exited(child);
    await until(() => existsSync(`${argvFile}.started`), "the fake node to start");
    child.kill("SIGTERM");

    expect(await exit).toEqual({ code: 0, signal: null });
    expect(existsSync(`${argvFile}.term`)).toBe(true);
  });

  it("exits with 3 and downloads nothing when there is no Node", async () => {
    const result = await launch(["inspect", "x"]);

    expect(result.code).toBe(3);
    expect(result.stderr).toBe(noNodeMessage("there is none on PATH"));
    expect(mirror.requests).toEqual([]);
    expect(existsSync(runtime)).toBe(false);
  });

  it("exits with 3 when node on PATH is v22.12.0, and names that version", async () => {
    await fakeNode(join(fakes, "node"), { version: "v22.12.0" });

    const result = await launch(["inspect", "x"]);

    expect(result.code).toBe(3);
    expect(result.stderr).toBe(noNodeMessage("node on PATH is v22.12.0"));
  });

  it("says when node on PATH does not run", async () => {
    await fakeNode(join(fakes, "node"), { fails: true });

    const result = await launch(["inspect", "x"]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain(`node on PATH (${join(fakes, "node")}) does not run`);
  });

  it("sets up the pinned Node and keeps only the binary, under a group-writable umask", async () => {
    const result = await launch(["setup"], { umask: "002" });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`Node ${VERSION} for Arcue is ready in ${install()}.\n`);
    expect(result.stderr).toBe(`Downloading ${mirror.url}/v${VERSION}/${hostArchive()}\n`);
    expect(await runtimeEntries()).toEqual([`node-v${VERSION}-${plat}`, `node-v${VERSION}-${plat}/node`]);
    for (const path of [runtime, install(), pinned()]) expect((await stat(path)).mode & 0o777, path).toBe(0o755);

    const next = await launch(["inspect", "x"], { umask: "002" });
    expect(next.code, next.stderr).toBe(0);
    expect((await argv())[0]).toBe(pinned());
    expect(mirror.requests).toHaveLength(1);
  });

  it("says Node is already set up, and downloads nothing, on a second setup", async () => {
    expect((await launch(["setup"])).code).toBe(0);

    const again = await launch(["setup"]);

    expect(again.code).toBe(0);
    expect(again.stdout).toBe(`Node ${VERSION} for Arcue is already set up in ${install()}.\n`);
    expect(mirror.requests).toHaveLength(1);
  });

  it("says setup has nothing to do when PATH has Node 24, without reading the pins or the runtime folder", async () => {
    await fakeNode(join(fakes, "node"), { version: "v24.0.0" });
    await writeFile(join(scripts, NODE_PINS_FILE), "garbage\n");

    const result = await launch(["setup"], { env: { ARCUE_RUNTIME_DIR: "rel" } });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      `Node v24.0.0 on PATH (${join(fakes, "node")}) runs Arcue, so setup has nothing to download.\n`,
    );
    expect(existsSync(runtime)).toBe(false);
    expect(mirror.requests).toEqual([]);
  });

  it("refuses arguments to setup with exit 2", async () => {
    const result = await launch(["setup", "now"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toBe('"arcue setup" takes no arguments, got "now".\n');
  });

  it("deletes a download whose checksum does not match, and installs nothing", async () => {
    mirror.mode = "corrupt";

    const result = await launch(["setup"]);

    expect(result.code).toBe(1);
    const data = archives.get(hostArchive()) ?? Buffer.alloc(0);
    expect(result.stderr).toContain(`Expected ${sha256(data)}, got ${sha256(corrupted(data))}.`);
    expect(await runtimeEntries()).toEqual([]);
  });

  it("reports a 404 and a refused connection with the URL, and leaves nothing behind", async () => {
    mirror.mode = "404";
    const missing = await launch(["setup"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain(`Could not download ${mirror.url}/v${VERSION}/${hostArchive()}: `);

    const refused = await launch(["setup"], { env: { ARCUE_NODE_MIRROR: "http://127.0.0.1:9" } });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(`Could not download http://127.0.0.1:9/v${VERSION}/${hostArchive()}: `);
    expect(await runtimeEntries()).toEqual([]);
  });

  it("treats a cached Node that does not run as missing, and setup replaces it", async () => {
    await seedRuntime();
    await mkdir(install());
    await writeFile(pinned(), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 1, 2, 3, 0, 0xff]), { mode: 0o755 });

    const broken = await launch(["inspect", "x"]);
    expect(broken.code).toBe(3);
    expect(broken.stderr).toContain(`The Node in ${install()} does not run.`);

    expect((await launch(["setup"])).code).toBe(0);
    const fixed = await launch(["inspect", "x"]);
    expect(fixed.code, fixed.stderr).toBe(0);
    expect((await argv())[0]).toBe(pinned());
  });

  it("reports a downloaded Node that does not run, with its output, and installs nothing", async () => {
    const data = await archive(os, plat.split("-")[1] ?? "x64", ext, fakeNodeScript({ fails: true }));
    const failing = await startMirror(new Map([[hostArchive(), data]]));
    extraMirrors.push(failing);
    await writePins({ [hostArchive()]: sha256(data) });

    const result = await launch(["setup"], { env: { ARCUE_NODE_MIRROR: failing.url } });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("The Node that setup downloaded does not run here: version 'GLIBC_2.28' not found");
    expect(await runtimeEntries()).toEqual([]);
  });

  it("keeps using an older cached Node 24 until setup installs the pinned one, which removes the older one", async () => {
    await seedRuntime();
    const older = join(runtime, `node-v24.0.0-${plat}`, "node");
    await fakeNode(older, { version: "v24.0.0" });
    await fakeNode(join(runtime, `node-v23.0.0-${plat}`, "node"), { version: "v23.0.0" });

    const result = await launch(["inspect", "x"]);
    expect(result.code, result.stderr).toBe(0);
    expect((await argv())[0]).toBe(older);
    expect(mirror.requests).toEqual([]);

    expect((await launch(["setup"])).code).toBe(0);
    expect(await readdir(runtime)).toEqual([`node-v${VERSION}-${plat}`]);
  });

  it("keeps one working Node when 8 setups run at once", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => launch(["setup"])));

    for (const result of results) expect(result.code, result.stderr).toBe(0);
    expect(await runtimeEntries()).toEqual([`node-v${VERSION}-${plat}`, `node-v${VERSION}-${plat}/node`]);
  });

  it("stops promptly and removes its download on SIGTERM, SIGINT and SIGHUP", async () => {
    mirror.mode = "trickle";
    const cases = [
      { signal: "SIGINT", group: true, code: 130 },
      { signal: "SIGHUP", group: true, code: 129 },
      { signal: "SIGTERM", group: false, code: 143 },
    ] as const;
    for (const { signal, group, code } of cases) {
      const before = mirror.requests.length;
      const child = start(["setup"], { detached: true });
      const exit = exited(child);
      const pid = child.pid ?? 0;
      await until(
        async () =>
          mirror.requests.length > before &&
          existsSync(runtime) &&
          (await readdir(runtime)).some((entry) => entry.startsWith(".setup-")),
        "setup to start downloading",
      );
      const closed = mirror.socketClosed;
      const sent = Date.now();
      process.kill(group ? -pid : pid, signal);

      expect(await exit, signal).toEqual({ code, signal: null });
      expect(Date.now() - sent, signal).toBeLessThan(2000);
      await expect(closed).resolves.toBeUndefined();
      expect(
        (await readdir(runtime)).filter((entry) => entry.startsWith(".setup-")),
        signal,
      ).toEqual([]);
    }
  });

  it("removes .setup folders more than a day old and keeps newer ones", async () => {
    await seedRuntime();
    const old = join(runtime, ".setup-old");
    const recent = join(runtime, ".setup-recent");
    const nested = join(runtime, "other", ".setup-nested");
    await mkdir(old);
    await mkdir(recent);
    await mkdir(nested, { recursive: true });
    const now = Date.now() / 1000;
    await utimes(old, now - 3 * 86400, now - 3 * 86400);
    await utimes(recent, now - 3600, now - 3600);
    await utimes(nested, now - 3 * 86400, now - 3 * 86400);

    expect((await launch(["setup"])).code).toBe(0);

    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(nested)).toBe(true);
  });

  it.for(SHELLS)(
    "never runs a node, sha256sum or xz planted in the working folder, under %s",
    async (shell, context) => {
      if (!has(shell)) context.skip();
      const markers = join(temp, "markers");
      await writeFake(join(cwd, "node"), `#!/bin/sh\n: >"${markers}-node"\necho v99.0.0\n`);
      const pin = hashes.get(hostArchive()) ?? ZEROS;
      await writeFake(join(cwd, "sha256sum"), `#!/bin/sh\n: >"${markers}-sha256sum"\necho '${pin}  -'\n`);
      await writeFake(join(cwd, "xz"), `#!/bin/sh\n: >"${markers}-xz"\n`);
      const path = `:${await toolboxWithout(["sha256sum", "shasum", "openssl"])}`;
      mirror.mode = "corrupt";

      const run = await launch(["inspect", "x"], { shell, path });
      expect(run.code, run.stderr).toBe(3);
      const setup = await launch(["setup"], { shell, path });
      expect(setup.code).toBe(1);
      expect(setup.stderr).toBe("Setup needs sha256sum, shasum or openssl to check the download.\n");

      expect(mirror.requests).toEqual([]);
      for (const tool of ["node", "sha256sum", "xz"]) expect(existsSync(`${markers}-${tool}`), tool).toBe(false);
    },
  );

  it("refuses a mirror that is not http or https, a relative ARCUE_RUNTIME_DIR, and a damaged pin file", async () => {
    for (const value of ["file:///etc", "-K/etc/passwd"]) {
      const result = await launch(["setup"], { env: { ARCUE_NODE_MIRROR: value } });
      expect(result.code, value).toBe(1);
      expect(result.stderr).toBe("ARCUE_NODE_MIRROR must start with https:// or http://.\n");
    }
    for (const args of [["inspect", "x"], ["setup"]]) {
      const result = await launch(args, { env: { ARCUE_RUNTIME_DIR: "rel" } });
      expect(result.code, args[0]).toBe(1);
      expect(result.stderr).toBe('ARCUE_RUNTIME_DIR must be an absolute path, got "rel".\n');
    }
    await writePins({ [hostArchive()]: "a".repeat(63) });
    const damaged = await launch(["setup"]);
    expect(damaged.code).toBe(1);
    expect(damaged.stderr).toBe(
      `Reinstall the Arcue plugin: ${join(scripts, NODE_PINS_FILE)} is missing or damaged.\n`,
    );
    expect(mirror.requests).toEqual([]);

    await fakeNode(join(fakes, "node"));
    expect((await launch(["inspect", "x"], { env: { ARCUE_RUNTIME_DIR: "rel" } })).code).toBe(0);
  });

  it("refuses a runtime folder that other users can change", async () => {
    await seedRuntime();
    await chmod(runtime, 0o777);
    const message = `Arcue does not use ${runtime}, because other users can change it. Set ARCUE_RUNTIME_DIR to a folder that only you can change.\n`;

    for (const args of [["inspect", "x"], ["setup"]]) {
      const result = await launch(args);
      expect(result.code, args[0]).toBe(1);
      expect(result.stderr).toBe(message);
    }
    expect(mirror.requests).toEqual([]);
  });

  it("refuses a runtime folder inside a folder that other users can change", async () => {
    const shared = join(temp, "shared");
    await mkdir(shared);
    await chmod(shared, 0o777);
    const inside = join(shared, "runtime");
    await mkdir(inside, { mode: 0o700 });
    await fakeNode(join(inside, `node-v${VERSION}-${plat}`, "node"));

    for (const args of [["inspect", "x"], ["setup"]]) {
      const result = await launch(args, { env: { ARCUE_RUNTIME_DIR: inside } });
      expect(result.code, args[0]).toBe(1);
      expect(result.stderr).toBe(
        `Arcue does not use ${inside}, because other users can change it. Set ARCUE_RUNTIME_DIR to a folder that only you can change.\n`,
      );
    }
    expect(existsSync(argvFile)).toBe(false);
    expect(mirror.requests).toEqual([]);
  });

  it.runIf(process.getuid?.() === 0)("refuses a runtime folder through a link that another user owns", async () => {
    await seedRuntime();
    await fakeNode(pinned());
    const link = join(temp, "link");
    await symlink(runtime, link);
    execFileSync(hostTool("chown") ?? "chown", ["-h", "4242:4242", link]);

    const result = await launch(["inspect", "x"], { env: { ARCUE_RUNTIME_DIR: link } });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Arcue does not use ${link}, because other users can change it.`);
    expect(existsSync(argvFile)).toBe(false);
  });

  it("never prints the user name and password in ARCUE_NODE_MIRROR", async () => {
    const withLogin = mirror.url.replace("http://", "http://user:secret@");
    const results = [await launch(["inspect", "x"], { env: { ARCUE_NODE_MIRROR: withLogin } })];
    mirror.mode = "404";
    results.push(await launch(["setup"], { env: { ARCUE_NODE_MIRROR: withLogin } }));
    mirror.mode = "corrupt";
    results.push(await launch(["setup"], { env: { ARCUE_NODE_MIRROR: withLogin } }));
    mirror.mode = "normal";
    results.push(await launch(["setup"], { env: { ARCUE_NODE_MIRROR: withLogin } }));

    expect(results.map((result) => result.code)).toEqual([3, 1, 1, 0]);
    expect(results[0]?.stderr).toBe(noNodeMessage("there is none on PATH"));
    expect(results[3]?.stderr).toBe(`Downloading ${mirror.url}/v${VERSION}/${hostArchive()}\n`);
    for (const result of results) expect(result.stdout + result.stderr).not.toMatch(/user:|secret/);
    expect(mirror.requests).toHaveLength(3);
  });

  it.runIf(process.platform === "linux")("downloads the .tar.gz build on Linux without xz", async () => {
    const path = `${fakes}:${await toolboxWithout(["xz"])}`;

    const run = await launch(["inspect", "x"], { path });
    expect(run.stderr).toContain("(about 60 MB)");
    const setup = await launch(["setup"], { path });

    expect(setup.code, setup.stderr).toBe(0);
    expect(mirror.requests).toEqual([`/v${VERSION}/node-v${VERSION}-${plat}.tar.gz`]);
  });

  it.skipIf(!hostTool("wget"))("falls back to wget without curl", async () => {
    const path = `${fakes}:${await toolboxWithout(["curl"])}`;

    const result = await launch(["setup"], { path });

    expect(result.code, result.stderr).toBe(0);
    expect(mirror.requests).toHaveLength(1);
  });

  it.skipIf(!hostTool("wget"))("reports wget's error, and leaves no wget-log in the working folder", async () => {
    const path = `${fakes}:${await toolboxWithout(["curl"])}`;
    mirror.mode = "trickle";
    const child = start(["setup"], { path, detached: true });
    const exit = exited(child);
    const downloaded = async () => {
      const stages = existsSync(runtime) ? (await readdir(runtime)).filter((entry) => entry.startsWith(".setup-")) : [];
      const archives = stages.map((stage) => join(runtime, stage, hostArchive()));
      return archives.some((file) => existsSync(file) && statSync(file).size >= 8192);
    };
    await until(downloaded, "wget to start downloading");
    process.kill(-(child.pid ?? 0), "SIGHUP");
    expect(await exit).toEqual({ code: 129, signal: null });
    expect(await readdir(cwd)).toEqual([]);

    mirror.mode = "404";
    const missing = await launch(["setup"], { path });
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain(`Could not download ${mirror.url}/v${VERSION}/${hostArchive()}: ERROR 404: `);
    const refused = await launch(["setup"], { path, env: { ARCUE_NODE_MIRROR: "http://127.0.0.1:9" } });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(": failed: Connection refused. Setup needs network access");
  });

  it("asks for curl or wget, or for a SHA-256 tool, before downloading", async () => {
    const noDownloader = await launch(["setup"], { path: `${fakes}:${await toolboxWithout(["curl", "wget"])}` });
    expect(noDownloader.code).toBe(1);
    expect(noDownloader.stderr).toBe("Setup needs curl or wget to download Node.\n");

    const noHasher = await launch(["setup"], {
      path: `${fakes}:${await toolboxWithout(["sha256sum", "shasum", "openssl"])}`,
    });
    expect(noHasher.code).toBe(1);
    expect(noHasher.stderr).toBe("Setup needs sha256sum, shasum or openssl to check the download.\n");
    expect(mirror.requests).toEqual([]);
  });

  it("picks the default cache folder for the platform", async () => {
    const roots =
      os === "linux"
        ? [
            { env: { XDG_CACHE_HOME: join(temp, "xdg") }, root: join(temp, "xdg", "Arcue", "runtime") },
            { env: { XDG_CACHE_HOME: "rel" }, root: join(home, ".cache", "Arcue", "runtime") },
          ]
        : [{ env: {}, root: join(home, "Library", "Caches", "Arcue", "runtime") }];

    for (const { env, root } of roots) {
      const result = await launch(["inspect", "x"], { env: { ...env, ARCUE_RUNTIME_DIR: undefined } });
      expect(result.code).toBe(3);
      expect(result.stderr).toBe(noNodeMessage("there is none on PATH", root));
    }
  });

  it("finds arcue.js however it is started", async () => {
    await fakeNode(join(fakes, "node"));
    const links = join(cwd, "bin");
    await mkdir(links);
    await symlink(join("..", "..", "my scripts", "arcue"), join(links, "arcue"));
    const starts = [
      { script: join(links, "arcue"), cwd },
      { script: join("my scripts", "arcue"), cwd: temp },
      { script: join("..", "my scripts", "arcue"), cwd },
    ];

    for (const how of starts) {
      const result = await launch(["status"], how);
      expect(result.code, `${how.script}: ${result.stderr}`).toBe(0);
      expect((await argv())[1]).toBe(join(scripts, "arcue.js"));
    }
  });

  it("accepts a node that prints a carriage return after its version", async () => {
    await seedRuntime();
    await fakeNode(pinned(), { cr: true });

    const result = await launch(["inspect", "x"]);

    expect(result.code, result.stderr).toBe(0);
    expect((await argv())[0]).toBe(pinned());
    const setup = await launch(["setup"]);
    expect(setup.stdout).toBe(`Node ${VERSION} for Arcue is already set up in ${install()}.\n`);
    expect(mirror.requests).toEqual([]);
  });

  it("runs as Git Bash on Windows with System32's curl.exe and tar.exe", async () => {
    const system32 = join(temp, "System32");
    await mkdir(system32);
    await symlink(hostTool("curl") ?? "curl", join(system32, "curl.exe"));
    await symlink(hostTool("tar") ?? "tar", join(system32, "tar.exe"));
    await writeFake(
      join(fakes, "uname"),
      `#!/bin/sh
case $1 in -s) echo MINGW64_NT-10.0-26100 ;; -m) echo x86_64 ;; esac
`,
    );
    await writeFake(
      join(fakes, "cygpath"),
      `#!/bin/sh
mode=$1
shift
[ "$1" = -- ] && shift
case $mode in
-S) printf '%s\\n' "$FAKE_SYSTEM32" ;;
-w) printf '%s\\n' "$1" ;;
-u)
  case $1 in
    [A-Za-z]:\\\\*)
      upper=ABCDEFGHIJKLMNOPQRSTUVWXYZ lower=abcdefghijklmnopqrstuvwxyz
      drive=\${1%%:*} rest=\${1#?:} out=''
      before=\${upper%%"$drive"*}
      if [ "$before" != "$upper" ]; then
        letters=$lower
        while [ \${#before} -gt 0 ]; do before=\${before#?} letters=\${letters#?}; done
        drive=\${letters%"\${letters#?}"}
      fi
      while [ -n "$rest" ]; do
        char=\${rest%"\${rest#?}"}
        rest=\${rest#?}
        [ "$char" = '\\' ] && char=/
        out=$out$char
      done
      printf '/%s%s\\n' "$drive" "$out"
      ;;
    *) printf '%s\\n' "$1" ;;
  esac
  ;;
esac
`,
    );
    const localAppData = join(temp, "Local App");
    const env = {
      ARCUE_RUNTIME_DIR: undefined,
      LOCALAPPDATA: localAppData,
      PROCESSOR_ARCHITECTURE: "AMD64",
      FAKE_SYSTEM32: system32,
    };
    expect(execFileSync(join(fakes, "cygpath"), ["-u", "--", "C:\\My Models\\Hero.fbx"], { encoding: "utf8" })).toBe(
      "/c/My Models/Hero.fbx\n",
    );
    const root = join(localAppData, "Arcue", "runtime");

    const before = await launch(["inspect", "x"], { env });
    expect(before.code).toBe(3);
    expect(before.stderr).toBe(noNodeMessage("there is none on PATH", root, 35));
    const setup = await launch(["setup"], { env });
    expect(setup.code, setup.stderr).toBe(0);
    expect(setup.stdout).toBe(`Node ${VERSION} for Arcue is ready in ${join(root, `node-v${VERSION}-win-x64`)}.\n`);
    expect(statSync(join(root, `node-v${VERSION}-win-x64`, "node.exe")).isFile()).toBe(true);
    const args = ["open", "C:\\My Models\\Hero.fbx", "--clip", "Armature|Walk"];
    const result = await launch(args, { env });
    expect(result.code, result.stderr).toBe(0);
    expect(await argv()).toEqual([
      join(root, `node-v${VERSION}-win-x64`, "node.exe"),
      join(scripts, "arcue.js"),
      ...args,
    ]);
  });

  it.runIf(process.getuid?.() === 0)(
    "unpacks the binary owned by the user who runs setup, not the archive's owner",
    async (context) => {
      if (!gnuTar) context.skip();
      const data = await archive(os, plat.split("-")[1] ?? "x64", ext, fakeNodeScript(), { ownerUid: 4242 });
      const owned = await startMirror(new Map([[hostArchive(), data]]));
      extraMirrors.push(owned);
      await writePins({ [hostArchive()]: sha256(data) });

      const result = await launch(["setup"], { env: { ARCUE_NODE_MIRROR: owned.url } });

      expect(result.code, result.stderr).toBe(0);
      expect((await stat(pinned())).uid).toBe(0);
    },
  );
});
