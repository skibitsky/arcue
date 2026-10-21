import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LAST_CORE_FILE, lastCoreSchema } from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLastCore, writeLastCore } from "./last-core";
import { recordLastCore } from "./start-claim";

let userData: string;

beforeEach(() => {
  userData = realpathSync(mkdtempSync(join(tmpdir(), "arcue-last-core-")));
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

const ADDRESS = "http://localhost:4530";

function onDisk(): unknown {
  return JSON.parse(readFileSync(join(userData, LAST_CORE_FILE), "utf8"));
}

describe("the last core", () => {
  it("is none until one is recorded", async () => {
    await expect(readLastCore(userData)).resolves.toBeNull();
  });

  it("keeps the address of the last Arcue in the browser unless a new one is given", async () => {
    await writeLastCore(userData, "serve", ADDRESS);
    await expect(readLastCore(userData)).resolves.toEqual({ version: 1, kind: "serve", serveUrl: ADDRESS });
    await writeLastCore(userData, "desktop");
    await expect(readLastCore(userData)).resolves.toEqual({ version: 1, kind: "desktop", serveUrl: ADDRESS });
    await writeLastCore(userData, "serve", "http://localhost:4600");
    expect(onDisk()).toEqual({ version: 1, kind: "serve", serveUrl: "http://localhost:4600" });
    if (process.platform !== "win32") expect(statSync(join(userData, LAST_CORE_FILE)).mode & 0o777).toBe(0o600);
  });

  it("is none for a file that is not valid, and replaced by the next record", async () => {
    writeFileSync(join(userData, LAST_CORE_FILE), '{"version":2,"kind":"serve"}');
    await expect(readLastCore(userData)).resolves.toBeNull();
    writeFileSync(join(userData, LAST_CORE_FILE), "not json");
    await expect(readLastCore(userData)).resolves.toBeNull();

    await writeLastCore(userData, "desktop");

    expect(onDisk()).toEqual({ version: 1, kind: "desktop" });
  });

  it("never rejects when it cannot write", async () => {
    await expect(writeLastCore(join(userData, "missing"), "desktop")).resolves.toBeUndefined();
  });

  it("stays valid and keeps the address when two Arcues record at once", async () => {
    await writeLastCore(userData, "serve", ADDRESS);

    await Promise.all([
      recordLastCore(userData, "desktop"),
      recordLastCore(userData, "serve"),
      recordLastCore(userData, "desktop"),
    ]);

    expect(lastCoreSchema.parse(onDisk()).serveUrl).toBe(ADDRESS);
    expect(readdirSync(userData).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
