import { describe, expect, it } from "vitest";
import { installers } from "./layout.ts";
import { releaseNotes } from "./release-notes.ts";

const input = {
  repository: "skibitsky/arcue",
  tag: "v1.2.0",
  summary: "\nArcue 1.2 opens glTF files.\n\n- Something new.\n\n",
  macNotarized: false,
  windowsSigned: false,
  latest: true,
};

describe("releaseNotes", () => {
  it("starts with the summary, then links every release file for its computer", () => {
    const notes = releaseNotes(input);
    expect(notes.startsWith("Arcue 1.2 opens glTF files.\n\n- Something new.\n\n## Install\n")).toBe(true);
    const files = (["darwin", "win32", "linux"] as const).flatMap((platform) =>
      (["arm64", "x64"] as const).flatMap((arch) => installers(platform, arch).map((installer) => installer.file)),
    );
    for (const file of files) {
      expect(notes).toContain(`[${file}](https://github.com/skibitsky/arcue/releases/download/v1.2.0/${file})`);
    }
    expect(notes).toContain(
      "| Mac with Apple silicon | [Arcue-mac-arm64.dmg](https://github.com/skibitsky/arcue/releases/download/v1.2.0/Arcue-mac-arm64.dmg) |",
    );
    expect(notes).toContain("| Debian or Ubuntu on x64 | [Arcue-linux-amd64.deb]");
    expect(notes).toContain("| Other Linux on Arm | [Arcue-linux-arm64.tar.gz]");
    expect(notes).toContain("https://github.com/skibitsky/arcue/blob/v1.2.0/INSTALL.md#desktop-app");
  });

  it("offers INSTALL.md's commands only for the latest release, which they download", () => {
    const latest = releaseNotes(input);
    expect(latest).toContain(
      "ask your agent: `Set up Arcue for me: https://github.com/skibitsky/arcue/blob/main/INSTALL.md`",
    );
    expect(latest).not.toContain("use the files above");

    const older = releaseNotes({ ...input, tag: "v1.2.0-beta.1", latest: false });
    expect(older).not.toContain("Set up Arcue for me");
    expect(older).toContain("its commands download the latest release: use the files above for this one.");
  });

  it("says which installers put arcue on PATH", () => {
    expect(releaseNotes(input)).toContain(
      "The macOS, Windows and Debian installers put the `arcue` command on PATH; on macOS, choose Arcue > Install arcue Command. For a tarball, INSTALL.md shows how to link it.",
    );
  });

  it("says how to open what is not signed, and nothing for what is", () => {
    const unsigned = releaseNotes(input);
    expect(unsigned).toContain("The first time you open it:");
    expect(unsigned).toContain("Open Anyway");
    expect(unsigned).toContain("Run anyway");

    const macOnly = releaseNotes({ ...input, macNotarized: true });
    expect(macOnly).not.toContain("Open Anyway");
    expect(macOnly).toContain("Run anyway");

    const signed = releaseNotes({ ...input, macNotarized: true, windowsSigned: true });
    expect(signed).not.toContain("The first time you open it:");
  });

  it("ends with how to check a download against the checksums and the workflow's attestation", () => {
    expect(releaseNotes(input)).toMatch(
      /## Verify a download\n\n`SHA256SUMS\.txt` .*`gh attestation verify <file> --repo skibitsky\/arcue --signer-workflow skibitsky\/arcue\/\.github\/workflows\/release\.yml`.*\n$/,
    );
  });

  it("refuses an empty summary", () => {
    expect(() => releaseNotes({ ...input, summary: " \n" })).toThrow("The summary of v1.2.0 is empty.");
  });
});
