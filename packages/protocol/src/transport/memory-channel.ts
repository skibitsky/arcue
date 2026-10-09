import type { MessageEndpoint } from "./endpoint";

export interface MemoryEndpoint extends MessageEndpoint {
  /** Closes both sides, as closing a MessagePort does. */
  close(): void;
}

/**
 * Two connected endpoints in one thread, for tests and in-process workers. Each message is copied with
 * `structuredClone`, moving the transferred buffers, and arrives asynchronously, as it would through a MessagePort.
 */
export function createMemoryChannel(): [MemoryEndpoint, MemoryEndpoint] {
  type Listeners = { messages: Set<(message: unknown) => void>; closes: Set<() => void> };
  const first: Listeners = { messages: new Set(), closes: new Set() };
  const second: Listeners = { messages: new Set(), closes: new Set() };
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    void Promise.resolve().then(() => {
      for (const listener of [...first.closes, ...second.closes]) listener();
      first.closes.clear();
      second.closes.clear();
    });
  };

  const side = (own: Listeners, other: Listeners): MemoryEndpoint => ({
    post(message, transfer) {
      if (closed) return;
      const copy = structuredClone(message, { transfer: [...transfer] as Transferable[] });
      void Promise.resolve().then(() => {
        if (closed) return;
        for (const listener of [...other.messages]) listener(copy);
      });
    },
    listen(listener) {
      own.messages.add(listener);
      return () => {
        own.messages.delete(listener);
      };
    },
    onClose(listener) {
      own.closes.add(listener);
      return () => {
        own.closes.delete(listener);
      };
    },
    close,
  });

  return [side(first, second), side(second, first)];
}
