import { describe, expect, it } from "vitest";
import { coreSocketUrl, webSocketStream } from "./core-socket";

class FakeSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;
  binaryType = "blob";
  readonly sent: number[][] = [];
  send(bytes: Uint8Array): void {
    this.sent.push([...bytes]);
  }
  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
  open(): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }
}

function fakeSocket(): { fake: FakeSocket; socket: WebSocket } {
  const fake = new FakeSocket();
  return { fake, socket: fake as unknown as WebSocket };
}

describe("the core socket", () => {
  it("connects to the core on the server the page came from", () => {
    expect(coreSocketUrl({ protocol: "http:", host: "localhost:4530" })).toBe("ws://localhost:4530/core");
    expect(coreSocketUrl({ protocol: "https:", host: "arcue.test" })).toBe("wss://arcue.test/core");
  });

  it("holds frames written before the socket opens, then sends them in order", () => {
    const { fake, socket } = fakeSocket();
    const stream = webSocketStream(socket);

    stream.write(Uint8Array.of(1));
    stream.write(Uint8Array.of(2, 3));
    expect(fake.sent).toEqual([]);
    fake.open();
    stream.write(Uint8Array.of(4));

    expect(fake.sent).toEqual([[1], [2, 3], [4]]);
    expect(fake.binaryType).toBe("arraybuffer");
  });

  it("passes binary messages on and reports the close once", () => {
    const { fake, socket } = fakeSocket();
    const stream = webSocketStream(socket);
    const received: number[][] = [];
    let closes = 0;
    stream.onData((bytes) => received.push([...bytes]));
    stream.onClose(() => closes++);

    fake.dispatchEvent(new MessageEvent("message", { data: Uint8Array.of(5, 6).buffer }));
    fake.dispatchEvent(new MessageEvent("message", { data: "text" }));
    stream.close();
    fake.dispatchEvent(new Event("close"));

    expect(received).toEqual([[5, 6]]);
    expect(closes).toBe(1);
  });
});
