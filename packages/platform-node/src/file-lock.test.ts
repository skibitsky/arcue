import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  watch,
  writeFileSync,
} from "node:fs";
import * as fs from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { LockRecord } from "@arcue/protocol";
import { lockRecordSchema } from "@arcue/protocol";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileLockOptions } from "./file-lock";
import { acquireFileLock, isRunning, lockNamespace } from "./file-lock";
import type { Fixture, FixtureChild } from "./test-children";
import { buildFixture } from "./test-children";
import { deadPid } from "./test-cores";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: vi.fn(actual.open),
    unlink: vi.fn(actual.unlink),
    readFile: vi.fn(actual.readFile),
    stat: vi.fn(actual.stat),
    lstat: vi.fn(actual.lstat),
  };
});

vi.mock("node:timers/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers/promises")>();
  return { ...actual, setTimeout: vi.fn(actual.setTimeout) };
});

const HOST = hostname().slice(0, 255);
const posix = process.platform !== "win32";

let fixture: Fixture;
let temp: string;
let lock: string;

beforeAll(async () => {
  fixture = await buildFixture();
}, 60_000);

afterAll(() => fixture.remove());

beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-file-lock-")));
  lock = join(temp, "locks", "test.lock");
  for (const mock of [fs.open, fs.unlink, fs.readFile, fs.stat, fs.lstat]) vi.mocked(mock).mockClear();
});

afterEach(async () => {
  await fixture.stopAll();
  rmSync(temp, { recursive: true, force: true });
});

function options(more: Partial<FileLockOptions> = {}): FileLockOptions {
  return { timeoutMs: 15_000, label: "the test lock", ...more };
}

const shortLease = { heartbeatMs: 50, staleAfterMs: 200, confirmStaleMs: 150 };

function hex(): string {
  return randomBytes(16).toString("hex");
}

function record(more: Partial<LockRecord> = {}): LockRecord {
  return {
    arcueLock: 1,
    token: hex(),
    instance: hex(),
    pid: process.pid,
    host: HOST,
    ns: lockNamespace(),
    acquiredAt: Date.now(),
    ...more,
  };
}

function writeRecord(path: string, written: LockRecord | string, ageMs = 0): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof written === "string" ? written : JSON.stringify(written));
  if (ageMs > 0) {
    const at = new Date(Date.now() - ageMs);
    utimesSync(path, at, at);
  }
}

function readRecord(path: string): LockRecord {
  return lockRecordSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function holding(child: FixtureChild): Promise<unknown> {
  return child.message((message) => message === "held");
}

async function timed<Value>(action: () => Promise<Value>): Promise<{ value: Value; ms: number }> {
  const started = performance.now();
  const value = await action();
  return { value, ms: performance.now() - started };
}

function creates(): number {
  return vi.mocked(fs.open).mock.calls.filter(([, flags]) => flags === "wx").length;
}

function failure(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: the test made it fail`), { code });
}

describe("a file lock in one process", () => {
  it("writes a record of its holder that only the user can read, and removes it on release", async () => {
    const release = await acquireFileLock(lock, options());

    const held = readRecord(lock);
    expect(held).toMatchObject({ arcueLock: 1, pid: process.pid, host: HOST, ns: lockNamespace() });
    if (posix) expect(statSync(lock).mode & 0o777).toBe(0o600);
    await release();
    expect(existsSync(lock)).toBe(false);
    await release();
  });

  it("refuses a confirmation shorter than the heartbeat", async () => {
    await expect(acquireFileLock(lock, options({ heartbeatMs: 100, confirmStaleMs: 100 }))).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  it("grants waiters in order, without polling while one of them holds it", async () => {
    const first = await acquireFileLock(lock, options());
    vi.mocked(fs.open).mockClear();
    const order: number[] = [];
    const waiters = Array.from({ length: 5 }, (_, index) =>
      acquireFileLock(lock, options()).then(async (release) => {
        order.push(index);
        await release();
      }),
    );
    await sleep(300);
    expect(creates()).toBe(0);

    await first();
    await Promise.all(waiters);

    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(creates()).toBeLessThanOrEqual(5 + 1);
  });

  it("never times out behind holders in its own process, however long they hold it together", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        acquireFileLock(lock, options({ timeoutMs: 400 })).then(async (release) => {
          await sleep(300);
          await release();
        }),
      ),
    );
    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
  }, 30_000);

  it("hands it on at once past a waiting file that a waiter in another process left long ago", async () => {
    mkdirSync(join(temp, "locks"));
    const waiting = `${lock}.waiting`;
    writeFileSync(waiting, JSON.stringify({ arcueLockWaiting: 1, token: hex(), pid: deadPid() }));
    const old = new Date(Date.now() - 10_000);
    utimesSync(waiting, old, old);
    const first = await acquireFileLock(lock, options());
    const waiters = Array.from({ length: 4 }, () => acquireFileLock(lock, options()).then((release) => release()));

    const { ms } = await timed(async () => {
      await first();
      await Promise.all(waiters);
    });

    expect(ms).toBeLessThan(400);
  });

  it("breaks its own leftover at once when a release could not remove it", async () => {
    const release = await acquireFileLock(lock, options());
    vi.mocked(fs.unlink).mockImplementationOnce(() => Promise.reject(failure("EIO")));
    await release();
    expect(existsSync(lock)).toBe(true);

    const { value: again, ms } = await timed(() => acquireFileLock(lock, options()));

    expect(ms).toBeLessThan(500);
    expect(readRecord(lock).pid).toBe(process.pid);
    await again();
    expect(existsSync(lock)).toBe(false);
  });

  it("retries a removal that Windows refuses while another program holds the file", async () => {
    const release = await acquireFileLock(lock, options());
    vi.mocked(fs.unlink).mockClear();
    vi.mocked(fs.unlink)
      .mockImplementationOnce(() => Promise.reject(failure("EBUSY")))
      .mockImplementationOnce(() => Promise.reject(failure("EBUSY")));

    await release();

    expect(vi.mocked(fs.unlink)).toHaveBeenCalledTimes(3);
    expect(existsSync(lock)).toBe(false);
  });

  it("takes a refused create on Windows for a lock being removed, and as forbidden elsewhere", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      vi.mocked(fs.open).mockImplementationOnce(() => Promise.reject(failure("EPERM")));
      const release = await acquireFileLock(lock, options());
      await release();
      vi.mocked(fs.open).mockImplementationOnce(() => Promise.reject(failure("EBUSY")));
      await (await acquireFileLock(lock, options()))();
      Object.defineProperty(process, "platform", { value: "linux" });
      vi.mocked(fs.open).mockImplementationOnce(() => Promise.reject(failure("EPERM")));
      const elsewhere = await acquireFileLock(lock, options()).then(
        async (held) => {
          await held();
          return "acquired";
        },
        (error: unknown) => error,
      );
      expect(elsewhere).toMatchObject({ code: "forbidden" });
    } finally {
      if (platform) Object.defineProperty(process, "platform", platform);
    }
  });

  it("tries again at once, without waiting, when the file it met is gone by the time it looks at it", async () => {
    mkdirSync(join(temp, "locks"));
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let met = false;
    vi.mocked(fs.open).mockImplementation((path, flags, mode) => {
      if (path !== lock || flags !== "wx" || met) return actual.open(path, flags, mode);
      met = true;
      return Promise.reject(failure("EEXIST"));
    });
    vi.mocked(sleep).mockClear();
    try {
      const release = await acquireFileLock(lock, options());
      expect(creates()).toBe(2);
      expect(sleep).not.toHaveBeenCalled();
      await release();
    } finally {
      vi.mocked(fs.open).mockImplementation(actual.open);
    }
  });

  it("takes the lock after one refused create on Windows that follows creates which met holders releasing it", async () => {
    mkdirSync(join(temp, "locks"));
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const failures = ["EEXIST", "EEXIST", "EEXIST", "EEXIST", "EPERM"];
    vi.mocked(fs.open).mockImplementation((path, flags, mode) => {
      const code = path === lock && flags === "wx" ? failures.shift() : undefined;
      return code === undefined ? actual.open(path, flags, mode) : Promise.reject(failure(code));
    });
    try {
      const release = await acquireFileLock(lock, options());
      expect(failures).toEqual([]);
      expect(creates()).toBe(6);
      await release();
    } finally {
      vi.mocked(fs.open).mockImplementation(actual.open);
      if (platform) Object.defineProperty(process, "platform", platform);
    }
  });

  it("refuses as forbidden, soon and without spinning, when Windows keeps refusing to create the file", async () => {
    mkdirSync(join(temp, "locks"));
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(fs.open).mockImplementation((path, flags, mode) =>
      flags === "wx" ? Promise.reject(failure("EPERM")) : actual.open(path, flags, mode),
    );
    try {
      for (const timeoutMs of [15_000, 0]) {
        vi.mocked(fs.open).mockClear();
        const { value: outcome, ms } = await timed(() =>
          acquireFileLock(lock, options({ timeoutMs })).then(
            () => null,
            (error: unknown) => error,
          ),
        );
        expect(outcome).toMatchObject({
          code: "forbidden",
          message: `Arcue cannot lock the test lock: ${join(temp, "locks")} cannot be written.`,
        });
        expect(ms).toBeLessThan(1000);
        expect(creates()).toBeLessThanOrEqual(5);
      }
    } finally {
      vi.mocked(fs.open).mockImplementation(actual.open);
      if (platform) Object.defineProperty(process, "platform", platform);
    }
    await (await acquireFileLock(lock, options()))();
  });

  it.skipIf(!posix)("times out without spinning on a link at the lock file that leads nowhere", async () => {
    mkdirSync(join(temp, "locks"));
    symlinkSync(join(temp, "nowhere"), lock);

    const { value: outcome, ms } = await timed(() =>
      acquireFileLock(lock, options({ timeoutMs: 300 })).then(
        () => null,
        (error: unknown) => error,
      ),
    );

    expect(outcome).toMatchObject({
      code: "timeout",
      message: "Another Arcue kept the test lock busy for 0.3 seconds, so nothing was changed. Try again.",
    });
    expect(ms).toBeLessThan(1500);
    expect(creates()).toBeLessThan(50);
  });

  it.skipIf(!posix)("refuses as forbidden a lock file it may not read, which no lease could break", async () => {
    writeRecord(lock, record({ pid: process.ppid }));
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(fs.open).mockImplementation((path, flags, mode) =>
      flags === "r" ? Promise.reject(failure("EACCES")) : actual.open(path, flags, mode),
    );
    try {
      const { value: outcome, ms } = await timed(() =>
        acquireFileLock(lock, options()).then(
          () => null,
          (error: unknown) => error,
        ),
      );
      expect(outcome).toMatchObject({
        code: "forbidden",
        message: `Arcue cannot lock the test lock: ${join(temp, "locks")} cannot be written.`,
      });
      expect(ms).toBeLessThan(1000);
    } finally {
      vi.mocked(fs.open).mockImplementation(actual.open);
    }
  });

  it("reads a lock file's text and age through one descriptor", async () => {
    writeRecord(lock, record({ pid: process.ppid }));
    vi.mocked(fs.open).mockClear();

    await expect(acquireFileLock(lock, options({ timeoutMs: 0 }))).rejects.toMatchObject({ code: "timeout" });

    expect(vi.mocked(fs.open).mock.calls.map(([, flags]) => flags)).toEqual(["wx", "r"]);
    expect(vi.mocked(fs.readFile)).not.toHaveBeenCalled();
    expect(vi.mocked(fs.stat)).not.toHaveBeenCalled();
    expect(vi.mocked(fs.lstat)).not.toHaveBeenCalled();
  });

  it("leaves no lock file when writing its record fails", async () => {
    mkdirSync(join(temp, "locks"));
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags, mode) => {
      const handle = await actual.open(path, flags, mode);
      handle.writeFile = () => Promise.reject(failure("ENOSPC"));
      return handle;
    });

    await expect(acquireFileLock(lock, options())).rejects.toMatchObject({
      code: "forbidden",
      message: `Arcue cannot lock the test lock: ${join(temp, "locks")} cannot be written.`,
    });
    expect(existsSync(lock)).toBe(false);
    await (await acquireFileLock(lock, options()))();
  });

  it("refuses as forbidden when the locks folder cannot be made", async () => {
    writeFileSync(join(temp, "locks"), "in the way");
    await expect(acquireFileLock(lock, options())).rejects.toMatchObject({
      code: "forbidden",
      message: `Arcue cannot lock the test lock: ${join(temp, "locks")} cannot be written.`,
    });
  });
});

describe("a file lock another holder left", () => {
  it("is broken at once when it names a process on this computer that has ended", async () => {
    writeRecord(lock, record({ pid: deadPid() }), 3_600_000);

    const { value: release, ms } = await timed(() => acquireFileLock(lock, options()));

    expect(ms).toBeLessThan(1000);
    expect(readRecord(lock).pid).toBe(process.pid);
    await release();
  });

  it("is broken past a claim that a breaker who died left", async () => {
    const stale = record({ pid: deadPid() });
    writeRecord(lock, stale, 3_600_000);
    const claim = `${lock}.${stale.token}.break`;
    writeRecord(claim, record({ pid: deadPid() }), 3_600_000);

    const { value: release, ms } = await timed(() => acquireFileLock(lock, options()));

    expect(ms).toBeLessThan(1000);
    expect(existsSync(claim)).toBe(false);
    await release();
  });

  it("leaves the file of a waiter that broke the same dead holder's lock and took it first", async () => {
    const stale = record({ pid: deadPid() });
    writeRecord(lock, stale, 3_600_000);
    const successor = record({ pid: process.ppid });
    const claim = `${lock}.${stale.token}.break`;
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let overtaken = false;
    vi.mocked(fs.open).mockImplementation((path, flags, mode) => {
      if (path === claim && flags === "wx" && !overtaken) {
        overtaken = true;
        writeRecord(lock, successor);
      }
      return actual.open(path, flags, mode);
    });
    try {
      await expect(acquireFileLock(lock, options({ timeoutMs: 300 }))).rejects.toMatchObject({ code: "timeout" });
    } finally {
      vi.mocked(fs.open).mockImplementation(actual.open);
    }

    expect(overtaken).toBe(true);
    expect(readRecord(lock)).toEqual(successor);
    expect(existsSync(claim)).toBe(false);
  });

  it("is broken only through the lease when it names a live process that does not refresh it", async () => {
    writeRecord(lock, record({ pid: process.ppid }));

    const { value: release, ms } = await timed(() => acquireFileLock(lock, options(shortLease)));

    expect(ms).toBeGreaterThan(330);
    await release();
  });

  it("is waited for while an empty or half-written record is young, and broken once it is old", async () => {
    for (const text of ["", '{"arcueLock":1,"tok']) {
      writeRecord(lock, text);
      const { value: release, ms } = await timed(() => acquireFileLock(lock, options(shortLease)));
      expect(ms).toBeGreaterThan(330);
      await release();
    }
  });

  it("is never broken by the pid of a record from another computer, pid namespace or boot", async () => {
    for (const elsewhere of [
      record({ pid: deadPid(), ns: "pid:[1]/another-boot" }),
      record({ pid: deadPid(), host: `not-${HOST}`.slice(0, 255) }),
    ]) {
      writeRecord(lock, elsewhere);
      const refresh = setInterval(() => {
        const now = new Date();
        utimesSync(lock, now, now);
      }, 50);
      try {
        await expect(acquireFileLock(lock, options({ ...shortLease, timeoutMs: 1000 }))).rejects.toMatchObject({
          code: "timeout",
        });
      } finally {
        clearInterval(refresh);
      }
      expect(readRecord(lock)).toEqual(elsewhere);
    }

    writeRecord(lock, record({ pid: deadPid() }), 3_600_000);
    const { value: release, ms } = await timed(() => acquireFileLock(lock, options()));
    expect(ms).toBeLessThan(1000);
    await release();

    writeRecord(lock, record({ pid: deadPid(), ns: null }));
    const unknown = await timed(() => acquireFileLock(lock, options(shortLease)));
    expect(unknown.ms).toBeGreaterThan(330);
    await unknown.value();
  });

  it("times out on how long one holder keeps it, not on the wait behind several holders in turn", async () => {
    writeRecord(lock, record({ pid: process.ppid }));
    const next = join(temp, "next.lock");
    const handOver = setTimeout(() => {
      writeRecord(next, record({ pid: process.ppid }));
      renameSync(next, lock);
    }, 600);
    const letGo = setTimeout(() => rmSync(lock, { force: true }), 1200);
    try {
      const { value: release, ms } = await timed(() => acquireFileLock(lock, options({ timeoutMs: 1000 })));
      expect(ms).toBeGreaterThan(1100);
      expect(readRecord(lock).pid).toBe(process.pid);
      await release();
    } finally {
      clearTimeout(handOver);
      clearTimeout(letGo);
    }
  });

  it("is not broken when a clock jump makes it look old while its holder refreshes it", async () => {
    const holder = fixture.start({ mode: "hold", lock, options: { timeoutMs: 15_000, heartbeatMs: 50 } }, temp);
    await holding(holder);
    const held = readFileSync(lock, "utf8");
    const jumped = () => Date.now() + 2 * 3_600_000;

    await expect(acquireFileLock(lock, options({ ...shortLease, timeoutMs: 1000, now: jumped }))).rejects.toMatchObject(
      { code: "timeout" },
    );

    expect(readRecord(lock).token).toBe(lockRecordSchema.parse(JSON.parse(held)).token);
  });
});

describe("a file lock across processes", () => {
  it("lets one process at a time hold it while some of them are killed", async () => {
    const probe = join(temp, "probe");
    const counter = join(temp, "counter");
    writeFileSync(probe, "");
    writeFileSync(counter, "0".padStart(12, "0"));
    const lease = { timeoutMs: 30_000, heartbeatMs: 200, staleAfterMs: 2000, confirmStaleMs: 1000 };
    const children = Array.from({ length: 6 }, () =>
      fixture.start({ mode: "loop", lock, probe, counter, iterations: 200, options: lease }, temp),
    );
    let completions = 0;
    const failures: unknown[] = [];
    for (const child of children) {
      child.process.on("message", (message: unknown) => {
        if (isDone(message)) completions++;
        if (typeof message === "object" && message !== null && "failed" in message) failures.push(message);
      });
    }
    const killed = new Set<number>();
    await Promise.all(
      children.slice(0, 3).map(async (child) => {
        await sleep(100 + Math.random() * 1500);
        killed.add(child.pid);
        child.process.kill("SIGKILL");
      }),
    );

    const codes = await Promise.all(children.map((child) => child.exited));

    expect(failures).toEqual([]);
    expect(codes.slice(3)).toEqual([0, 0, 0]);
    expect(probeMismatches(readFileSync(probe, "utf8"), killed)).toEqual([]);
    expect(Number(readFileSync(counter, "utf8"))).toBeGreaterThanOrEqual(completions);
    await (await acquireFileLock(lock, options(lease)))();
    expect(leftovers(killed)).toEqual([]);
  }, 60_000);

  it("is broken at once when its holder is killed", async () => {
    const holder = fixture.start({ mode: "hold", lock }, temp);
    await holding(holder);
    holder.process.kill("SIGKILL");
    await holder.exited;

    const { value: release, ms } = await timed(() => acquireFileLock(lock, options()));

    expect(ms).toBeLessThan(1000);
    await release();
  });

  it("is broken by one of the waiters that find its holder gone", async () => {
    const stale = record({ pid: deadPid() });
    writeRecord(lock, stale, 3_600_000);
    const claims = new Set<string>();
    const watcher = watch(join(temp, "locks"), (_event, name) => {
      if (name?.endsWith(".break")) claims.add(name);
    });
    const probe = join(temp, "probe");
    const counter = join(temp, "counter");
    writeFileSync(probe, "");
    writeFileSync(counter, "0".padStart(12, "0"));
    const children = Array.from({ length: 4 }, () =>
      fixture.start({ mode: "loop", lock, probe, counter, iterations: 1, together: true }, temp),
    );
    await Promise.all(children.map((child) => child.message((message) => message === "ready")));

    for (const child of children) child.send("go");
    await Promise.all(children.map((child) => child.message((message) => isDone(message))));
    for (const child of children) child.send("release");
    const codes = await Promise.all(children.map((child) => child.exited));
    await sleep(100);
    watcher.close();

    expect(codes).toEqual([0, 0, 0, 0]);
    expect(probeMismatches(readFileSync(probe, "utf8"), new Set())).toEqual([]);
    expect(readFileSync(counter, "utf8")).toBe("4".padStart(12, "0"));
    const claim = `test.lock.${stale.token}.break`;
    expect([...claims].filter((name) => name !== claim)).toEqual([]);
    if (process.platform === "linux") expect(claims).toEqual(new Set([claim]));
    expect(existsSync(join(temp, "locks", claim))).toBe(false);
  }, 30_000);

  it("is never broken while its holder refreshes it, and times out naming the holder", async () => {
    const holder = fixture.start({ mode: "hold", lock, options: { timeoutMs: 15_000, heartbeatMs: 50 } }, temp);
    await holding(holder);
    const held = readFileSync(lock, "utf8");

    const { ms } = await timed(() =>
      expect(acquireFileLock(lock, options({ ...shortLease, timeoutMs: 2000 }))).rejects.toMatchObject({
        code: "timeout",
        message: `Another Arcue (process ${holder.pid}) kept the test lock busy for 2 seconds, so nothing was changed. Try again.`,
      }),
    );

    expect(ms).toBeGreaterThanOrEqual(1990);
    expect(readRecord(lock).token).toBe(lockRecordSchema.parse(JSON.parse(held)).token);
  });

  it("times out against a live holder and leaves its file as it was", async () => {
    const holder = fixture.start({ mode: "hold", lock }, temp);
    await holding(holder);
    const held = readFileSync(lock);

    await expect(acquireFileLock(lock, options({ timeoutMs: 300 }))).rejects.toMatchObject({ code: "timeout" });

    expect(readFileSync(lock)).toEqual(held);
  });

  it.skipIf(!posix)(
    "survives a holder that is stopped for less than the lease and its confirmation",
    async () => {
      const lease = { heartbeatMs: 50, staleAfterMs: 400, confirmStaleMs: 300 };
      const paused = fixture.start({ mode: "hold", lock, options: { timeoutMs: 15_000, heartbeatMs: 50 } }, temp);
      await holding(paused);
      const held = readRecord(lock).token;
      const waiting = acquireFileLock(lock, options({ ...lease, timeoutMs: 1500 }));
      const outcome = waiting.then(
        () => "acquired",
        (error: unknown) => (error as { code?: string }).code,
      );
      await sleep(50);
      paused.process.kill("SIGSTOP");
      await sleep(480);
      paused.process.kill("SIGCONT");

      await expect(outcome).resolves.toBe("timeout");
      expect(readRecord(lock).token).toBe(held);

      const other = join(temp, "locks", "other.lock");
      const stopped = fixture.start(
        { mode: "hold", lock: other, options: { timeoutMs: 15_000, heartbeatMs: 50 } },
        temp,
      );
      await holding(stopped);
      stopped.process.kill("SIGSTOP");
      try {
        const release = await acquireFileLock(other, options({ ...lease, timeoutMs: 5000 }));
        expect(readRecord(other).pid).toBe(process.pid);
        stopped.process.kill("SIGCONT");
        stopped.send("release");
        await stopped.exited;
        expect(readRecord(other).pid).toBe(process.pid);
        await release();
      } finally {
        stopped.process.kill("SIGCONT");
      }
    },
    20_000,
  );

  it("keeps the file of the process that broke a stalled holder's lock when the holder lets go late", async () => {
    const stalled = fixture.start({ mode: "stall", lock, ms: 1500 }, temp);
    await holding(stalled);

    const release = await acquireFileLock(lock, options(shortLease));
    const mine = readRecord(lock).token;
    await stalled.exited;

    expect(readRecord(lock).token).toBe(mine);
    await release();
    expect(existsSync(lock)).toBe(false);
  });

  it("keeps the file of another process that broke a stalled holder's lock", async () => {
    const stalled = fixture.start({ mode: "stall", lock, ms: 2000 }, temp);
    await holding(stalled);
    const successor = fixture.start({ mode: "hold", lock, options: { timeoutMs: 15_000, ...shortLease } }, temp);
    await holding(successor);
    const taken = readRecord(lock);
    expect(taken.pid).toBe(successor.pid);

    await stalled.exited;

    expect(readRecord(lock)).toEqual(taken);
    successor.send("release");
    await successor.exited;
    expect(existsSync(lock)).toBe(false);
  });

  it("lets go without throwing when its locks folder was removed, and leaves a successor's file", async () => {
    const release = await acquireFileLock(lock, options());
    rmSync(join(temp, "locks"), { recursive: true, force: true });
    const successor = fixture.start({ mode: "hold", lock }, temp);
    await holding(successor);
    const taken = readRecord(lock);

    await expect(release()).resolves.toBeUndefined();

    expect(readRecord(lock)).toEqual(taken);
    successor.send("release");
    await successor.exited;
  });

  it("lets a waiter in another process in while this process keeps taking it", async () => {
    const spammer = fixture.start({ mode: "spam", lock, ms: 5000, waiters: 4, holdMs: 20 }, temp);
    await spammer.message((message) => message === "spamming");
    await sleep(200);

    for (let round = 0; round < 3; round++) {
      const { value: release, ms } = await timed(() => acquireFileLock(lock, options()));
      await release();
      expect(ms).toBeLessThan(1000);
      await sleep(100);
    }
    await spammer.exited;

    expect(existsSync(`${lock}.waiting`)).toBe(false);
  }, 20_000);

  it("never times out a waiter on the time it waited behind holders in its own process", async () => {
    const first = await acquireFileLock(lock, options());
    const queued = acquireFileLock(lock, options({ timeoutMs: 1000 }));
    const other = fixture.start({ mode: "hold", lock }, temp);
    await sleep(1500);

    await first();
    await holding(other);
    await sleep(300);
    other.send("release");

    const release = await queued;
    expect(readRecord(lock).pid).toBe(process.pid);
    await release();
  }, 20_000);

  it("times out every waiter of this process within one poll once another process held it too long", async () => {
    const holder = fixture.start({ mode: "hold", lock }, temp);
    await holding(holder);
    const settled: number[] = [];

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        acquireFileLock(lock, options({ timeoutMs: 1000 })).finally(() => settled.push(performance.now())),
      ),
    );

    expect(results.map((result) => result.status === "rejected" && (result.reason as { code?: string }).code)).toEqual(
      Array.from({ length: 20 }, () => "timeout"),
    );
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(150);
    holder.send("release");
  }, 20_000);

  it("is removed when its holder exits without letting go", async () => {
    const exiting = fixture.start({ mode: "exit", lock }, temp);
    await holding(exiting);
    await exiting.exited;

    expect(existsSync(lock)).toBe(false);
  });

  it.skipIf(process.platform !== "win32")(
    "goes to another process while a third holds the file open as it is removed",
    async () => {
      const release = await acquireFileLock(lock, options());
      const reader = fixture.start({ mode: "open-handle", path: lock }, temp);
      await reader.message((message) => message === "opened");
      const successor = fixture.start({ mode: "hold", lock }, temp);
      await sleep(200);

      await release();
      const released = performance.now();
      await sleep(300);
      reader.send("release");
      await holding(successor);

      expect(performance.now() - released).toBeLessThan(2000);
      successor.send("release");
      await successor.exited;
    },
  );
});

describe("isRunning", () => {
  it("tells a running process from one that ended", () => {
    expect(isRunning(process.pid)).toBe(true);
    expect(isRunning(deadPid())).toBe(false);
  });
});

function isDone(message: unknown): boolean {
  return typeof message === "object" && message !== null && "done" in message;
}

/** The lines of the probe file where a holder's turn was interrupted, except at a killed holder's last line. */
function probeMismatches(text: string, killed: ReadonlySet<number>): string[] {
  const lines = text.split("\n").filter(Boolean);
  const mismatches: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const [pid, turn, step] = line.split(":");
    if (step !== "enter") {
      mismatches.push(line);
      continue;
    }
    if (lines[index + 1] === `${pid}:${turn}:exit`) {
      index++;
      continue;
    }
    const later = lines.slice(index + 1).some((next) => next.startsWith(`${pid}:`));
    if (!killed.has(Number(pid)) || later) mismatches.push(line);
  }
  return mismatches;
}

/** The files in the locks folder, other than those of killed processes. */
function leftovers(killed: ReadonlySet<number>): string[] {
  const folder = join(temp, "locks");
  return readdirSync(folder).filter((name) => {
    if (name.endsWith(".tmp")) return killed.size === 0;
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(folder, name), "utf8"));
      const pid = typeof parsed === "object" && parsed !== null && "pid" in parsed ? parsed.pid : null;
      return name === "test.lock" || !killed.has(Number(pid));
    } catch {
      return true;
    }
  });
}
