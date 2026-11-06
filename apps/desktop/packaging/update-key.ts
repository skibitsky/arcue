/**
 * The Ed25519 public keys, as base64 SPKI, whose signature on a release's update.json installed apps accept. Add one
 * with `pnpm --filter @arcue/desktop update-key`, and keep an old key while apps that trust only it still update.
 */
export const UPDATE_KEYS: readonly string[] = [];
