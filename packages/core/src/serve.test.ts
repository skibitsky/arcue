import { createMemoryChannel, createPeer, createRemoteClient } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "./registry";
import { serveEndpoint } from "./serve";

function connectedClient() {
  const registry = new CommandRegistry();
  const [coreSide, windowSide] = createMemoryChannel();
  const window = createPeer(windowSide, { handleRequest: ({ name }) => ({ ranInWindow: name }) });
  const core = serveEndpoint(registry, coreSide, { connection: "window-1", caller: "window" });
  return { registry, core, window, client: createRemoteClient(window) };
}

describe("serveEndpoint", () => {
  it("answers remote commands through the registry", async () => {
    const { registry, client } = connectedClient();
    registry.handleCommand("asset.open", ({ path }) => ({ assetId: path }));
    await expect(client.execute("asset.open", { path: "/work/Hero.fbx" })).resolves.toEqual({
      assetId: "/work/Hero.fbx",
    });
    await expect(client.execute("asset.open", { path: "" })).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("forwards registry events until closed", async () => {
    const { registry, core, client } = connectedClient();
    registry.handleQuery("asset.list", () => ({ assets: [] }));
    const rounds: number[] = [];
    client.subscribe("round.copied", ({ round }) => rounds.push(round));
    registry.emit("round.copied", { assetId: "a1", round: 4 });
    await client.query("asset.list", {});
    core.close();
    registry.emit("round.copied", { assetId: "a1", round: 5 });
    await Promise.resolve();
    expect(rounds).toEqual([4]);
  });

  it("stops forwarding events when the other side closes the channel", async () => {
    const registry = new CommandRegistry();
    let subscribed = 0;
    const subscribeAll = registry.subscribeAll.bind(registry);
    registry.subscribeAll = (listener) => {
      subscribed++;
      const stop = subscribeAll(listener);
      return () => {
        subscribed--;
        stop();
      };
    };
    const [coreSide, windowSide] = createMemoryChannel();
    const core = serveEndpoint(registry, coreSide, { connection: "window-1", caller: "window" });
    expect(subscribed).toBe(1);
    const closed = new Promise<void>((resolve) => core.onClose(resolve));
    windowSide.close();
    await closed;
    expect(subscribed).toBe(0);
  });

  it("refuses internal commands from the command line and MCP", async () => {
    const registry = new CommandRegistry();
    registry.handleCommand("view.reportFocus", () => undefined);
    const [coreSide, bridgeSide] = createMemoryChannel();
    serveEndpoint(registry, coreSide, { connection: "cli-1", caller: "bridge" });
    const bridge = createRemoteClient(createPeer(bridgeSide));
    await expect(bridge.execute("view.reportFocus", {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(registry.execute("view.reportFocus", {})).resolves.toBeUndefined();
  });

  it("tells handlers which connection made the call", async () => {
    const { registry, client } = connectedClient();
    const connections: (string | null)[] = [];
    registry.handleCommand("asset.close", (_args, context) => {
      connections.push(context.connection);
    });
    await client.execute("asset.close", { assetId: "a1" });
    await registry.execute("asset.close", { assetId: "a1" });
    expect(connections).toEqual(["window-1", null]);
  });

  it("lets the core send view commands to the window", async () => {
    const { core } = connectedClient();
    await expect(core.request("command", "view.setFrame", { assetId: "a1", frame: 34 })).resolves.toEqual({
      ranInWindow: "view.setFrame",
    });
  });
});
