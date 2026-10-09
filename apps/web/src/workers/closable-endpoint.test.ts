import { ArcueError, createMemoryChannel, createPeer } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { closableEndpoint } from "./closable-endpoint";

describe("closableEndpoint", () => {
  it("rejects a pending request at once when closed by hand", async () => {
    const [core] = createMemoryChannel();
    const closable = closableEndpoint(core);
    const peer = createPeer(closable.endpoint);
    const pending = peer.request("command", "import.run", {});
    closable.close();
    await expect(pending).rejects.toSatisfy((error) => error instanceof ArcueError && error.code === "disconnected");
  });

  it("still passes messages and port closes through", async () => {
    const [core, worker] = createMemoryChannel();
    const closable = closableEndpoint(core);
    createPeer(worker, { handleRequest: () => "parsed" });
    const peer = createPeer(closable.endpoint);
    await expect(peer.request("command", "import.run", {})).resolves.toBe("parsed");

    let closes = 0;
    peer.onClose(() => closes++);
    worker.close();
    await Promise.resolve();
    await Promise.resolve();
    expect(closes).toBe(1);
    closable.close();
    expect(closes).toBe(1);
  });
});
