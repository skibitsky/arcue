import { fileURLToPath } from "node:url";

/**
 * The entitlements of every file in the app that a Developer ID signs: only JIT, which V8 needs under the hardened
 * runtime. @electron/osx-sign's defaults would also ask for the camera, microphone, location, photos and more.
 */
export const ENTITLEMENTS = fileURLToPath(new URL("entitlements.plist", import.meta.url));

/** A Developer ID identity, and App Store Connect API credentials when the app is notarized as well. */
export interface MacSigning {
  /** Such as "Developer ID Application: Name (TEAMID)". */
  identity: string;
  /** The keychain that holds the identity, when it is not in the default search list. */
  keychain?: string;
  notarize?: { appleApiKey: string; appleApiKeyId: string; appleApiIssuer: string };
}

/**
 * How to sign the macOS app, from `ARCUE_MACOS_IDENTITY`, `ARCUE_MACOS_KEYCHAIN` and, to notarize too, the path of an
 * App Store Connect API key in `ARCUE_APPLE_API_KEY` with `ARCUE_APPLE_API_KEY_ID` and `ARCUE_APPLE_API_ISSUER`. Null
 * without an identity: the app is then signed ad hoc, which needs no certificate, and is not notarized.
 */
export function macSigning(env: NodeJS.ProcessEnv): MacSigning | null {
  const value = (name: string) => env[name]?.trim() || undefined;
  const identity = value("ARCUE_MACOS_IDENTITY");
  const keychain = value("ARCUE_MACOS_KEYCHAIN");
  const key = {
    appleApiKey: value("ARCUE_APPLE_API_KEY"),
    appleApiKeyId: value("ARCUE_APPLE_API_KEY_ID"),
    appleApiIssuer: value("ARCUE_APPLE_API_ISSUER"),
  };
  const given = Object.values(key).filter(Boolean).length;
  if (given > 0 && given < 3) {
    throw new Error(
      "Notarizing needs ARCUE_APPLE_API_KEY, ARCUE_APPLE_API_KEY_ID and ARCUE_APPLE_API_ISSUER together.",
    );
  }
  if (!identity) {
    if (given > 0) throw new Error("Notarizing needs a Developer ID identity in ARCUE_MACOS_IDENTITY.");
    return null;
  }
  const { appleApiKey, appleApiKeyId, appleApiIssuer } = key;
  return {
    identity,
    ...(keychain ? { keychain } : {}),
    ...(appleApiKey && appleApiKeyId && appleApiIssuer
      ? { notarize: { appleApiKey, appleApiKeyId, appleApiIssuer } }
      : {}),
  };
}

/** A notarization that `notarytool submit --output-format json` reports. */
export interface NotarySubmission {
  id?: string;
  status?: string;
}

/** The submission in notarytool's JSON output, or none when it printed no JSON, as when it fails before submitting. */
export function notarySubmission(stdout: string): NotarySubmission {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null) return {};
  const { id, status } = value as Record<string, unknown>;
  return { ...(typeof id === "string" ? { id } : {}), ...(typeof status === "string" ? { status } : {}) };
}

/** What `execFile` rejects with when a command fails or does not run. */
export interface CommandError {
  code?: unknown;
  signal?: unknown;
  message?: string;
  stdout?: string;
  stderr?: string;
}

/** Why notarytool failed, without its command line, which holds the API key's id and issuer. */
export function notarytoolFailure(error: CommandError): string {
  if (typeof error.code === "number") return `notarytool exited with ${error.code}`;
  if (error.signal) return `notarytool was stopped by ${String(error.signal)}`;
  return error.message ?? "notarytool did not run";
}
