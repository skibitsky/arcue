import type { MessageEndpoint } from "@arcue/protocol";

/**
 * Wraps an endpoint so its close listeners can also be called by hand, for when the host learns that the other side
 * is gone, such as a worker whose script failed to load, before the port could report it.
 */
export function closableEndpoint(endpoint: MessageEndpoint): { endpoint: MessageEndpoint; close(): void } {
  const listeners = new Set<() => void>();
  let closed = false;
  return {
    endpoint: {
      post: (message, transfer) => endpoint.post(message, transfer),
      listen: (listener) => endpoint.listen(listener),
      onClose(listener) {
        const stop = endpoint.onClose(listener);
        listeners.add(listener);
        return () => {
          stop();
          listeners.delete(listener);
        };
      },
    },
    close() {
      if (closed) return;
      closed = true;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
  };
}
