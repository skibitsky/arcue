import { describe, expect, it } from "vitest";
import { dataUrls, objectUrls } from "./image-urls";

describe("image URLs", () => {
  it("makes data URLs of any size, which need no revoking", () => {
    const bytes = Uint8Array.from({ length: 0x8000 * 2 + 3 }, (_, index) => index % 256);
    const url = dataUrls.create(bytes, "image/png");
    expect(url?.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(url?.slice("data:image/png;base64,".length) ?? "", "base64")).toEqual(Buffer.from(bytes));
    expect(() => dataUrls.revoke(url ?? "")).not.toThrow();
  });

  it("makes object URLs of the bytes by default", async () => {
    const url = objectUrls.create(Uint8Array.of(1, 2, 3), "image/png");
    expect(url).toMatch(/^blob:/);
    objectUrls.revoke(url ?? "");
  });
});
