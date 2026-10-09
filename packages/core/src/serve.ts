import type { ListenerErrorHandler, MessageEndpoint, Peer } from "@arcue/protocol";
import { createPeer } from "@arcue/protocol";
import type { CommandRegistry } from "./registry";

export interface ServeOptions {
  /** A name for this channel, unique among the core's connections; handlers see it as `context.connection`. */
  connection: string;
  /** Who is on the other side. Bridges, the command line and MCP, cannot call internal commands. */
  caller: "window" | "bridge";
  /** Receives errors thrown by the peer's event and close listeners. By default they surface as unhandled rejections. */
  onListenerError?: ListenerErrorHandler;
}

/**
 * Connects a window or a bridge to the registry: answers its requests and forwards every event to it. Handlers see
 * the options as `context.connection` and `context.caller`. Forwarding stops when the peer closes, including when the
 * channel closes from the other side. The returned peer also lets the core send requests the other way, such as view
 * commands to a window.
 */
export function serveEndpoint(
  registry: CommandRegistry,
  endpoint: MessageEndpoint,
  { connection, caller, onListenerError }: ServeOptions,
): Peer {
  const peer = createPeer(endpoint, {
    handleRequest: ({ kind, name, input }) => registry.dispatch(kind, name, input, { connection, caller }),
    ...(onListenerError ? { onListenerError } : {}),
  });
  const unsubscribe = registry.subscribeAll((name, payload) => peer.emit(name, payload));
  peer.onClose(unsubscribe);
  return peer;
}
