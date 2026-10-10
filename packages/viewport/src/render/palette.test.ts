import { describe, expect, it } from "vitest";
import tokensCss from "../../../ui/src/tokens.css?raw";
import { VIEWPORT_CSS } from "../overlay/styles";
import { DEFAULT_PALETTE, TOKEN_DEFAULTS } from "./palette";

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function stylesheetTokens(): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, value] of tokensCss.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) tokens.set(name, normalize(value));
  }
  const resolve = (value: string): string =>
    value.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => resolve(tokens.get(name) ?? ""));
  return new Map([...tokens].map(([name, value]) => [name, resolve(value)]));
}

describe("the view's colors", () => {
  it("default to the values in the UI's tokens.css, the one source of color", () => {
    const tokens = stylesheetTokens();
    for (const [name, value] of Object.entries(TOKEN_DEFAULTS)) {
      expect({ name, value: normalize(value) }).toEqual({ name, value: tokens.get(name) });
    }
    expect(Object.values(DEFAULT_PALETTE).every((color) => Object.values(TOKEN_DEFAULTS).includes(color))).toBe(true);
  });

  it("reference only tokens that have defaults", () => {
    const used = new Set([...VIEWPORT_CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map(([, name]) => name));
    expect([...used].filter((name) => name === undefined || !(name in TOKEN_DEFAULTS))).toEqual([]);
  });
});
