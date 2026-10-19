import { describe, expect, it } from "vitest";
import { DEB_APP_DIR, debianControl, debianCopyright, desktopEntry, wrap } from "./debian";
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

  it("carries the license with blank lines marked", () => {
    expect(debianCopyright("MIT License\r\n\r\nCopyright (c) Someone\n")).toBe(
      "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/\nUpstream-Name: Arcue\nSource: https://github.com/skibitsky/arcue\n\nFiles: *\nLicense: MIT\n MIT License\n .\n Copyright (c) Someone\n",
    );
  });
});

describe("wrap", () => {
  it("breaks at spaces within the width", () => {
    expect(wrap("one two three four", 9)).toEqual(["one two", "three", "four"]);
    expect(wrap("", 9)).toEqual([]);
  });
});
