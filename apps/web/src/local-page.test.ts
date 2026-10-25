// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { localHostOptions } from "./local-page";

const VIEW = "3f9a0c1d2b4e";
const BUILD = "/assets/index-a1b2c3.js";

function served(owner: string, script = BUILD): string {
  return [
    "<!doctype html><html><head>",
    `<meta name="arcue-owner" content="${owner}" />`,
    '<meta name="arcue-page" content="local" />',
    `<script type="module" crossorigin src="${script}"></script>`,
    "</head><body></body></html>",
  ].join("");
}

/** The options of a page that "mine" served with BUILD, whose probes find `answer` at "/". */
function options(answer: string) {
  const fetch = vi.fn(async () => ({ ok: true, text: async () => answer }));
  const built = localHostOptions({
    document: new DOMParser().parseFromString(served("mine"), "text/html"),
    location: { protocol: "http:", host: "localhost:4530", search: `?view=${VIEW}`, reload: vi.fn() },
    storage: null,
    fetch,
  });
  return { built, fetch };
}

describe("localHostOptions", () => {
  it("names the owner the served page names, and probes for its owner and build", async () => {
    const { built, fetch } = options(served("another"));

    expect(built).toMatchObject({ owner: "mine", view: VIEW, storage: null });
    await expect(built.probe?.()).resolves.toBe("elsewhere");
    expect(fetch).toHaveBeenCalledWith("/", expect.objectContaining({ cache: "no-store" }));
    await expect(options(served("mine")).built.probe?.()).resolves.toBe("same");
    await expect(options(served("mine", "/assets/index-new.js")).built.probe?.()).resolves.toEqual({
      changed: "/assets/index-new.js",
    });
  });
});
