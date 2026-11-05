import { execFile, spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { MethodContext, Run } from "./update-install";
import {
  AFTER_EXIT_SCRIPT,
  debianArguments,
  installerKind,
  installMethod,
  pkexecFailure,
  relaunchArguments,
  removeLeftovers,
  setupArguments,
  stage,
  swapInPlace,
  teamOf,
} from "./update-install";

const execFileAsync = promisify(execFile);
const posix = process.platform !== "win32";

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function temporary(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "arcue-install-"));
  folders.push(folder);
  return folder;
}

function context(overrides: Partial<MethodContext> & Pick<MethodContext, "platform" | "execPath">): MethodContext {
  return {
    packaged: true,
    writable: async () => true,
    exists: async () => false,
    which: async () => null,
    ...overrides,
  };
}

/** A runner that answers each program from a table and records the calls. */
function fakeRunner(answers: Record<string, (args: readonly string[]) => string | Error>) {
  const calls: string[][] = [];
  const runner: Run = async (command, args) => {
    calls.push([command, ...args]);
    const answer = answers[command]?.(args) ?? "";
    if (answer instanceof Error) throw answer;
    return { stdout: answer, stderr: "" };
  };
  return { runner, calls };
}

describe("installMethod", () => {
  const app = "/Applications/Arcue.app/Contents/MacOS/Arcue";

  it("replaces a macOS app it may write, and offers a download where it may not", async () => {
    expect(await installMethod(context({ platform: "darwin", execPath: app }))).toEqual({
      kind: "bundle",
      target: "/Applications/Arcue.app",
    });
    const readOnly = async () => false;
    expect(await installMethod(context({ platform: "darwin", execPath: app, writable: readOnly }))).toMatchObject({
      kind: "manual",
      reason: expect.stringContaining("cannot replace itself in /Applications"),
    });
    const image = "/Volumes/Arcue/Arcue.app/Contents/MacOS/Arcue";
    expect(await installMethod(context({ platform: "darwin", execPath: image, writable: readOnly }))).toMatchObject({
      kind: "manual",
      reason: expect.stringContaining("not its disk image"),
    });
    const translocated = "/private/var/folders/x/AppTranslocation/1/d/Arcue.app/Contents/MacOS/Arcue";
    expect(await installMethod(context({ platform: "darwin", execPath: translocated }))).toMatchObject({
      kind: "manual",
      reason: expect.stringContaining("Applications folder"),
    });
  });

  it("runs the setup program of a Windows app that setup installed", async () => {
    const execPath = "C:\\Users\\Ana\\AppData\\Local\\Programs\\Arcue\\Arcue.exe";
    const installed = async (path: string) => path === "C:\\Users\\Ana\\AppData\\Local\\Programs\\Arcue\\unins000.exe";
    expect(await installMethod(context({ platform: "win32", execPath, exists: installed }))).toEqual({ kind: "setup" });
    expect(await installMethod(context({ platform: "win32", execPath }))).toMatchObject({ kind: "manual" });
  });

  it("installs the Debian package with pkexec, and replaces a tarball's folder it may write", async () => {
    const which = (found: string[]) => async (program: string) =>
      found.includes(program) ? `/usr/bin/${program}` : null;
    const deb = "/usr/lib/arcue/Arcue";
    expect(
      await installMethod(context({ platform: "linux", execPath: deb, which: which(["pkexec", "apt-get"]) })),
    ).toEqual({
      kind: "deb",
      command: "apt-get",
    });
    expect(
      await installMethod(context({ platform: "linux", execPath: deb, which: which(["pkexec", "dpkg"]) })),
    ).toEqual({
      kind: "deb",
      command: "dpkg",
    });
    expect(await installMethod(context({ platform: "linux", execPath: deb, which: which(["apt-get"]) }))).toMatchObject(
      {
        kind: "manual",
      },
    );
    const tarball = "/home/ana/Apps/Arcue-linux-x64/Arcue";
    expect(await installMethod(context({ platform: "linux", execPath: tarball }))).toEqual({
      kind: "folder",
      target: "/home/ana/Apps/Arcue-linux-x64",
    });
    expect(
      await installMethod(
        context({ platform: "linux", execPath: tarball, writable: async (path) => path !== "/home/ana/Apps" }),
      ),
    ).toMatchObject({ kind: "manual" });
  });

  it("only restarts an unpackaged app", async () => {
    const method = await installMethod(context({ platform: "linux", execPath: "/repo/electron", packaged: false }));
    expect(method).toEqual({ kind: "restart" });
    expect(installerKind(method, "linux")).toBe("tar");
    expect(installerKind({ kind: "manual", reason: "No." }, "linux")).toBeNull();
  });
});

describe.skipIf(!posix)("stage", () => {
  it("unpacks a tarball of the expected version", async () => {
    const folder = await temporary();
    const app = join(folder, "build", "Arcue-linux-x64");
    await mkdir(join(app, "resources", "app"), { recursive: true });
    await writeFile(join(app, "resources", "app", "package.json"), JSON.stringify({ version: "0.2.0" }));
    await writeFile(join(app, "Arcue"), "#!/bin/sh\n");
    await chmod(join(app, "Arcue"), 0o755);
    const tarball = join(folder, "Arcue-update.tar.gz");
    await execFileAsync("tar", ["-czf", tarball, "-C", join(folder, "build"), "Arcue-linux-x64"]);
    const staging = join(folder, "staging");
    await mkdir(staging);

    const staged = await stage({ kind: "folder", target: "/unused" }, tarball, staging, "0.2.0");
    expect(staged.path).toBe(join(staging, "extract", "Arcue-linux-x64"));
    expect((await stat(join(staged.path, "Arcue"))).mode & 0o111).not.toBe(0);
    await expect(stage({ kind: "folder", target: "/unused" }, tarball, staging, "0.3.0")).rejects.toThrow(
      "The update holds Arcue 0.2.0, not 0.3.0.",
    );
  });
});

describe("stage", () => {
  it("checks that a Debian package is Arcue's, of the expected version", async () => {
    const { runner } = fakeRunner({ "dpkg-deb": () => "Package: arcue\nVersion: 0.3.0~beta.1\n" });
    const method = { kind: "deb", command: "apt-get" } as const;
    await expect(stage(method, "/tmp/a.deb", "/tmp", "0.3.0-beta.1", runner)).resolves.toEqual({ path: "/tmp/a.deb" });
    await expect(stage(method, "/tmp/a.deb", "/tmp", "0.3.0", runner)).rejects.toThrow("not Arcue 0.3.0");
    const other = fakeRunner({ "dpkg-deb": () => "Package: other\nVersion: 0.3.0\n" });
    await expect(stage(method, "/tmp/a.deb", "/tmp", "0.3.0", other.runner)).rejects.toThrow("not Arcue's package");
  });

  it("copies the app out of the disk image and checks its version, signature and developer", async () => {
    const folder = await temporary();
    const plist = (args: readonly string[]) =>
      args[1] === "CFBundleIdentifier"
        ? "app.arcue.desktop\n"
        : args[1] === "CFBundleShortVersionString"
          ? "0.2.0\n"
          : "";
    const signedBy = (team: string) => (args: readonly string[]) =>
      args[0] === "-dv" ? `Executable=${args[2]}\nTeamIdentifier=${team}\n` : "";
    const method = { kind: "bundle", target: "/Applications/Arcue.app" } as const;

    const adHoc = fakeRunner({ plutil: plist, codesign: signedBy("not set") });
    await expect(stage(method, "/tmp/Arcue.dmg", folder, "0.2.0", adHoc.runner)).resolves.toEqual({
      path: join(folder, "Arcue.app"),
    });
    expect(adHoc.calls.map((call) => call.slice(0, 2).join(" "))).toEqual([
      "hdiutil attach",
      `ditto ${adHoc.calls[1]?.[1]}`,
      "hdiutil detach",
      "plutil -extract",
      "plutil -extract",
      "codesign --verify",
      "codesign -dv",
      "xattr -dr",
    ]);
    await expect(stage(method, "/tmp/Arcue.dmg", folder, "0.3.0", adHoc.runner)).rejects.toThrow(
      "The update holds Arcue 0.2.0, not 0.3.0.",
    );

    const teams = (args: readonly string[]) =>
      args[0] === "-dv"
        ? `TeamIdentifier=${args[2] === "/Applications/Arcue.app" ? "AAAA111111" : "BBBB222222"}\n`
        : "";
    const otherTeam = fakeRunner({ plutil: plist, codesign: teams });
    await expect(stage(method, "/tmp/Arcue.dmg", folder, "0.2.0", otherTeam.runner)).rejects.toThrow(
      "not signed by the developer who signed this Arcue",
    );

    const broken = fakeRunner({
      plutil: plist,
      codesign: (args) => (args[0] === "--verify" ? new Error("invalid signature") : ""),
    });
    await expect(stage(method, "/tmp/Arcue.dmg", folder, "0.2.0", broken.runner)).rejects.toThrow(
      "The update's signature does not verify: invalid signature",
    );
  });

  it("reads the Team ID codesign prints, which an ad hoc signature lacks", async () => {
    expect(await teamOf("/a", fakeRunner({ codesign: () => "TeamIdentifier=ABCDE12345\n" }).runner)).toBe("ABCDE12345");
    expect(await teamOf("/a", fakeRunner({ codesign: () => "TeamIdentifier=not set\n" }).runner)).toBeNull();
  });
});

describe.skipIf(process.platform !== "darwin")("stage on macOS", () => {
  it("copies an app signed ad hoc out of a real disk image and checks it", { timeout: 120_000 }, async () => {
    const folder = await temporary();
    const app = join(folder, "image", "Arcue.app");
    await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
    await copyFile("/usr/bin/true", join(app, "Contents", "MacOS", "Arcue"));
    const fields = {
      CFBundleExecutable: "Arcue",
      CFBundleIdentifier: "app.arcue.desktop",
      CFBundlePackageType: "APPL",
      CFBundleShortVersionString: "0.2.0",
    };
    const entries = Object.entries(fields).map(([key, value]) => `<key>${key}</key><string>${value}</string>`);
    await writeFile(
      join(app, "Contents", "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>${entries.join("")}</dict></plist>\n`,
    );
    await execFileAsync("codesign", ["--force", "--sign", "-", app]);
    const running = join(folder, "Applications", "Arcue.app");
    await execFileAsync("ditto", [app, running]);
    const dmg = join(folder, "Arcue.dmg");
    for (let attempt = 1; ; attempt++) {
      try {
        await execFileAsync("hdiutil", [
          "create",
          "-volname",
          "Arcue",
          "-srcfolder",
          join(folder, "image"),
          "-format",
          "UDZO",
          dmg,
        ]);
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    const staging = join(folder, "staging");
    await mkdir(staging);

    const staged = await stage({ kind: "bundle", target: running }, dmg, staging, "0.2.0");
    expect(staged.path).toBe(join(staging, "Arcue.app"));
    await execFileAsync("codesign", ["--verify", "--deep", "--strict", staged.path]);
    expect(await readdir(staging)).toEqual(["Arcue.app"]);
    await expect(stage({ kind: "bundle", target: running }, dmg, staging, "0.3.0")).rejects.toThrow("not 0.3.0");
  });
});

describe.skipIf(!posix)("swapInPlace", () => {
  it("puts the new app where the old one was and keeps the old one aside until it is removed", async () => {
    const folder = await temporary();
    const target = join(folder, "Arcue.app");
    const staged = join(folder, "staging", "Arcue.app");
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "version"), "0.1.0");
    await mkdir(staged, { recursive: true });
    await writeFile(join(staged, "version"), "0.2.0");

    const old = await swapInPlace(target, staged, "darwin");
    expect(await readFile(join(target, "version"), "utf8")).toBe("0.2.0");
    expect(await readFile(join(old, "version"), "utf8")).toBe("0.1.0");
    expect(old).toMatch(/\/\.Arcue\.app\.old-[0-9a-f]{12}$/);
    await stat(staged).then(
      () => expect.fail("The staged app is still there."),
      () => undefined,
    );

    await removeLeftovers(target);
    expect(await readdir(folder)).toEqual(["Arcue.app", "staging"]);
  });

  it("leaves the old app in place when the new one cannot move in", async () => {
    const folder = await temporary();
    const target = join(folder, "Arcue-linux-x64");
    await mkdir(target);
    await writeFile(join(target, "version"), "0.1.0");
    await expect(swapInPlace(target, join(folder, "missing"), "linux")).rejects.toThrow();
    expect(await readFile(join(target, "version"), "utf8")).toBe("0.1.0");
    expect(await readdir(folder)).toEqual(["Arcue-linux-x64"]);
  });
});

describe("arguments", () => {
  it("runs setup silently, starting Arcue again only for a restart", () => {
    expect(setupArguments("C:\\logs\\update-setup.log", true)).toEqual([
      "/VERYSILENT",
      "/SUPPRESSMSGBOXES",
      "/NORESTART",
      "/LOG=C:\\logs\\update-setup.log",
      "/RELAUNCH",
    ]);
    expect(setupArguments("log", false)).not.toContain("/RELAUNCH");
  });

  it("installs the package with apt-get, or dpkg without it, and names a closed password prompt", () => {
    expect(debianArguments("apt-get", "/tmp/a.deb")).toEqual(["apt-get", "install", "--yes", "--", "/tmp/a.deb"]);
    expect(debianArguments("dpkg", "/tmp/a.deb")).toEqual(["dpkg", "--install", "--", "/tmp/a.deb"]);
    expect(pkexecFailure(Object.assign(new Error("failed"), { code: 126 }))).toBe("the password prompt was closed");
    expect(pkexecFailure(new Error("dpkg: error"))).toBe("dpkg: error");
  });

  it("starts the next instance with the switches it had, and without the files it opened", () => {
    const argv = [
      "/Applications/Arcue.app/Contents/MacOS/Arcue",
      "-psn_0_1234",
      "--use-angle=swiftshader",
      "/a/Hero.fbx",
    ];
    expect(relaunchArguments(argv, true)).toEqual(["--use-angle=swiftshader"]);
    expect(relaunchArguments(["/repo/electron", "--inspect=0", "/repo/apps/desktop"], false)).toEqual([
      "--inspect=0",
      "/repo/apps/desktop",
    ]);
  });
});

describe.skipIf(!posix)("AFTER_EXIT_SCRIPT", () => {
  it("runs the program once the process it waits for has exited, with its arguments as they are", async () => {
    const folder = await temporary();
    const marker = join(folder, 'it\'s "done" $HOME');
    const waited = spawn(process.execPath, ["-e", "setTimeout(() => {}, 300)"]);
    const started = Date.now();
    await execFileAsync("/bin/sh", ["-c", AFTER_EXIT_SCRIPT, "test", String(waited.pid), "touch", marker]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(waited.exitCode).not.toBeNull();
    await stat(marker);
  });
});
