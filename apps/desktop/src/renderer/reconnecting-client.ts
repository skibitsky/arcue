import type {
  CommandInput,
  CommandName,
  CommandOutput,
  ConnectionState,
  CoreClient,
  EventName,
  EventPayload,
  ListenerErrorHandler,
  MessageEndpoint,
  Peer,
  QueryInput,
  QueryName,
  QueryOutput,
  RequestHandler,
  Unsubscribe,
} from "@arcue/protocol";
import { ArcueError, createPeer, reportListenerError } from "@arcue/protocol";

/** A channel to the core that the window can close, so the core drops a connection the window no longer uses. */
export interface CoreChannel extends MessageEndpoint {
  close(): void;
}

export interface ReconnectingClientOptions {
  /** Answers the core's requests to this window, such as view commands. */
  handleRequest: RequestHandler;
  /** Called once each time the connection is lost, so the host can ask for a new port. */
  onLost(): void;
  onListenerError?: ListenerErrorHandler;
}

/**
 * A window's `CoreClient` that survives core restarts. It is "reconnecting" until the host attaches a port, then
 * "connected" until that port closes or the host reports the core lost, and "closed" once disposed. Subscriptions
 * carry over from one connection to the next; calls made while reconnecting reject as "disconnected".
 */
export class ReconnectingClient implements CoreClient {
  readonly #options: ReconnectingClientOptions;
  readonly #listeners = new Map<string, Set<(payload: unknown) => void>>();
  readonly #connectionListeners = new Set<(state: ConnectionState) => void>();
  #peer: Peer | null = null;
  #channel: CoreChannel | null = null;
  #state: ConnectionState = "reconnecting";

  constructor(options: ReconnectingClientOptions) {
    this.#options = options;
  }

  get connectionState(): ConnectionState {
    return this.#state;
  }

  /** Starts using a new channel to the core, replacing the previous one. */
  attach(channel: CoreChannel): void {
    if (this.#state === "closed") {
      channel.close();
      return;
    }
    this.#drop();
    const peer = createPeer(channel, {
      handleRequest: this.#options.handleRequest,
      onListenerError: this.#onListenerError,
    });
    this.#peer = peer;
    this.#channel = channel;
    peer.onEvent((name, payload) => this.#dispatch(name, payload));
    peer.onClose(() => {
      if (this.#peer === peer) this.lost();
    });
    this.#setState("connected");
  }

  /** The connection is gone, as when the main process reports that the core stopped. */
  lost(): void {
    if (this.#state === "closed") return;
    this.#drop();
    if (this.#state === "reconnecting") return;
    this.#setState("reconnecting");
    this.#options.onLost();
  }

  dispose(): void {
    this.#drop();
    this.#setState("closed");
  }

  #drop(): void {
    const peer = this.#peer;
    const channel = this.#channel;
    this.#peer = null;
    this.#channel = null;
    peer?.close();
    channel?.close();
  }

  onConnectionChange(listener: (state: ConnectionState) => void): Unsubscribe {
    this.#connectionListeners.add(listener);
    return () => {
      this.#connectionListeners.delete(listener);
    };
  }

  execute<Name extends CommandName>(name: Name, input: CommandInput<Name>): Promise<CommandOutput<Name>> {
    return this.#request("command", name, input) as Promise<CommandOutput<Name>>;
  }

  query<Name extends QueryName>(name: Name, input: QueryInput<Name>): Promise<QueryOutput<Name>> {
    return this.#request("query", name, input) as Promise<QueryOutput<Name>>;
  }

  subscribe<Name extends EventName>(name: Name, listener: (payload: EventPayload<Name>) => void): Unsubscribe {
    const forName = this.#listeners.get(name) ?? new Set();
    this.#listeners.set(name, forName);
    const entry = (payload: unknown) => listener(payload as EventPayload<Name>);
    forName.add(entry);
    return () => {
      forName.delete(entry);
    };
  }

  #request(kind: "command" | "query", name: string, input: unknown): Promise<unknown> {
    if (!this.#peer) return Promise.reject(new ArcueError("disconnected", "Arcue is reconnecting to its core."));
    return this.#peer.request(kind, name, input);
  }

  readonly #onListenerError = (error: unknown) => (this.#options.onListenerError ?? reportListenerError)(error);

  #dispatch(name: string, payload: unknown): void {
    for (const listener of [...(this.#listeners.get(name) ?? [])]) {
      try {
        listener(payload);
      } catch (error) {
        this.#onListenerError(error);
      }
    }
  }

  #setState(state: ConnectionState): void {
    if (this.#state === state) return;
    this.#state = state;
    for (const listener of [...this.#connectionListeners]) {
      try {
        listener(state);
      } catch (error) {
        this.#onListenerError(error);
      }
    }
  }
}
