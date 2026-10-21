import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { BridgeInfo } from "./bridge";
import {
  BRIDGE_INFO_FILE,
  bridgeInfoFile,
  bridgeInfoSchema,
  coreKindOf,
  LOCK_PROTOCOL,
  lastCoreSchema,
  SERVE_INFO_FILE,
  sharesReviews,
} from "./bridge";
import { lockRecordSchema, lockWaitingSchema } from "./locks";

/** The bridge file schema of the builds from before cores ran side by side, as c1c0ce5 has it. */
const olderBridgeInfoSchema = z.object({
  version: z.literal(1),
  socket: z.string().min(1),
  token: z.string().min(32),
  pid: z.int().positive(),
  url: z.url().optional(),
});

const token = "0123456789abcdef0123456789abcdef";

const serveInfo = {
  version: 1,
  socket: "/tmp/arcue-1.sock",
  token,
  pid: 4242,
  url: "http://localhost:4530/",
  kind: "serve",
  locks: 1,
  build: "0123456789abcdef",
};

function info(fields: Partial<BridgeInfo> = {}): BridgeInfo {
  return { version: 1, socket: "/tmp/arcue-1.sock", token, pid: 4242, ...fields };
}

describe("bridge files", () => {
  it("reads the kind, lock protocol and build", () => {
    expect(bridgeInfoSchema.parse(serveInfo)).toEqual(serveInfo);
  });

  it("parses for older builds, which keep the url and drop the new fields", () => {
    expect(olderBridgeInfoSchema.parse(serveInfo)).toEqual({
      version: 1,
      socket: "/tmp/arcue-1.sock",
      token,
      pid: 4242,
      url: "http://localhost:4530/",
    });
  });

  it("refuses another version, kind, lock protocol or build", () => {
    expect(bridgeInfoSchema.safeParse({ ...serveInfo, version: 2 }).success).toBe(false);
    expect(bridgeInfoSchema.safeParse({ ...serveInfo, kind: "cli" }).success).toBe(false);
    expect(bridgeInfoSchema.safeParse({ ...serveInfo, locks: 0 }).success).toBe(false);
    expect(bridgeInfoSchema.safeParse({ ...serveInfo, build: "0123456789ABCDEF" }).success).toBe(false);
    expect(bridgeInfoSchema.safeParse({ ...serveInfo, build: "0123456789abcde" }).success).toBe(false);
  });

  it("shares reviews only with a core of a kind that follows this lock protocol", () => {
    expect(LOCK_PROTOCOL).toBe(1);
    expect(sharesReviews(info())).toBe(false);
    expect(sharesReviews(info({ url: "http://localhost:4530/" }))).toBe(false);
    expect(sharesReviews(info({ kind: "desktop" }))).toBe(false);
    expect(sharesReviews(info({ kind: "desktop", locks: 1 }))).toBe(true);
    expect(sharesReviews(info({ kind: "serve", locks: 1 }))).toBe(true);
    expect(sharesReviews(info({ kind: "serve", locks: 2 }))).toBe(false);
    expect(sharesReviews(info({ locks: 1 }))).toBe(false);
  });

  it("names the kind of core, taking an older file with a url for arcue serve", () => {
    expect(coreKindOf(info({ kind: "desktop", url: "http://localhost:4530/" }))).toBe("desktop");
    expect(coreKindOf(info({ kind: "serve" }))).toBe("serve");
    expect(coreKindOf(info({ url: "http://localhost:4530/" }))).toBe("serve");
    expect(coreKindOf(info())).toBe("desktop");
  });

  it("keeps the desktop app at bridge.json and Arcue in the browser at serve.json", () => {
    expect(bridgeInfoFile("desktop")).toBe(BRIDGE_INFO_FILE);
    expect(bridgeInfoFile("serve")).toBe(SERVE_INFO_FILE);
    expect([BRIDGE_INFO_FILE, SERVE_INFO_FILE]).toEqual(["bridge.json", "serve.json"]);
  });
});

describe("the last core", () => {
  it("names a kind and, optionally, where Arcue in the browser served its pages", () => {
    expect(lastCoreSchema.parse({ version: 1, kind: "desktop" })).toEqual({ version: 1, kind: "desktop" });
    const serve = { version: 1, kind: "serve", serveUrl: "http://localhost:4600/" };
    expect(lastCoreSchema.parse(serve)).toEqual(serve);
  });

  it("refuses another version, an unknown kind or a url that is not one", () => {
    expect(lastCoreSchema.safeParse({ version: 2, kind: "serve" }).success).toBe(false);
    expect(lastCoreSchema.safeParse({ version: 1, kind: "cli" }).success).toBe(false);
    expect(lastCoreSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(lastCoreSchema.safeParse({ version: 1, kind: "serve", serveUrl: "localhost" }).success).toBe(false);
  });
});

describe("lock files", () => {
  const record = {
    arcueLock: 1,
    token,
    instance: "fedcba9876543210fedcba9876543210",
    pid: 4242,
    host: "workstation",
    ns: "pid:[4026531836]/6a1f0c2e-90d5-4a8e-b4d9-1f2e3c4d5e6f",
    acquiredAt: Date.UTC(2026, 9, 8, 14, 2),
  };

  it("reads a holder's record, with or without a known namespace", () => {
    expect(lockRecordSchema.parse(record)).toEqual(record);
    expect(lockRecordSchema.parse({ ...record, ns: null })).toEqual({ ...record, ns: null });
  });

  it("refuses tokens that are not 32 lowercase hex digits, and long host names", () => {
    expect(lockRecordSchema.safeParse({ ...record, token: token.toUpperCase() }).success).toBe(false);
    expect(lockRecordSchema.safeParse({ ...record, token: token.slice(1) }).success).toBe(false);
    expect(lockRecordSchema.safeParse({ ...record, instance: "x".repeat(32) }).success).toBe(false);
    expect(lockRecordSchema.safeParse({ ...record, host: "h".repeat(255) }).success).toBe(true);
    expect(lockRecordSchema.safeParse({ ...record, host: "h".repeat(256) }).success).toBe(false);
    expect(lockRecordSchema.safeParse({ ...record, arcueLock: 2 }).success).toBe(false);
  });

  it("reads a waiter's record", () => {
    expect(lockWaitingSchema.parse({ arcueLockWaiting: 1, token, pid: 4242 })).toEqual({
      arcueLockWaiting: 1,
      token,
      pid: 4242,
    });
    expect(lockWaitingSchema.safeParse({ arcueLockWaiting: 1, token: "abc", pid: 4242 }).success).toBe(false);
  });
});
