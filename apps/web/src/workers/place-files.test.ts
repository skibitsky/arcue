import { MemoryPlatform } from "@arcue/core";
import { describe, expect, it } from "vitest";
import { placeFile } from "./place-files";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("placeFile", () => {
  it("writes a new file, reuses one with the same bytes, and never replaces a different one", async () => {
    const platform = new MemoryPlatform({
      files: { "/files/Hero/Sword.fbx": bytes(1), "/files/Hero/Sword-2.fbx": bytes(2) },
    });
    await expect(placeFile(platform, { path: "/files/Hero/Shield.fbx", bytes: bytes(5) })).resolves.toEqual({
      path: "/files/Hero/Shield.fbx",
      created: true,
    });
    await expect(placeFile(platform, { path: "/files/Hero/Sword.fbx", bytes: bytes(1) })).resolves.toEqual({
      path: "/files/Hero/Sword.fbx",
      created: false,
    });
    await expect(placeFile(platform, { path: "/files/Hero/Sword.fbx", bytes: bytes(2) })).resolves.toEqual({
      path: "/files/Hero/Sword-2.fbx",
      created: false,
    });
    await expect(placeFile(platform, { path: "/files/Hero/Sword.fbx", bytes: bytes(3) })).resolves.toEqual({
      path: "/files/Hero/Sword-3.fbx",
      created: true,
    });
    expect([...(await platform.readFile("/files/Hero/Sword.fbx"))]).toEqual([1]);
    expect([...(await platform.readFile("/files/Hero/Sword-3.fbx"))]).toEqual([3]);
  });
});
