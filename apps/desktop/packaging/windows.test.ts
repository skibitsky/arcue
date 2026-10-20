import { readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseVersion } from "./layout";
import { findOnPath, INSTALLER_SCRIPT, installerDefines, parseSet, vcvarsArgument, vcvarsCommand } from "./windows";

describe("building the Windows command", () => {
  it("asks vcvarsall for a native or a cross compiler", () => {
    expect(vcvarsArgument("x64", "x64")).toBe("amd64");
    expect(vcvarsArgument("x64", "arm64")).toBe("amd64_arm64");
    expect(vcvarsArgument("arm64", "arm64")).toBe("arm64");
    expect(vcvarsArgument("arm64", "x64")).toBe("arm64_amd64");
  });

  it("reads the environment that set prints", () => {
    expect(parseSet("Path=C:\\VC\\bin;C:\\Windows\r\n=C:=C:\\work\r\nINCLUDE=C:\\VC\\include\r\n")).toEqual({
      Path: "C:\\VC\\bin;C:\\Windows",
      INCLUDE: "C:\\VC\\include",
    });
  });

  it("has set print UTF-16LE, which keeps a user name outside the code page", () => {
    const vcvarsall = "C:\\Program Files\\Microsoft Visual Studio\\VC\\Auxiliary\\Build\\vcvarsall.bat";
    const output = Buffer.from("TMP=C:\\Users\\Jürgen Ødegård\\AppData\\Local\\Temp\r\nUSERNAME=山田\r\n", "utf16le");

    expect(vcvarsCommand(vcvarsall, "x64", "arm64")).toEqual([
      "/d",
      "/u",
      "/s",
      "/c",
      `""${vcvarsall}" amd64_arm64 >nul && set"`,
    ]);
    expect(parseSet(output.toString("utf16le"))).toEqual({
      TMP: "C:\\Users\\Jürgen Ødegård\\AppData\\Local\\Temp",
      USERNAME: "山田",
    });
  });

  it("finds a program in the first PATH folder that has it", () => {
    const has = new Set([join("second", "cl.exe"), join("third", "cl.exe")]);
    const path = ["", "first", "second", "third"].join(delimiter);

    expect(findOnPath("cl.exe", path, (file) => has.has(file))).toBe(join("second", "cl.exe"));
    expect(findOnPath("link.exe", path, (file) => has.has(file))).toBeNull();
  });
});

describe("the Windows installer", () => {
  it("defines everything arcue.iss uses", async () => {
    const script = await readFile(INSTALLER_SCRIPT, "utf8");
    const defines = installerDefines({
      version: parseVersion("1.3.0-beta.2"),
      arch: "arm64",
      source: "C:\\out\\Arcue-win32-arm64",
      outputDir: "C:\\out\\make",
      outputName: "Arcue-1.3.0-beta.2-win-arm64-setup",
      icon: "C:\\assets\\arcue.ico",
    });
    const defined = defines.map((define) => /^\/D(\w+)=/.exec(define)?.[1]);
    const used = new Set([...script.matchAll(/\{#(\w+)\}|#if (\w+) ==/g)].map((match) => match[1] ?? match[2]));

    expect(new Set(defined)).toEqual(used);
    expect(defines).toContain("/DNumericVersion=1.3.0");
    expect(defines).toContain("/DArch=arm64");
  });

  it("is ASCII, as Inno Setup reads a script without a byte order mark", async () => {
    expect(await readFile(INSTALLER_SCRIPT, "utf8")).toMatch(/^[\p{ASCII}]*$/u);
  });
});
