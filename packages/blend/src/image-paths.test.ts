import { describe, expect, it } from "vitest";
import { sequencePath, tilePath } from "./image-paths.js";

describe("tilePath", () => {
  it("puts the tile's number in place of Blender's <UDIM> token", () => {
    expect(tilePath("//textures/udim.<UDIM>.png", 1001)).toBe("//textures/udim.1001.png");
    expect(tilePath("udim.<UDIM>.png", 1012)).toBe("udim.1012.png");
  });

  it("puts the tile's column and row in place of the <UVTILE> token", () => {
    expect(tilePath("paint_<UVTILE>.png", 1001)).toBe("paint_u1_v1.png");
    expect(tilePath("paint_<UVTILE>.png", 1002)).toBe("paint_u2_v1.png");
    expect(tilePath("paint_<UVTILE>.png", 1011)).toBe("paint_u1_v2.png");
  });

  it("keeps a path without a token", () => {
    expect(tilePath("udim.1001.png", 1002)).toBe("udim.1001.png");
  });
});

describe("sequencePath", () => {
  it("replaces the last number of the file name with the frame, padded as wide", () => {
    expect(sequencePath("//textures/seq.0001.png", 12)).toBe("//textures/seq.0012.png");
    expect(sequencePath("shot2/take_3_frame7.exr", 123)).toBe("shot2/take_3_frame123.exr");
    expect(sequencePath("C:\\renders\\v2\\beauty.001.png", 4)).toBe("C:\\renders\\v2\\beauty.004.png");
  });

  it("reads frames before zero as zero", () => {
    expect(sequencePath("seq.0001.png", -3)).toBe("seq.0000.png");
  });

  it("puts the frame before the extension of a name without a number, and nothing for frame zero", () => {
    expect(sequencePath("frames.v2/still.png", 3)).toBe("frames.v2/still3.png");
    expect(sequencePath("frames.v2/still.png", 0)).toBe("frames.v2/still.png");
    expect(sequencePath(".hidden5", 2)).toBe(".hidden2");
  });
});
