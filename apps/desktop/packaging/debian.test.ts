import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { copyrightHolder, DEB_APP_DIR, debianControl, debianCopyright, desktopEntry, wrap } from "./debian";
import { parseVersion } from "./layout";

describe("the Debian package", () => {
  it("describes itself in a control file dpkg reads", () => {
    const control = debianControl(parseVersion("1.3.0-beta.2"), "arm64", 512_000.4);
    const fields = new Map(
      control
        .split("\n")
        .filter((line) => /^[A-Z][\w-]*: /.test(line))
        .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 2)]),
    );

    expect(fields.get("Package")).toBe("arcue");
    expect(fields.get("Version")).toBe("1.3.0~beta.2");
    expect(fields.get("Architecture")).toBe("arm64");
    expect(fields.get("Installed-Size")).toBe("512001");
    expect(fields.get("Depends")).toContain("libgtk-3-0 | libgtk-3-0t64");
    expect(control.endsWith("\n")).toBe(true);
    for (const line of control.split("\n").filter(Boolean)) expect(line).toMatch(/^([A-Z][\w-]*: \S| \S)/);
    const description = control.slice(control.indexOf("Description: ")).split("\n").filter(Boolean);
    expect(description.length).toBeGreaterThan(1);
    for (const line of description) expect(line.length).toBeLessThanOrEqual(80);
  });

  it("starts the installed app from its menu entry", () => {
    const entry = desktopEntry();

    expect(entry.startsWith("[Desktop Entry]\n")).toBe(true);
    expect(entry).toContain(`Exec=${DEB_APP_DIR}/Arcue %F\n`);
    expect(entry).toContain("Icon=arcue\n");
  });

  it("carries the license's holder and text with blank lines marked", () => {
    expect(debianCopyright("MIT License\r\n\r\nCopyright (c) 2031 Someone\r\n")).toBe(
      "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/\nUpstream-Name: Arcue\nSource: https://github.com/skibitsky/arcue\n\nFiles: *\nCopyright: Electron contributors, The Chromium Authors and others\nLicense: other\n The Electron runtime. Its licenses are in /usr/lib/arcue/LICENSE and\n /usr/lib/arcue/LICENSES.chromium.html.\n\nFiles: usr/bin/arcue\n usr/lib/arcue/bin/*\n usr/lib/arcue/resources/*\n usr/share/*\nCopyright: 2031 Someone\nComment: Includes bundled libraries and fonts under their own licenses.\nLicense: MIT\n MIT License\n .\n Copyright (c) 2031 Someone\n",
    );
  });

  it("leaves Electron's files under Electron's licenses and gives Arcue's the license", () => {
    const paragraphs = debianCopyright("Copyright (c) 2031 Someone\n")
      .split("\n\n")
      .slice(1)
      .map((paragraph) => {
        const fields = new Map<string, string>();
        let name = "";
        for (const line of paragraph.split("\n").filter(Boolean)) {
          if (line.startsWith(" ")) fields.set(name, `${fields.get(name)}\n${line.slice(1)}`);
          else {
            name = line.slice(0, line.indexOf(":"));
            fields.set(name, line.slice(name.length + 2));
          }
        }
        return fields;
      });
    const owner = (path: string) =>
      paragraphs
        .filter((fields) =>
          (fields.get("Files") ?? "")
            .split(/\s+/)
            .some((pattern) => new RegExp(`^${pattern.replaceAll(".", "\\.").replaceAll("*", ".*")}$`).test(path)),
        )
        .at(-1)
        ?.get("Copyright");

    for (const fields of paragraphs) expect(fields.get("License")).toMatch(/^\S+\n\S/);
    for (const path of ["usr/lib/arcue/Arcue", "usr/lib/arcue/LICENSE", "usr/lib/arcue/libffmpeg.so"])
      expect(owner(path)).toMatch(/^Electron contributors/);
    for (const path of [
      "usr/bin/arcue",
      "usr/lib/arcue/bin/arcue",
      "usr/lib/arcue/resources/app/LICENSE",
      "usr/lib/arcue/resources/cli/arcue.js",
      "usr/share/applications/arcue.desktop",
      "usr/share/icons/hicolor/16x16/apps/arcue.png",
    ])
      expect(owner(path)).toBe("2031 Someone");
  });

  it("reads the holder from the copyright line", async () => {
    expect(copyrightHolder("Copyright 2030 A and B")).toBe("2030 A and B");
    expect(copyrightHolder("The above copyright notice\n  Copyright © 2029-2030 Someone  \n")).toBe(
      "2029-2030 Someone",
    );
    expect(() => copyrightHolder("MIT License\n\nThe above copyright notice")).toThrow(/no copyright line/);
    const license = await readFile(new URL("../../../LICENSE", import.meta.url), "utf8");

    expect(debianCopyright(license)).toMatch(
      /^Files: \*\nCopyright: Electron contributors\b[\s\S]*\n\nFiles: usr\/bin\/arcue\n( \S+\n)* usr\/lib\/arcue\/resources\/\*\n( \S+\n)*Copyright: \d{4}(-\d{4})? \S.*\n(Comment: .*\n)?License: MIT\n/m,
    );
  });
});

describe("wrap", () => {
  it("breaks at spaces within the width", () => {
    expect(wrap("one two three four", 9)).toEqual(["one two", "three", "four"]);
    expect(wrap("", 9)).toEqual([]);
  });
});
