import { describe, expect, it } from "vitest";
import { parseArgs } from "./args";

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

  it("parses status and help", () => {
    expect(parseArgs(["status"])).toEqual({ command: "status" });
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
    expect(() => parseArgs(["status", "now"])).toThrow("takes no arguments");
  });
});
