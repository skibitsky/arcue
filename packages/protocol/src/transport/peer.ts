import { ArcueError, fromWireError, toWireError } from "../errors";
import type { ListenerErrorHandler } from "../listener-errors";
import { callEach, reportListenerError } from "../listener-errors";
import type { MessageEndpoint, Transfer } from "./endpoint";
import type { Envelope, RequestEnvelope, RequestKind } from "./envelope";
import { isEnvelope } from "./envelope";

export interface IncomingRequest {
  kind: RequestKind;
  name: string;
  input: unknown;
}

export type RequestHandler = (request: IncomingRequest) => unknown;

/** Calls `callback` once after `delayMs`; the returned function cancels it. */
export type SetTimer = (delayMs: number, callback: () => void) => () => void;

export interface PeerOptions {
  /** Answers requests from the other side. Without it, every request fails as "unavailable". */
  handleRequest?: RequestHandler;
  /** Rejects a request as "timeout" when no response arrives within `ms`. The host supplies the timer. */
  requestTimeout?: { ms: number; setTimer: SetTimer };
  /** Receives errors thrown by event and close listeners. By default they surface as unhandled rejections. */
  onListenerError?: ListenerErrorHandler;
}

/** One side of a two-way channel: either side can send requests and events. */
export interface Peer {
  request(kind: RequestKind, name: string, input: unknown, transfer?: Transfer): Promise<unknown>;
  emit(name: string, payload: unknown, transfer?: Transfer): void;
  onEvent(listener: (name: string, payload: unknown) => void): () => void;
  /** Calls the listener once when the peer closes, through `close()` or because the endpoint closed. */
  onClose(listener: () => void): () => void;
  /** Stops listening and rejects pending requests as "disconnected". It does not close the underlying port. */
  close(): void;
}

const resultTransfers = new WeakMap<object, Transfer>();

/** Marks a request handler's result so the listed buffers move to the other side instead of being copied. */
export function withTransfer<Value extends object>(value: Value, transfer: Transfer): Value {
  resultTransfers.set(value, transfer);
  return value;
}

interface Pending {
  resolve(output: unknown): void;
  reject(error: unknown): void;
  cancelTimer(): void;
}

export function createPeer(endpoint: MessageEndpoint, options: PeerOptions = {}): Peer {
  let nextId = 1;
  let closed = false;
  const pending = new Map<number, Pending>();
  const eventListeners = new Set<(name: string, payload: unknown) => void>();
  const closeListeners = new Set<() => void>();
  const onListenerError = options.onListenerError ?? reportListenerError;
  let unlisten = () => {};
  let unlistenClose = () => {};

  const post = (message: Envelope, transfer: Transfer = []) => {
    if (!closed) endpoint.post(message, transfer);
  };

  const postFailure = (id: number, error: unknown) => {
    try {
      post({ type: "response", id, ok: false, error: toWireError(error) });
    } catch {
      // The channel is gone; nobody is left to tell.
    }
  };

  const answer = (id: number, output: unknown) => {
    try {
      const transfer = typeof output === "object" && output !== null ? resultTransfers.get(output) : undefined;
      post({ type: "response", id, ok: true, output }, transfer);
    } catch (error) {
      postFailure(id, error);
    }
  };

  /**
   * Answers at once when the handler returns a value, before the work its change sets off in later microtasks, such as
   * a window's render, and otherwise once its promise settles.
   */
  const respond = ({ id, kind, name, input }: RequestEnvelope) => {
    let output: unknown;
    try {
      if (!options.handleRequest)
        throw new ArcueError("unavailable", `This side does not answer requests ("${name}").`);
      output = options.handleRequest({ kind, name, input });
    } catch (error) {
      postFailure(id, error);
      return;
    }
    if (isPromiseLike(output)) {
      output.then(
        (value) => answer(id, value),
        (error: unknown) => postFailure(id, error),
      );
    } else {
      answer(id, output);
    }
  };

  const settle = (id: number, settleWith: (entry: Pending) => void) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.cancelTimer();
    settleWith(entry);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    unlisten();
    unlistenClose();
    const error = new ArcueError("disconnected", "The connection closed before a response arrived.");
    for (const id of [...pending.keys()]) settle(id, (entry) => entry.reject(error));
    eventListeners.clear();
    const listeners = [...closeListeners];
    closeListeners.clear();
    callEach(listeners, [], onListenerError);
  };

  unlisten = endpoint.listen((message) => {
    if (closed || !isEnvelope(message)) return;
    if (message.type === "request") {
      respond(message);
    } else if (message.type === "response") {
      if (message.ok) settle(message.id, (entry) => entry.resolve(message.output));
      else settle(message.id, (entry) => entry.reject(fromWireError(message.error)));
    } else {
      callEach(eventListeners, [message.name, message.payload], onListenerError);
    }
  });
  unlistenClose = endpoint.onClose(close);

  return {
    request(kind, name, input, transfer = []) {
      if (closed) return Promise.reject(new ArcueError("disconnected", "The connection is closed."));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timeout = options.requestTimeout;
        const cancelTimer = timeout
          ? timeout.setTimer(timeout.ms, () =>
              settle(id, (entry) =>
                entry.reject(new ArcueError("timeout", `"${name}" got no response within ${timeout.ms} ms.`)),
              ),
            )
          : () => undefined;
        pending.set(id, { resolve, reject, cancelTimer });
        try {
          post({ type: "request", id, kind, name, input }, transfer);
        } catch (error) {
          settle(id, (entry) => entry.reject(error));
        }
      });
    },
    emit(name, payload, transfer = []) {
      post({ type: "event", name, payload }, transfer);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    onClose(listener) {
      if (closed) {
        callEach([listener], [], onListenerError);
        return () => undefined;
      }
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
    close,
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}
