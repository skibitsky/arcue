import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SERVE_INFO_FILE } from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoreRunningError, claimStart, startLockPath, waitForStarts } from "./start-claim";
import type { FakeCore } from "./test-cores";
import { holdStartLock, startFakeCore } from "./test-cores";

let userData: string;
const closing: { close(): Promise<void> }[] = [];
const killing: { kill(): void }[] = [];

/** macOS's temporary folder is too long for the socket to fit inside the user data folder, so tests use /tmp. */
const userDataRoot = process.platform === "win32" ? tmpdir() : "/tmp";

beforeEach(() => {
  userData = realpathSync(mkdtempSync(join(userDataRoot, "arcue-start-")));
});

afterEach(async () => {
  for (const started of closing.splice(0)) await started.close();
  for (const child of killing.splice(0)) child.kill();
  rmSync(userData, { recursive: true, force: true });
});

async function liveServe(): Promise<FakeCore> {
  const fake = await startFakeCore(userData, {
    file: SERVE_INFO_FILE,
    kind: "serve",
    locks: 1,
    url: "http://localhost:4530",
  });
  closing.push(fake);
  return fake;
}

/** Writes a start lock that a live process in another Arcue holds. */
function holdElsewhere(): void {
  killing.push(holdStartLock(userData));
}

function settled(promise: Promise<unknown>): () => boolean {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  return () => done;
}

describe("the start claim", () => {
  it("makes a second start wait, and refuses it as the same kind once the first wrote its file", async () => {
    const first = await claimStart(userData, "serve");
    const second = claimStart(userData, "serve");
    const secondSettled = settled(second);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(secondSettled()).toBe(false);

    const running = await liveServe();
    await first.release();

    await expect(second).rejects.toBeInstanceOf(CoreRunningError);
    await expect(second).rejects.toMatchObject({ reason: "same", starting: "serve", running: running.info });
  });

  it("creates the data folder and holds the start lock until it is released", async () => {
    const folder = join(userData, "missing", "data");
    const claim = await claimStart(folder, "desktop");
    expect(claim.kind).toBe("desktop");
    expect(existsSync(startLockPath(folder))).toBe(true);
    await claim.release();
    await claim.release();
    expect(existsSync(startLockPath(folder))).toBe(false);
  });

  it("lets a waiter for starts return once a claim is released", async () => {
    const claim = await claimStart(userData, "serve");
    const waiting = waitForStarts(userData);
    const waited = settled(waiting);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(waited()).toBe(false);

    await claim.release();

    await expect(waiting).resolves.toBeUndefined();
  });

  it("lets a waiter for starts return at its timeout, and at once when nothing starts", async () => {
    await expect(waitForStarts(userData, 100)).resolves.toBeUndefined();
    expect(existsSync(join(userData, "locks"))).toBe(false);
    holdElsewhere();

    const started = performance.now();
    await expect(waitForStarts(userData, 300)).resolves.toBeUndefined();

    expect(performance.now() - started).toBeGreaterThanOrEqual(290);
    expect(existsSync(startLockPath(userData))).toBe(true);
  });

  it("times out a claim while another Arcue holds the start lock", async () => {
    holdElsewhere();
    await expect(claimStart(userData, "serve", { timeoutMs: 200 })).rejects.toMatchObject({
      code: "timeout",
      message: expect.stringContaining("kept the start of Arcue busy"),
    });
  });
});
