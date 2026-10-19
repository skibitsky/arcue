import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crlf, lf } from "../src/assemble";
import { NODE_ARCHIVES, NODE_MAJOR, NODE_PINS_FILE } from "../src/node-pins";

const version = process.versions.node;
const arch = process.arch === "arm64" ? "arm64" : "x64";
const folder = `node-v${version}-win-${arch}`;
const zipName = `${folder}.zip`;
const system32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
const gitSh = "C:\\Program Files\\Git\\bin\\sh.exe";
const ARGS = ["Armature|Walk", "my model.fbx", "100%PATH%", "a&b", "^c", "(d)", "!e"];

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(file: string, args: string[], options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): Promise<Result> {
  return new Promise((resolve) => {
    execFile(file, args, { ...options, encoding: "utf8", windowsHide: true }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : null) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

let temp: string;
let zip: Buffer;
let cleanPath: string;
let mirror: { url: string; mode: "normal" | "corrupt"; close(): Promise<void> };
const shells: string[] = [];

function startMirror(): Promise<typeof mirror> {
  return new Promise((resolve) => {
    const state = { mode: "normal" as "normal" | "corrupt" };
    const server: Server = createServer((request, response) => {
      if (request.url !== `/v${version}/${zipName}`) {
        response.writeHead(404).end();
        return;
      }
      const body = Buffer.from(zip);
      if (state.mode === "corrupt") body[body.length - 1] = (body[body.length - 1] ?? 0) ^ 0xff;
      response.writeHead(200, { "content-length": body.length }).end(body);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        get mode() {
          return state.mode;
        },
        set mode(value) {
          state.mode = value;
        },
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

async function makePlugin(scripts: string): Promise<void> {
  const source = fileURLToPath(new URL(".", import.meta.url));
  const cmd = crlf(await readFile(join(source, "arcue-node.cmd"), "utf8"));
  await mkdir(scripts, { recursive: true });
  await writeFile(join(scripts, "arcue-node.cmd"), cmd);
  await writeFile(join(scripts, "arcue-setup.cmd"), cmd);
  await writeFile(join(scripts, "arcue"), lf(await readFile(join(source, "arcue"), "utf8")));
  await writeFile(join(scripts, "arcue.js"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  const sum = createHash("sha256").update(zip).digest("hex");
  const pins = NODE_ARCHIVES.map((archive) => {
    const name = `node-v${version}-${archive}`;
    return `${name === zipName ? sum : "0".repeat(64)}  ${name}\n`;
  });
  await writeFile(join(scripts, NODE_PINS_FILE), pins.join(""));
}

const runsArcue = Number(version.split(".")[0]) >= NODE_MAJOR;

describe.runIf(process.platform === "win32" && runsArcue)("arcue-node.cmd and arcue-setup.cmd", () => {
  beforeAll(async () => {
    temp = await realpath(await mkdtemp(join(tmpdir(), "arcue-windows-")));
    const stage = join(temp, "zip");
    await mkdir(join(stage, folder), { recursive: true });
    await copyFile(process.execPath, join(stage, folder, "node.exe"));
    const made = await run(join(system32, "tar.exe"), ["-a", "-c", "-f", join(temp, zipName), "-C", stage, folder]);
    if (made.code !== 0) throw new Error(`tar.exe could not make ${zipName}: ${made.stderr}`);
    zip = await readFile(join(temp, zipName));
    const path = Object.entries(process.env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
    cleanPath = path
      .split(delimiter)
      .filter((entry) => entry !== "" && !existsSync(join(entry, "node.exe")))
      .join(delimiter);
    mirror = await startMirror();
    shells.push("powershell.exe");
    const pwsh = cleanPath
      .split(delimiter)
      .map((entry) => join(entry, "pwsh.exe"))
      .find((candidate) => existsSync(candidate));
    if (pwsh) shells.push(pwsh);
  }, 120_000);

  afterAll(async () => {
    await mirror?.close();
    if (temp) await rm(temp, { recursive: true, force: true });
  });

  let caseFolder: string;
  let scripts: string;
  let runtime: string;
  let cwd: string;

  beforeEach(async () => {
    caseFolder = await mkdtemp(join(temp, "case-"));
    scripts = join(caseFolder, "plugin", "scripts");
    runtime = join(caseFolder, "runtime");
    cwd = join(caseFolder, "cwd");
    await makePlugin(scripts);
    await mkdir(cwd);
    mirror.mode = "normal";
  });

  afterEach(async () => {
    await rm(caseFolder, { recursive: true, force: true });
  });

  function environment(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.toUpperCase() !== "PATH" && key.toUpperCase() !== "NODE_OPTIONS") env[key] = value;
    }
    env.Path = cleanPath;
    env.ARCUE_RUNTIME_DIR = runtime;
    env.ARCUE_NODE_MIRROR = mirror.url;
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    return env;
  }

  function powershell(
    shell: string,
    script: string,
    options: { env?: Record<string, string | undefined>; cwd?: string } = {},
  ): Promise<Result> {
    return run(shell, ["-NoProfile", "-NonInteractive", "-Command", `${script}; exit $LASTEXITCODE`], {
      env: environment(options.env),
      cwd: options.cwd ?? cwd,
    });
  }

  const nodeCmd = (folder = scripts) => quote(join(folder, "arcue-node.cmd"));
  const setupCmd = (folder = scripts) => quote(join(folder, "arcue-setup.cmd"));
  const lastLine = (text: string) => text.trim().split(/\r?\n/).at(-1)?.trim() ?? "";

  async function setUp(shell: string, env: Record<string, string | undefined> = {}, folder = scripts) {
    const result = await powershell(shell, `& ${setupCmd(folder)}`, { env });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("for Arcue is ready in");
    return result;
  }

  describe.each(["powershell.exe", "pwsh"])("in %s", (name) => {
    const shell = () => (name === "pwsh" ? shells[1] : shells[0]) ?? "";
    const skip = () => shell() === "";

    it("exits with 3 and prints nothing on stdout before setup", async (context) => {
      if (skip()) context.skip();
      const result = await powershell(shell(), `& ${nodeCmd()}`);

      expect(result.code).toBe(3);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain('arcue-setup.cmd" in PowerShell');
    }, 60_000);

    it("installs from the mirror, and arcue-node.cmd then prints that Node", async (context) => {
      if (skip()) context.skip();
      await setUp(shell());

      const printed = await powershell(shell(), `& ${nodeCmd()}`);
      expect(printed.code).toBe(0);
      expect(realpathSync.native(lastLine(printed.stdout))).toBe(
        realpathSync.native(join(runtime, folder, "node.exe")),
      );
      expect((await run(lastLine(printed.stdout), ["--version"])).stdout.trim()).toBe(`v${version}`);
      const again = await powershell(shell(), `& ${setupCmd()}`);
      expect(again.code).toBe(0);
      expect(again.stdout).toContain("is already set up in");
    }, 60_000);

    it("passes every argument to node.exe unchanged and never runs Walk.cmd", async (context) => {
      if (skip()) context.skip();
      await setUp(shell());
      await writeFile(join(cwd, "Walk.cmd"), '@echo ran> "%~dp0walk-ran.txt"\r\n');

      const result = await powershell(
        shell(),
        `& (& ${nodeCmd()}) ${quote(join(scripts, "arcue.js"))} ${ARGS.map(quote).join(" ")}`,
      );

      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(ARGS);
      expect(existsSync(join(cwd, "walk-ran.txt"))).toBe(false);
    }, 60_000);

    it("works from plugin and runtime folders whose paths have spaces, &, parentheses, ! and %", async (context) => {
      if (skip()) context.skip();
      const odd = join(caseFolder, "plugin & (x) 100% !", "scripts");
      await makePlugin(odd);
      const oddRuntime = join(caseFolder, "rt & (y) 50% !");
      await setUp(shell(), { ARCUE_RUNTIME_DIR: oddRuntime }, odd);

      const result = await powershell(
        shell(),
        `& (& ${nodeCmd(odd)}) ${quote(join(odd, "arcue.js"))} ${ARGS.map(quote).join(" ")}`,
        { env: { ARCUE_RUNTIME_DIR: oddRuntime } },
      );

      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(ARGS);
      expect(await readdir(oddRuntime)).toEqual([folder]);
    }, 60_000);

    it("looks node.exe up from its own folder", async (context) => {
      if (skip()) context.skip();
      await setUp(shell());
      await mkdir(join(cwd, "sub"));
      const later = join(caseFolder, "later");
      await mkdir(later);
      for (const copy of [cwd, join(cwd, "sub"), later]) await copyFile(process.execPath, join(copy, "node.exe"));

      const withLater = await powershell(shell(), `& ${nodeCmd()}`, {
        env: { Path: [".", "sub", later, cleanPath].join(delimiter) },
      });
      expect(realpathSync.native(lastLine(withLater.stdout))).toBe(realpathSync.native(join(later, "node.exe")));
      const without = await powershell(shell(), `& ${nodeCmd()}`, {
        env: { Path: [".", "sub", cleanPath].join(delimiter) },
      });
      expect(realpathSync.native(lastLine(without.stdout))).toBe(
        realpathSync.native(join(runtime, folder, "node.exe")),
      );
    }, 60_000);

    it("never runs a curl.bat, tar.bat or certutil.bat planted in the working folder", async (context) => {
      if (skip()) context.skip();
      for (const tool of ["curl", "tar", "certutil"]) {
        await writeFile(join(cwd, `${tool}.bat`), `@echo ran> "%~dp0${tool}-ran.txt"\r\n`);
      }

      await setUp(shell());

      for (const tool of ["curl", "tar", "certutil"]) expect(existsSync(join(cwd, `${tool}-ran.txt`))).toBe(false);
    }, 60_000);

    it("deletes a download whose checksum does not match, and installs nothing", async (context) => {
      if (skip()) context.skip();
      mirror.mode = "corrupt";

      const result = await powershell(shell(), `& ${setupCmd()}`);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("does not match the SHA-256 checksum");
      expect(await readdir(runtime)).toEqual([]);
    }, 60_000);

    it("refuses an ARCUE_RUNTIME_DIR with a quote or a relative path, and a mirror that is not http or https", async (context) => {
      if (skip()) context.skip();
      for (const value of [`${runtime}"x`, "rel\\x"]) {
        const result = await powershell(shell(), `& ${setupCmd()}`, { env: { ARCUE_RUNTIME_DIR: value } });
        expect(result.code, value).toBe(1);
        expect(result.stderr).toContain("ARCUE_RUNTIME_DIR must be an absolute path without quotes");
      }
      const result = await powershell(shell(), `& ${setupCmd()}`, { env: { ARCUE_NODE_MIRROR: "file:///C:/" } });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("ARCUE_NODE_MIRROR must start with https:// or http://");
      expect(existsSync(runtime)).toBe(false);
    }, 60_000);

    it("keeps an older cached Node working, and setup replaces it", async (context) => {
      if (skip()) context.skip();
      const older = join(runtime, `node-v24.0.0-win-${arch}`);
      await mkdir(older, { recursive: true });
      await copyFile(process.execPath, join(older, "node.exe"));

      const printed = await powershell(shell(), `& ${nodeCmd()}`);
      expect(printed.code).toBe(0);
      expect(realpathSync.native(lastLine(printed.stdout))).toBe(realpathSync.native(join(older, "node.exe")));
      await setUp(shell());

      expect(await readdir(runtime)).toEqual([folder]);
    }, 60_000);
  });

  it.skipIf(!existsSync(gitSh))(
    "shares the install with the shell launcher in Git Bash, which passes the same arguments unchanged",
    async () => {
      await setUp(shells[0] ?? "powershell.exe");

      const result = await run(gitSh, [join(scripts, "arcue"), ...ARGS], { env: environment(), cwd });

      expect(result.code, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(ARGS);
      expect(await readdir(runtime)).toEqual([folder]);
    },
    60_000,
  );

  it.runIf(process.env.CI === "true")(
    "ignores what a cmd AutoRun prints",
    async () => {
      const reg = join(system32, "reg.exe");
      const key = "HKCU\\Software\\Microsoft\\Command Processor";
      const saved = await run(reg, ["query", key, "/v", "AutoRun"]);
      const previous = saved.code === 0 ? /AutoRun\s+REG_\w+\s+(.*)$/m.exec(saved.stdout)?.[1]?.trim() : undefined;
      const autoRun = `echo v99.0.0& echo ${"0".repeat(64)}`;
      const added = await run(reg, ["add", key, "/v", "AutoRun", "/t", "REG_SZ", "/d", autoRun, "/f"]);
      expect(added.code, added.stderr).toBe(0);
      try {
        const shell = shells[0] ?? "powershell.exe";
        await setUp(shell);
        const again = await powershell(shell, `& ${setupCmd()}`);
        expect(again.stdout).toContain("is already set up in");
        const printed = await powershell(shell, `& ${nodeCmd()}`);
        expect(realpathSync.native(lastLine(printed.stdout))).toBe(
          realpathSync.native(join(runtime, folder, "node.exe")),
        );
      } finally {
        if (previous === undefined) await run(reg, ["delete", key, "/v", "AutoRun", "/f"]);
        else await run(reg, ["add", key, "/v", "AutoRun", "/t", "REG_SZ", "/d", previous, "/f"]);
      }
    },
    60_000,
  );
});
