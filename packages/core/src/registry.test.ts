import { ArcueError } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "./registry";

describe("CommandRegistry commands", () => {
  it("passes validated input, with defaults applied, to the handler", async () => {
    const registry = new CommandRegistry();
    const received: unknown[] = [];
    registry.handleCommand("view.screenshot", (args) => {
      received.push(args);
      return { png: new Uint8Array(0) };
    });
    await registry.execute("view.screenshot", { assetId: "a1", width: 640 });
    expect(received).toEqual([{ assetId: "a1", width: 640, height: 720, drawComments: false }]);
  });

  it("returns the handler's output", async () => {
    const registry = new CommandRegistry();
    registry.handleCommand("asset.open", async ({ path }) => ({ assetId: `asset:${path}` }));
    await expect(registry.execute("asset.open", { path: "/work/Hero.fbx" })).resolves.toEqual({
      assetId: "asset:/work/Hero.fbx",
    });
  });

  it("rejects invalid input before the handler runs", async () => {
    const registry = new CommandRegistry();
    let called = false;
    registry.handleCommand("comment.reopen", () => {
      called = true;
    });
    const failure = registry.dispatch("command", "comment.reopen", { assetId: "a1", commentId: "c1", text: " " });
    await expect(failure).rejects.toMatchObject({ code: "invalid-input" });
    const error = await failure.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ArcueError);
    expect((error as ArcueError).issues[0]?.path).toEqual(["text"]);
    expect(called).toBe(false);
  });

  it("rejects unknown commands and queries", async () => {
    const registry = new CommandRegistry();
    await expect(registry.dispatch("command", "asset.explode", {})).rejects.toMatchObject({ code: "unknown-command" });
    await expect(registry.dispatch("query", "asset.open", {})).rejects.toMatchObject({ code: "unknown-command" });
    await expect(registry.dispatch("command", "constructor", {})).rejects.toMatchObject({ code: "unknown-command" });
  });

  it("rejects known commands that have no handler", async () => {
    const registry = new CommandRegistry();
    await expect(registry.execute("asset.close", { assetId: "a1" })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("allows one handler per command until it is removed", async () => {
    const registry = new CommandRegistry();
    const remove = registry.handleCommand("asset.close", () => undefined);
    expect(() => registry.handleCommand("asset.close", () => undefined)).toThrow(ArcueError);
    remove();
    registry.handleCommand("asset.close", () => undefined);
    await expect(registry.execute("asset.close", { assetId: "a1" })).resolves.toBeUndefined();
  });

  it("keeps handler errors that carry a code and wraps the rest as internal", async () => {
    const registry = new CommandRegistry();
    registry.handleCommand("asset.close", () => {
      throw new ArcueError("not-found", "No asset a1 is open.");
    });
    registry.handleCommand("asset.reload", () => {
      throw new TypeError("parser crashed");
    });
    await expect(registry.execute("asset.close", { assetId: "a1" })).rejects.toMatchObject({ code: "not-found" });
    const error = await registry.execute("asset.reload", { assetId: "a1" }).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "internal" });
    expect((error as ArcueError).cause).toBeInstanceOf(TypeError);
  });
});

describe("CommandRegistry queries", () => {
  it("dispatches to the query handler", async () => {
    const registry = new CommandRegistry();
    registry.handleQuery("asset.list", () => ({ assets: [] }));
    await expect(registry.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });
});

describe("CommandRegistry events", () => {
  it("delivers events to listeners of that event and to listeners of all events", () => {
    const registry = new CommandRegistry();
    const named: unknown[] = [];
    const all: unknown[] = [];
    registry.subscribe("round.copied", (payload) => named.push(payload));
    registry.subscribeAll((name, payload) => all.push([name, payload]));
    registry.emit("round.copied", { assetId: "a1", round: 4 });
    registry.emit("asset.closed", { assetId: "a1" });
    expect(named).toEqual([{ assetId: "a1", round: 4 }]);
    expect(all).toEqual([
      ["round.copied", { assetId: "a1", round: 4 }],
      ["asset.closed", { assetId: "a1" }],
    ]);
  });

  it("stops delivering after unsubscribe", () => {
    const registry = new CommandRegistry();
    const payloads: unknown[] = [];
    const unsubscribe = registry.subscribe("asset.closed", (payload) => payloads.push(payload));
    unsubscribe();
    registry.emit("asset.closed", { assetId: "a1" });
    expect(payloads).toEqual([]);
  });

  it("never throws from emit, and reports a listener's error while the others still run", () => {
    const errors: unknown[] = [];
    const registry = new CommandRegistry({ onListenerError: (error, event) => errors.push([event, error]) });
    let reached = false;
    registry.subscribe("asset.closed", () => {
      throw new Error("listener failed");
    });
    registry.subscribe("asset.closed", () => {
      reached = true;
    });
    expect(() => registry.emit("asset.closed", { assetId: "a1" })).not.toThrow();
    expect(reached).toBe(true);
    expect(errors).toEqual([["asset.closed", new Error("listener failed")]]);
  });

  it("is always connected", () => {
    const registry = new CommandRegistry();
    expect(registry.connectionState).toBe("connected");
    registry.onConnectionChange(() => undefined)();
  });
});
