import type { Envelope } from "./envelope";

/** Objects to move to the other side instead of copying, such as ArrayBuffers. */
export type Transfer = readonly object[];

/** One side of a message channel, as a peer uses it. */
export interface MessageEndpoint {
  post(message: Envelope, transfer: Transfer): void;
  listen(listener: (message: unknown) => void): () => void;
  /**
   * Calls the listener once when the channel closes or the other side goes away. Endpoints that cannot detect this,
   * such as a Worker's global scope, never call it; peers rely on a request timeout there.
   */
  onClose(listener: () => void): () => void;
}

type PortListener = (event: unknown) => void;

function eventData(event: unknown): unknown {
  return typeof event === "object" && event !== null && "data" in event ? event.data : undefined;
}

/** A DOM MessagePort, a Worker, a worker's global scope, or a Node worker_threads MessagePort. */
export interface PortLike {
  /** Typed `never[]` so that DOM ports, workers and Node's worker_threads ports, whose transfer types differ, all fit. */
  postMessage(message: unknown, transfer: never[]): void;
  addEventListener(type: "message" | "close", listener: PortListener): void;
  removeEventListener(type: "message" | "close", listener: PortListener): void;
  start?(): void;
}

/** An Electron MessagePortMain, or a utility process's parentPort. */
export interface EmitterPortLike {
  postMessage(message: unknown): void;
  on(event: "message" | "close", listener: PortListener): unknown;
  off(event: "message" | "close", listener: PortListener): unknown;
  start?(): void;
}

/** Listens for the "close" event that MessagePorts fire when either side closes. */
export function portEndpoint(port: PortLike): MessageEndpoint {
  return {
    post: (message, transfer) => port.postMessage(message, [...transfer] as never[]),
    listen(listener) {
      const onMessage: PortListener = (event) => listener(eventData(event));
      port.addEventListener("message", onMessage);
      port.start?.();
      return () => port.removeEventListener("message", onMessage);
    },
    onClose(listener) {
      const onClose: PortListener = () => listener();
      port.addEventListener("close", onClose);
      return () => port.removeEventListener("close", onClose);
    },
  };
}

/** Electron's main-process ports cannot transfer buffers, so this endpoint copies them. */
export function emitterEndpoint(port: EmitterPortLike): MessageEndpoint {
  return {
    post: (message) => port.postMessage(message),
    listen(listener) {
      const onMessage: PortListener = (event) => listener(eventData(event));
      port.on("message", onMessage);
      port.start?.();
      return () => port.off("message", onMessage);
    },
    onClose(listener) {
      const onClose: PortListener = () => listener();
      port.on("close", onClose);
      return () => port.off("close", onClose);
    },
  };
}
