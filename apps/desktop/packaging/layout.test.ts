import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { appLayout, installers, parseArch, parsePlatform, parseVersion, versionOfTag } from "./layout";

describe("parseVersion", () => {
  it("reads a release and a prerelease", () => {
    expect(parseVersion("1.2.0")).toEqual({ full: "1.2.0", numeric: "1.2.0", prerelease: false, debian: "1.2.0" });
    expect(parseVersion("1.3.0-beta.2")).toEqual({
      full: "1.3.0-beta.2",
      numeric: "1.3.0",
      prerelease: true,
      debian: "1.3.0~beta.2",
    });
    expect(parseVersion("0.1.0-rc").debian).toBe("0.1.0~rc");
  });

  it.each(["1.2", "v1.2.0", "01.2.0", "1.2.0-", "1.2.0-beta.2.1", "1.2.0+build", "1.2.0-be_ta"])(
    "refuses %s",
    (value) => {
      expect(() => parseVersion(value)).toThrow(/not a release version/);
    },
  );

  it("accepts the desktop app's version", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };

    expect(() => parseVersion(manifest.version)).not.toThrow();
  });
});

describe("versionOfTag", () => {
  it("is the app's version when the tag names it", () => {
    expect(versionOfTag("v1.3.0-beta.2", "1.3.0-beta.2").full).toBe("1.3.0-beta.2");
  });

  it("refuses a tag for another version", () => {
    expect(() => versionOfTag("v1.3.0", "1.2.0")).toThrow("The tag v1.3.0 does not name the desktop app's version");
    expect(() => versionOfTag("1.2.0", "1.2.0")).toThrow(/tag v1\.2\.0/);
  });
});

describe("the packaged app", () => {
  it("keeps the command line where the launchers look for it", () => {
    expect(appLayout("darwin")).toEqual({
      executable: "Arcue.app/Contents/MacOS/Arcue",
      cli: "Arcue.app/Contents/Resources/cli",
      command: "Arcue.app/Contents/Resources/bin/arcue",
    });
    expect(appLayout("linux")).toEqual({ executable: "Arcue", cli: "resources/cli", command: "bin/arcue" });
    expect(appLayout("win32")).toEqual({ executable: "Arcue.exe", cli: "resources/cli", command: "bin/arcue.exe" });
  });

  it("names each platform's installers without the version", () => {
    expect(installers("darwin", "arm64")).toEqual([{ kind: "dmg", file: "Arcue-mac-arm64.dmg" }]);
    expect(installers("win32", "x64")).toEqual([{ kind: "setup", file: "Arcue-win-x64-setup.exe" }]);
    expect(installers("linux", "x64")).toEqual([
      { kind: "deb", file: "Arcue-linux-amd64.deb" },
      { kind: "tar", file: "Arcue-linux-x64.tar.gz" },
    ]);
  });

  it("refuses platforms and architectures Arcue does not build", () => {
    expect(parsePlatform("linux")).toBe("linux");
    expect(parseArch("arm64")).toBe("arm64");
    expect(() => parsePlatform("freebsd")).toThrow("Unsupported desktop platform: freebsd");
    expect(() => parseArch("ia32")).toThrow("Unsupported desktop architecture: ia32");
  });
});
