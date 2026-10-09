import type { Platform } from "@arcue/core";
import { dirname, pathInside } from "@arcue/core";
import type { CoreClient, Unsubscribe } from "@arcue/protocol";
import { FILES_FOLDER } from "../files";

/**
 * Removes an opened model's folder, with the textures copied beside it, when its asset closes, so the in-memory
 * platform does not keep every file opened since the page loaded. Review data lives elsewhere and stays.
 */
export function freeClosedFiles(
  core: Pick<CoreClient, "subscribe">,
  platform: Pick<Platform, "remove">,
  onError: (error: unknown) => void,
): Unsubscribe {
  const paths = new Map<string, string>();
  const stopOpened = core.subscribe("asset.opened", ({ asset }) => paths.set(asset.assetId, asset.path));
  const stopClosed = core.subscribe("asset.closed", ({ assetId }) => {
    const path = paths.get(assetId);
    paths.delete(assetId);
    if (!path) return;
    const folder = dirname(path);
    if (pathInside(FILES_FOLDER, folder)) platform.remove(folder).catch(onError);
  });
  return () => {
    stopOpened();
    stopClosed();
  };
}
