import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { administratorScript, appBundle, commandInApp, linkCommand, linkState, moveFirst } from "./command-line";

const run = promisify(execFile);
let temp: string;

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "arcue command ")));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe("the macOS app's command", () => {
  it("is the launcher in the app's resources", () => {
    const execPath = "/Applications/Arcue.app/Contents/MacOS/Arcue";

    expect(appBundle(execPath)).toBe("/Applications/Arcue.app");
    expect(commandInApp(execPath)).toBe("/Applications/Arcue.app/Contents/Resources/bin/arcue");
  });

  it("waits until the app is somewhere it stays", () => {
    expect(moveFirst("/Applications/Arcue.app", false)).toBeNull();
    expect(moveFirst("/Volumes/Backup/Apps/Arcue.app", false)).toBeNull();
    expect(moveFirst("/Volumes/Arcue/Arcue.app", true)).toMatch(/disk image/);
    expect(moveFirst("/private/var/folders/x/T/AppTranslocation/0A1B/d/Arcue.app", true)).toMatch(/temporary copy/);
  });
});

describe.skipIf(process.platform === "win32")("linking the command", () => {
  it("tells its own link from nothing and from anything else", async () => {
    const command = join(temp, "Arcue.app", "Contents", "Resources", "bin", "arcue");
    const link = join(temp, "bin", "arcue");
    await mkdir(join(temp, "bin"));

    expect(await linkState(link, command)).toBe("missing");
    await symlink("../Arcue.app/Contents/Resources/bin/arcue", link);
    expect(await linkState(link, command)).toBe("ours");
    await rm(link);
    await symlink("/opt/elsewhere/arcue", link);
    expect(await linkState(link, command)).toBe("other");
    await rm(link);
    await writeFile(link, "#!/bin/sh\n");
    expect(await linkState(link, command)).toBe("other");
  });

  it("makes the folder and replaces what is there", async () => {
    const command = join(temp, "Arcue.app", "Contents", "Resources", "bin", "arcue");
    const link = join(temp, "usr", "local", "bin", "arcue");

    await linkCommand(link, command);
    expect(await readlink(link)).toBe(command);
    await rm(link);
    await writeFile(link, "someone else's arcue");
    await linkCommand(link, command);
    expect(await linkState(link, command)).toBe("ours");
  });

  it("quotes paths for AppleScript and the shell", async () => {
    const odd = join(temp, `it's "quoted" \\n $HOME`);
    const command = join(odd, "Arcue.app", "Contents", "Resources", "bin", "arcue");
    const link = join(odd, "usr local", "bin", "arcue");
    const script = administratorScript(link, command);
    const literal = /^do shell script "(.*)" with administrator privileges$/.exec(script)?.[1];
    expect(literal).toBeDefined();
    expect(literal).not.toMatch(/(^|[^\\])(\\\\)*"/);
    const shell = (literal ?? "").replaceAll(/\\(["\\])/g, "$1");

    await run("/bin/sh", ["-c", shell]);
    expect(await readlink(link)).toBe(command);
    await run("/bin/sh", ["-c", shell]);
    expect(await readlink(link)).toBe(command);
  });
});
