import { describe, expect, it } from "vitest";
import { macSigning } from "./signing";

const KEY = {
  ARCUE_APPLE_API_KEY: "/tmp/AuthKey.p8",
  ARCUE_APPLE_API_KEY_ID: "ABC123",
  ARCUE_APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000",
};

describe("macSigning", () => {
  it("signs ad hoc without an identity", () => {
    expect(macSigning({})).toBeNull();
    expect(macSigning({ ARCUE_MACOS_IDENTITY: "  " })).toBeNull();
  });

  it("signs with the identity, and notarizes with a complete API key", () => {
    expect(macSigning({ ARCUE_MACOS_IDENTITY: "Developer ID Application: A (T)" })).toEqual({
      identity: "Developer ID Application: A (T)",
    });
    expect(
      macSigning({
        ARCUE_MACOS_IDENTITY: "Developer ID Application: A (T)",
        ARCUE_MACOS_KEYCHAIN: "/k.keychain-db",
        ...KEY,
      }),
    ).toEqual({
      identity: "Developer ID Application: A (T)",
      keychain: "/k.keychain-db",
      notarize: { appleApiKey: "/tmp/AuthKey.p8", appleApiKeyId: "ABC123", appleApiIssuer: KEY.ARCUE_APPLE_API_ISSUER },
    });
  });

  it("refuses half a configuration rather than ship an app that is not notarized", () => {
    expect(() => macSigning({ ARCUE_MACOS_IDENTITY: "D", ARCUE_APPLE_API_KEY: "/k.p8" })).toThrow(/together/);
    expect(() => macSigning(KEY)).toThrow(/needs a Developer ID identity/);
  });
});
