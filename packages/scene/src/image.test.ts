import { describe, expect, it } from "vitest";
import { fileNameOf, imageMimeType } from "./image";

const UNKNOWN_BYTES = Uint8Array.of(0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0);

describe("imageMimeType", () => {
  it("takes the type from the bytes' signature over the path's extension", () => {
    expect(imageMimeType(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "rock.jpg")).toBe("image/png");
  });

  it("falls back to the extension, in any case, for bytes without a known signature", () => {
    expect(imageMimeType(UNKNOWN_BYTES, "Textures\\Rock.TGA")).toBe("image/x-tga");
  });

  it.each(["tex.constructor", "tex.toString", "tex.__proto__", "tex.hasOwnProperty", "tex", "tex.unknown"])(
    "gives a generic type for %s",
    (path) => {
      expect(imageMimeType(UNKNOWN_BYTES, path)).toBe("application/octet-stream");
    },
  );
});

describe("fileNameOf", () => {
  it("takes the name after either separator", () => {
    expect(fileNameOf("C:\\art/textures\\rock.png")).toBe("rock.png");
  });
});
