import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, isAllowedRequest, isAppUrl, rendererFile } from "./security";

const dev = "http://localhost:5174";

describe("the content security policy", () => {
  it("allows only the app's own code in a built app", () => {
    const policy = contentSecurityPolicy(null);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toContain("http");
  });

  it("lets the dev server's scripts and hot reload socket in", () => {
    const policy = contentSecurityPolicy(dev);
    expect(policy).toContain(`script-src 'self' ${dev} 'unsafe-inline'`);
    expect(policy).toContain("ws://localhost:5174");
  });
});

describe("navigation and requests", () => {
  it("treats only the app's pages as the app", () => {
    expect(isAppUrl("arcue://app/index.html", null)).toBe(true);
    expect(isAppUrl("arcue://evil/index.html", null)).toBe(false);
    expect(isAppUrl("https://example.com/", null)).toBe(false);
    expect(isAppUrl("file:///etc/passwd", null)).toBe(false);
    expect(isAppUrl(`${dev}/src/main.tsx`, null)).toBe(false);
    expect(isAppUrl(`${dev}/src/main.tsx`, dev)).toBe(true);
    expect(isAppUrl("not a url", dev)).toBe(false);
  });

  it("blocks remote requests and allows blobs", () => {
    expect(isAllowedRequest("blob:arcue://app/123", null)).toBe(true);
    expect(isAllowedRequest("https://fonts.example.com/a.woff2", null)).toBe(false);
    expect(isAllowedRequest("ws://localhost:5174/", dev)).toBe(true);
  });
});

describe("rendererFile", () => {
  const root = resolve("/app/dist/renderer");

  it("maps URLs to files under the renderer folder", () => {
    expect(rendererFile(root, "arcue://app/")).toBe(join(root, "index.html"));
    expect(rendererFile(root, "arcue://app/assets/index-1.js")).toBe(join(root, "assets", "index-1.js"));
  });

  it("refuses paths that leave the folder", () => {
    expect(rendererFile(root, "arcue://app/..%2F..%2Fmain.js")).toBeNull();
    expect(rendererFile(root, "arcue://app/%2e%2e/secret")).toBeNull();
  });
});
