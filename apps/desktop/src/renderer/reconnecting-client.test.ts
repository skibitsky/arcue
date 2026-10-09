import type { MemoryEndpoint } from "@arcue/protocol";
import { createMemoryChannel, createPeer } from "@arcue/protocol";
import { describe, expect, it, vi } from "vitest";
import { ReconnectingClient } from "./reconnecting-client";

/** A core stand-in on the far side of a fresh channel; returns the window's side and a way to emit events. */
function fakeCore(): { windowSide: MemoryEndpoint; emit(name: string, payload: unknown): void } {
  const [coreSide, windowSide] = createMemoryChannel();
  const peer = createPeer(coreSide, { handleRequest: () => ({ assets: [] }) });
  return { windowSide, emit: (name, payload) => peer.emit(name, payload) };
}

describe("ReconnectingClient", () => {
  it("rejects calls as disconnected until a channel is attached", async () => {
    const client = new ReconnectingClient({ handleRequest: () => null, onLost: () => undefined });
    expect(client.connectionState).toBe("reconnecting");
    await expect(client.query("asset.list", {})).rejects.toMatchObject({ code: "disconnected" });
    client.attach(fakeCore().windowSide);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("keeps subscriptions across channels and asks once for a new channel when one closes", async () => {
    const onLost = vi.fn();
    const client = new ReconnectingClient({ handleRequest: () => null, onLost });
    const closed: string[] = [];
    client.subscribe("asset.closed", ({ assetId }) => closed.push(assetId));
    const first = fakeCore();
    client.attach(first.windowSide);
    first.emit("asset.closed", { assetId: "a1" });
    await vi.waitFor(() => expect(closed).toEqual(["a1"]));

    first.windowSide.close();
    await vi.waitFor(() => expect(client.connectionState).toBe("reconnecting"));
    client.lost();
    expect(onLost).toHaveBeenCalledTimes(1);

    const second = fakeCore();
    client.attach(second.windowSide);
    second.emit("asset.closed", { assetId: "a2" });
    await vi.waitFor(() => expect(closed).toEqual(["a1", "a2"]));
    expect(client.connectionState).toBe("connected");
  });

  it("closes the channel it replaces, so the core drops that connection", async () => {
    const client = new ReconnectingClient({ handleRequest: () => null, onLost: () => undefined });
    const first = fakeCore();
    const onClose = vi.fn();
    first.windowSide.onClose(onClose);
    client.attach(first.windowSide);
    client.attach(fakeCore().windowSide);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    client.dispose();
    expect(client.connectionState).toBe("closed");
  });
});
