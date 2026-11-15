import { describe, expect, it } from "vitest";
import { unzip } from "./test-unzip";
import { zip } from "./zip";

describe("zip", () => {
  it("holds each file under its name, compressed where that helps, the same every time", () => {
    const text = Buffer.from("Arcue ".repeat(200));
    const random = Buffer.from(Array.from({ length: 64 }, (_, index) => (index * 151 + 7) % 256));
    const entries = [
      { name: "manifest.json", bytes: text },
      { name: "server/ünïcode.bin", bytes: random },
      { name: "empty.txt", bytes: new Uint8Array() },
    ];
    const archive = zip(entries);

    expect([...unzip(archive)]).toEqual([
      ["manifest.json", text],
      ["server/ünïcode.bin", random],
      ["empty.txt", Buffer.alloc(0)],
    ]);
    expect(archive.length).toBeLessThan(text.length);
    expect(zip(entries).equals(archive)).toBe(true);
  });

  it("refuses names that would land outside the folder it is extracted to, or twice", () => {
    for (const name of ["/etc/passwd", "../up", "a/../../up", "a\\b", ""]) {
      expect(() => zip([{ name, bytes: new Uint8Array() }])).toThrow("is not a path an archive can hold");
    }
    expect(() =>
      zip([
        { name: "a", bytes: new Uint8Array() },
        { name: "a", bytes: new Uint8Array() },
      ]),
    ).toThrow("holds a twice");
  });
});
