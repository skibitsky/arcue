import { describe, expect, it } from "vitest";
import { parseDeepLink } from "./deep-link";

describe("parseDeepLink", () => {
  it("reads a sample with a clip and frame", () => {
    expect(parseDeepLink("?sample=pebble-golem&clip=Armature%7CWalk&frame=12")).toEqual({
      sample: "pebble-golem",
      clip: "Armature|Walk",
      frame: 12,
    });
  });

  it("needs a sample, and drops a frame that is not a whole number", () => {
    expect(parseDeepLink("?clip=Walk")).toBeNull();
    expect(parseDeepLink("?sample=blob&frame=")).toEqual({ sample: "blob" });
    expect(parseDeepLink("?sample=blob&frame=-1")).toEqual({ sample: "blob" });
    expect(parseDeepLink("?sample=blob&frame=2.5")).toEqual({ sample: "blob" });
  });

  it("drops a frame past the protocol's limit", () => {
    expect(parseDeepLink("?sample=blob&frame=4294967295")).toEqual({ sample: "blob", frame: 4294967295 });
    expect(parseDeepLink("?sample=blob&frame=5000000000")).toEqual({ sample: "blob" });
    expect(parseDeepLink("?sample=blob&frame=99999999999999999999")).toEqual({ sample: "blob" });
  });
});
