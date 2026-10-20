import type { ByteStream } from "@arcue/protocol";
import { SERVE_CORE_PATH, VIEW_PARAMETER } from "@arcue/protocol";

/**
 * The address of the core's socket on the server that served `location`. It names the agent session's view that the
 * page's address names, so the page connects as that view's page.
 */
export function coreSocketUrl(location: Pick<Location, "protocol" | "host" | "search">): string {
  const view = new URLSearchParams(location.search).get(VIEW_PARAMETER);
  const query = view === null ? "" : `?${new URLSearchParams({ [VIEW_PARAMETER]: view })}`;
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${SERVE_CORE_PATH}${query}`;
}

/** One frame per message. Frames written before the socket opens wait for it. */
export function webSocketStream(socket: WebSocket): ByteStream {
  socket.binaryType = "arraybuffer";
  const waiting: Uint8Array<ArrayBuffer>[] = [];
  socket.addEventListener("open", () => {
    for (const bytes of waiting.splice(0)) socket.send(bytes);
  });
  return {
    write(written) {
      const bytes = written as Uint8Array<ArrayBuffer>;
      if (socket.readyState === WebSocket.CONNECTING) waiting.push(bytes);
      else if (socket.readyState === WebSocket.OPEN) socket.send(bytes);
    },
    onData(listener) {
      const onMessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) listener(new Uint8Array(event.data));
      };
      socket.addEventListener("message", onMessage);
      return () => socket.removeEventListener("message", onMessage);
    },
    onClose(listener) {
      const onClose = () => listener();
      socket.addEventListener("close", onClose, { once: true });
      return () => socket.removeEventListener("close", onClose);
    },
    close: () => socket.close(),
  };
}
