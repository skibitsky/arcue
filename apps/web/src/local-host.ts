import type { CoreClient } from "@arcue/protocol";
import { createPeer, createRemoteClient, framedChannel, framedEndpoint, jsonFrameCodec } from "@arcue/protocol";
import type { WorkspaceStore } from "@arcue/ui";
import { createWorkspaceStore } from "@arcue/ui";
import { webSocketStream } from "./core-socket";

/**
 * The page `arcue serve` serves: a window of the core that runs on this computer's files, connected over a WebSocket to
 * the server it came from. The core reads models where they are, so the page opens none itself.
 */
export class LocalHost {
  readonly client: CoreClient;
  readonly store: WorkspaceStore;

  constructor(socket: WebSocket) {
    let store: WorkspaceStore | null = null;
    const peer = createPeer(framedEndpoint(framedChannel(webSocketStream(socket), jsonFrameCodec)), {
      handleRequest: (request) => {
        if (!store) throw new Error("The window is not ready.");
        return store.handleRequest(request);
      },
    });
    this.client = createRemoteClient(peer);
    store = createWorkspaceStore({ client: this.client });
    this.store = store;
    this.client.onConnectionChange((state) => {
      if (state === "closed") {
        store.notify({ message: "Arcue stopped. Run arcue serve again, then reload this page.", kind: "alert" });
      }
    });
  }

  /**
   * Shows the assets the core has open that no other page shows, as after a reload, in the views they had. A page
   * that is still open keeps its tabs and the drafts in them.
   */
  async adoptOpenAssets(): Promise<void> {
    const { assets } = await this.client.query("asset.list", {});
    for (const { assetId } of assets) await this.client.execute("view.moveAsset", { assetId, unlessShown: true });
  }
}
