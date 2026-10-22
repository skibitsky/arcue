import { describe, expect, it } from "vitest";
import { parseArgs, USAGE } from "./args";

describe("parseArgs", () => {
  it("parses open with a clip and a frame, in either order and with = values", () => {
    expect(parseArgs(["open", "Hero.fbx", "--clip", "Armature|Charge", "--frame", "34"])).toEqual({
      command: "open",
      path: "Hero.fbx",
      clip: "Armature|Charge",
      frame: 34,
    });
    expect(parseArgs(["open", "--frame=0", "--clip=Armature|Walk", "Hero.fbx"])).toEqual({
      command: "open",
      path: "Hero.fbx",
      clip: "Armature|Walk",
      frame: 0,
    });
  });

  it("parses open with only a file", () => {
    expect(parseArgs(["open", "a b/Hero.fbx"])).toEqual({ command: "open", path: "a b/Hero.fbx" });
  });

  it("parses open and status with a view, and open with a move", () => {
    expect(parseArgs(["open", "Hero.fbx", "--view", "review", "--move"])).toEqual({
      command: "open",
      path: "Hero.fbx",
      view: "review",
      move: true,
    });
    expect(parseArgs(["status", "--view=review"])).toEqual({ command: "status", view: "review" });
  });

  it("parses inspect with and without --json", () => {
    expect(parseArgs(["inspect", "Hero.fbx"])).toEqual({ command: "inspect", path: "Hero.fbx", json: false });
    expect(parseArgs(["inspect", "--json", "a b/Hero.fbx"])).toEqual({
      command: "inspect",
      path: "a b/Hero.fbx",
      json: true,
    });
  });

  it("parses serve with and without a port", () => {
    expect(parseArgs(["serve"])).toEqual({ command: "serve" });
    expect(parseArgs(["serve", "--port", "8123"])).toEqual({ command: "serve", port: 8123 });
    expect(parseArgs(["serve", "--port=1"])).toEqual({ command: "serve", port: 1 });
  });

  it("parses serve --detach, alone, with a port and repeated", () => {
    expect(parseArgs(["serve", "--detach"])).toEqual({ command: "serve", detach: true });
    expect(parseArgs(["serve", "--detach", "--port", "8123"])).toEqual({ command: "serve", port: 8123, detach: true });
    expect(parseArgs(["serve", "--detach", "--detach"])).toEqual({ command: "serve", detach: true });
    expect(() => parseArgs(["serve", "--detach=x"])).toThrow("--detach takes no value.");
    expect(() => parseArgs(["serve", "--port", "0", "--detach"])).toThrow("from 1 to 65535");
  });

  it("parses the hidden --idle-stop-ms only without --detach", () => {
    expect(parseArgs(["serve", "--idle-stop-ms", "5"])).toEqual({ command: "serve", idleStopMs: 5 });
    expect(parseArgs(["serve", "--port=4600", "--idle-stop-ms=1800000"])).toEqual({
      command: "serve",
      port: 4600,
      idleStopMs: 1_800_000,
    });
    for (const value of ["0", "1.5", "-1", "x"]) {
      expect(() => parseArgs(["serve", "--idle-stop-ms", value]), value).toThrow(
        `--idle-stop-ms takes a whole number of milliseconds from 1, got "${value}".`,
      );
    }
    expect(parseArgs(["serve", "--idle-stop-ms", "2147483647"])).toEqual({
      command: "serve",
      idleStopMs: 2_147_483_647,
    });
    for (const value of ["2147483648", "9007199254740993", "99999999999999999999"]) {
      expect(() => parseArgs(["serve", "--idle-stop-ms", value]), value).toThrow(
        `--idle-stop-ms takes at most 2147483647 milliseconds, got "${value}".`,
      );
    }
    expect(() => parseArgs(["serve", "--idle-stop-ms"])).toThrow("--idle-stop-ms needs a value.");
    expect(() => parseArgs(["serve", "--detach", "--idle-stop-ms", "5"])).toThrow("--idle-stop-ms is set by --detach.");
    expect(USAGE).not.toContain("--idle-stop-ms");
  });

  it("parses stop, which takes no arguments", () => {
    expect(parseArgs(["stop"])).toEqual({ command: "stop" });
    expect(() => parseArgs(["stop", "now"])).toThrow('"arcue stop" takes no arguments, got "now".');
    expect(USAGE).toMatch(/^ {2}arcue stop$/m);
  });

  it("parses status and help", () => {
    expect(parseArgs(["status"])).toEqual({ command: "status" });
    expect(parseArgs(["setup"])).toEqual({ command: "setup" });
    expect(parseArgs([])).toEqual({ command: "help" });
    expect(parseArgs(["--help"])).toEqual({ command: "help" });
  });

  it("refuses missing files, extra files, bad frames and unknown options", () => {
    expect(() => parseArgs(["open"])).toThrow("needs a file");
    expect(() => parseArgs(["open", "a.fbx", "b.fbx"])).toThrow("takes one file");
    expect(() => parseArgs(["open", "a.fbx", "--frame", "-1"])).toThrow("whole number");
    expect(() => parseArgs(["open", "a.fbx", "--frame", "1.5"])).toThrow("whole number");
    expect(() => parseArgs(["open", "a.fbx", "--clip"])).toThrow("needs a value");
    expect(() => parseArgs(["open", "a.fbx", "--speed", "2"])).toThrow('Unknown option "--speed"');
    expect(() => parseArgs(["close"])).toThrow('Unknown command "close"');
    expect(() => parseArgs(["status", "now", "a b"])).toThrow(
      '"arcue status" takes no arguments but --view, got "now a b".',
    );
    expect(() => parseArgs(["status", "--view"])).toThrow("--view needs a value");
    expect(() => parseArgs(["status", "--move"])).toThrow('Unknown option "--move"');
    expect(() => parseArgs(["open", "a.fbx", "--view="])).toThrow("--view needs a value");
    expect(() => parseArgs(["open", "a.fbx", "--move=yes"])).toThrow('Unknown option "--move=yes"');
    expect(() => parseArgs(["setup", "now"])).toThrow('"arcue setup" takes no arguments, got "now".');
    expect(() => parseArgs(["inspect"])).toThrow("needs a file");
    expect(() => parseArgs(["inspect", "--json"])).toThrow("needs a file");
    expect(() => parseArgs(["inspect", "a.fbx", "b.fbx"])).toThrow("takes one file");
    expect(() => parseArgs(["inspect", "a.fbx", "--frame", "1"])).toThrow('Unknown option "--frame"');
    expect(() => parseArgs(["serve", "--port"])).toThrow("needs a value");
    expect(() => parseArgs(["serve", "--port", "0"])).toThrow("from 1 to 65535");
    expect(() => parseArgs(["serve", "--port", "65536"])).toThrow("from 1 to 65535");
    expect(() => parseArgs(["serve", "--port", "80a"])).toThrow("from 1 to 65535");
    expect(() => parseArgs(["serve", "Hero.fbx"])).toThrow("takes no file");
    expect(() => parseArgs(["serve", "--open"])).toThrow('Unknown option "--open"');
  });
});
