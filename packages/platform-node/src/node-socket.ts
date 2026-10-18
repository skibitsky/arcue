import type { Socket } from "node:net";
import type { ByteStream } from "@arcue/protocol";

/** A socket error ends the stream, as its "close" event follows. */
export function socketStream(socket: Socket): ByteStream {
  socket.on("error", () => socket.destroy());
  return {
    write: (bytes) => {
      socket.write(bytes);
    },
    onData(listener) {
      socket.on("data", listener);
      return () => socket.off("data", listener);
    },
    onClose(listener) {
      const once = () => listener();
      socket.once("close", once);
      return () => socket.off("close", once);
    },
    close: () => socket.destroy(),
  };
}
