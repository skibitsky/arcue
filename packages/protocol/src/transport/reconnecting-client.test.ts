import { ReconnectingClient as ExportedClient } from "@arcue/protocol";
import { describe, expect, it, vi } from "vitest";
import type { ByteStream } from "./framed";
import { framedChannel, framedEndpoint } from "./framed";
import { jsonFrameCodec } from "./json-codec";
import type { MemoryEndpoint } from "./memory-channel";
import { createMemoryChannel } from "./memory-channel";
import { createPeer } from "./peer";
import type { CoreChannel } from "./reconnecting-client";
import { ReconnectingClient } from "./reconnecting-client";

/** A core stand-in on the far side of a fresh channel; returns the window's side and a way to emit events. */
function fakeCore(): { windowSide: MemoryEndpoint; emit(name: string, payload: unknown): void } {
  const [coreSide, windowSide] = createMemoryChannel();
  const peer = createPeer(coreSide, { handleRequest: () => ({ assets: [] }) });
  return { windowSide, emit: (name, payload) => peer.emit(name, payload) };
}

/** A channel over a byte stream that has already closed, whose close listeners run at once. */
function closedChannel(): CoreChannel {
  const stream: ByteStream = {
    write: () => undefined,
    onData: () => () => undefined,
    onClose: () => () => undefined,
    close: () => undefined,
  };
  const channel = framedChannel(stream, jsonFrameCodec);
  channel.close();
  return { ...framedEndpoint(channel), close: () => channel.close() };
}

describe("ReconnectingClient", () => {
  it("is part of the protocol package", () => {
    expect(ExportedClient).toBe(ReconnectingClient);
  });

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

  it("stays reconnecting and asks again for a channel that closed before it was attached", async () => {
    const onLost = vi.fn();
    const client = new ReconnectingClient({ handleRequest: () => null, onLost });
    const states: string[] = [];
    client.onConnectionChange((state) => states.push(state));

    client.attach(closedChannel());
    expect(client.connectionState).toBe("reconnecting");
    expect(onLost).toHaveBeenCalledTimes(1);

    client.attach(fakeCore().windowSide);
    client.attach(closedChannel());
    expect(client.connectionState).toBe("reconnecting");
    expect(onLost).toHaveBeenCalledTimes(2);
    expect(states).toEqual(["connected", "reconnecting", "connected", "reconnecting"]);
    await expect(client.query("asset.list", {})).rejects.toMatchObject({ code: "disconnected" });
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
