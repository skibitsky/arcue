import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { CommandError } from "./signing";
import { ENTITLEMENTS, macSigning, notarySubmission, notarytoolFailure } from "./signing";

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

describe("the Developer ID signature", () => {
  it("entitles the app to JIT and nothing else", async () => {
    const plist = await readFile(ENTITLEMENTS, "utf8");
    const entitlements = [...plist.matchAll(/<key>([^<]*)<\/key>\s*<(\w+)\/>/g)].map((match) => [match[1], match[2]]);

    expect(entitlements).toEqual([["com.apple.security.cs.allow-jit", "true"]]);
    expect(plist.match(/<key>/g)).toHaveLength(1);
  });
});

describe("notarySubmission", () => {
  it("reads the id and status that notarytool prints", () => {
    expect(notarySubmission('{"id":"2efe2717","status":"Invalid","message":"Processing complete"}\n')).toEqual({
      id: "2efe2717",
      status: "Invalid",
    });
  });

  it("is empty when notarytool printed no JSON", () => {
    expect(notarySubmission("")).toEqual({});
    expect(notarySubmission("Error: HTTP status code: 401. Unable to authenticate.")).toEqual({});
    expect(notarySubmission("[]")).toEqual({});
    expect(notarySubmission('{"id":7}')).toEqual({});
  });
});

describe("notarytoolFailure", () => {
  const command = `Command failed: xcrun notarytool submit Arcue.dmg --key ${KEY.ARCUE_APPLE_API_KEY} --key-id ${KEY.ARCUE_APPLE_API_KEY_ID} --issuer ${KEY.ARCUE_APPLE_API_ISSUER}`;

  it("says how notarytool exited, whatever it printed, without its command line", () => {
    const printed = [
      { stdout: "", stderr: "Error: HTTP status code: 401. Unable to authenticate." },
      { stdout: '{"id":"2efe2717","status":"Invalid","message":"Processing complete"}\n', stderr: "" },
      {
        stdout:
          "Conducting pre-submission checks for Arcue.dmg and initiating connection to the Apple notary service...",
        stderr: "",
      },
    ];
    for (const output of printed) {
      const failure = notarytoolFailure({ code: 69, signal: null, message: command, ...output });
      expect(failure).toBe("notarytool exited with 69");
    }
  });

  it("reads the exit code from the error that execFile rejects with", async () => {
    const error: CommandError = await promisify(execFile)(process.execPath, [
      "-e",
      "process.exit(3)",
      "--",
      "--key-id",
      KEY.ARCUE_APPLE_API_KEY_ID,
    ]).then(
      () => ({}),
      (rejected: CommandError) => rejected,
    );

    expect(error.message).toContain(KEY.ARCUE_APPLE_API_KEY_ID);
    expect(notarytoolFailure(error)).toBe("notarytool exited with 3");
  });

  it("names the signal that stopped notarytool", () => {
    expect(notarytoolFailure({ code: null, signal: "SIGTERM", message: command, stdout: "", stderr: "" })).toBe(
      "notarytool was stopped by SIGTERM",
    );
  });

  it("says why notarytool did not run", () => {
    expect(notarytoolFailure({ code: "ENOENT", message: "spawn xcrun ENOENT" })).toBe("spawn xcrun ENOENT");
    expect(notarytoolFailure({})).toBe("notarytool did not run");
  });
});
