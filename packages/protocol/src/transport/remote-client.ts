import type { ConnectionState, CoreClient } from "../client";
import type { CommandInput, CommandName, CommandOutput } from "../commands";
import type { EventName, EventPayload } from "../events";
import type { ListenerErrorHandler } from "../listener-errors";
import { callEach, reportListenerError } from "../listener-errors";
import type { QueryInput, QueryName, QueryOutput } from "../queries";
import type { Peer } from "./peer";

export interface RemoteClientOptions {
  /** Receives errors thrown by event listeners. By default they surface as unhandled rejections. */
  onListenerError?: ListenerErrorHandler;
}

/**
 * A `CoreClient` that sends every call through a peer to the core on the other side. It is "connected" until the
 * peer closes, then "closed"; a host that reconnects wraps it to report "reconnecting".
 */
export function createRemoteClient(peer: Peer, options: RemoteClientOptions = {}): CoreClient {
  const onListenerError = options.onListenerError ?? reportListenerError;
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const connectionListeners = new Set<(state: ConnectionState) => void>();
  let connectionState: ConnectionState = "connected";
  peer.onEvent((name, payload) => {
    callEach(listeners.get(name) ?? [], [payload], onListenerError);
  });
  peer.onClose(() => {
    connectionState = "closed";
    callEach(connectionListeners, ["closed"], onListenerError);
  });

  return {
    get connectionState() {
      return connectionState;
    },
    onConnectionChange(listener) {
      connectionListeners.add(listener);
      return () => {
        connectionListeners.delete(listener);
      };
    },
    execute<Name extends CommandName>(name: Name, input: CommandInput<Name>) {
      return peer.request("command", name, input) as Promise<CommandOutput<Name>>;
    },
    query<Name extends QueryName>(name: Name, input: QueryInput<Name>) {
      return peer.request("query", name, input) as Promise<QueryOutput<Name>>;
    },
    subscribe<Name extends EventName>(name: Name, listener: (payload: EventPayload<Name>) => void) {
      const forName = listeners.get(name) ?? new Set();
      listeners.set(name, forName);
      const entry = (payload: unknown) => listener(payload as EventPayload<Name>);
      forName.add(entry);
      return () => {
        forName.delete(entry);
      };
    },
  };
}
