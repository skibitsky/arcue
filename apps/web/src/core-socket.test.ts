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
    expect(coreSocketUrl({ protocol: "http:", host: "localhost:4530", search: "" })).toBe("ws://localhost:4530/core/2");
    expect(coreSocketUrl({ protocol: "https:", host: "arcue.test", search: "?sample=x" })).toBe(
      "wss://arcue.test/core/2",
    );
  });

  it("connects as the page of the view its address names", () => {
    expect(coreSocketUrl({ protocol: "http:", host: "localhost:4530", search: "?view=3f9a0c1d2b4e" })).toBe(
      "ws://localhost:4530/core/2?view=3f9a0c1d2b4e",
    );
    expect(coreSocketUrl({ protocol: "http:", host: "localhost:4530", search: "?view=a%26b" })).toBe(
      "ws://localhost:4530/core/2?view=a%26b",
    );
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
