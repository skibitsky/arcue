// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { probePage, servedPage } from "./served-page";

const BUILD = "/assets/index-a1b2c3.js";

function page({ marker = true, script = BUILD }: { marker?: boolean; script?: string | null } = {}): string {
  return [
    "<!doctype html><html><head>",
    marker ? '<meta name="arcue-page" content="local" />' : "",
    script === null ? "" : `<script type="module" crossorigin src="${script}"></script>`,
    '</head><body><div id="app"></div></body></html>',
  ].join("");
}

function answering(response: { ok: boolean; text: string }) {
  return vi.fn(async () => ({ ok: response.ok, text: async () => response.text }));
}

describe("the served page", () => {
  it("is down for HTML without the arcue-page marker, whatever script it names", () => {
    expect(servedPage(page({ marker: false }), BUILD)).toBe("down");
    expect(servedPage(page({ marker: false, script: "/assets/other.js" }), BUILD)).toBe("down");
    expect(servedPage(page().replace('content="local"', 'content="web"'), BUILD)).toBe("down");
    expect(servedPage("Not found", BUILD)).toBe("down");
  });

  it("is the same page for the script this page loaded, or for a marked page that names none", () => {
    expect(servedPage(page(), BUILD)).toBe("same");
    expect(servedPage(page({ script: null }), BUILD)).toBe("same");
  });

  it("names the script of another build", () => {
    expect(servedPage(page({ script: "/assets/index-d4e5f6.js" }), BUILD)).toEqual({
      changed: "/assets/index-d4e5f6.js",
    });
    expect(servedPage(page(), null)).toEqual({ changed: BUILD });
  });

  it("reads / again past the cache", async () => {
    const fetchPage = answering({ ok: true, text: page({ script: "/assets/index-d4e5f6.js" }) });

    await expect(probePage(BUILD, fetchPage)).resolves.toEqual({ changed: "/assets/index-d4e5f6.js" });
    expect(fetchPage).toHaveBeenCalledWith("/", { cache: "no-store", signal: expect.any(AbortSignal) });
  });

  it("is down when the server answers with an error or not at all", async () => {
    await expect(probePage(BUILD, answering({ ok: false, text: page({ script: "/assets/x.js" }) }))).resolves.toBe(
      "down",
    );
    const refused = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(probePage(BUILD, refused)).resolves.toBe("down");
    const cut = vi.fn(async () => ({
      ok: true,
      text: async () => {
        throw new TypeError("The connection was reset.");
      },
    }));
    await expect(probePage(BUILD, cut)).resolves.toBe("down");
  });
});
