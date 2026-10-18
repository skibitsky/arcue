import type { ByteStream } from "@arcue/protocol";
import { SERVE_CORE_PATH } from "@arcue/protocol";

/** The address of the core's socket on the server that served `location`. */
export function coreSocketUrl(location: Pick<Location, "protocol" | "host">): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${SERVE_CORE_PATH}`;
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
