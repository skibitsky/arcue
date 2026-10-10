/**
 * The colors the 3D view uses, read from the UI tokens on its container. The defaults equal the values in
 * `packages/ui/src/tokens.css`, so the view still looks right on a page without the stylesheet.
 */
export interface Palette {
  feedback: string;
  feedbackHover: string;
  feedbackInk: string;
  feedbackSent: string;
  feedbackResolved: string;
  feedbackResolvedInk: string;
  feedbackRing: string;
  alert: string;
  viewportGlow: string;
  viewportEdge: string;
  surfaceDesk: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  textFaint: string;
}

export const DEFAULT_PALETTE: Palette = {
  feedback: "#dd653d",
  feedbackHover: "#e37c59",
  feedbackInk: "#1b1a18",
  feedbackSent: "#a3401c",
  feedbackResolved: "#515a47",
  feedbackResolvedInk: "#b6b1a8",
  feedbackRing: "rgba(221, 101, 61, 0.35)",
  alert: "#ebb773",
  viewportGlow: "#2d2b28",
  viewportEdge: "#1a1917",
  surfaceDesk: "#121110",
  surfaceRaised: "#292725",
  text: "#ede9e2",
  textMuted: "#b6b1a8",
  textFaint: "#8f8a82",
};

const TOKENS: Record<keyof Palette, string> = {
  feedback: "--feedback",
  feedbackHover: "--feedback-hover",
  feedbackInk: "--feedback-ink",
  feedbackSent: "--feedback-sent",
  feedbackResolved: "--feedback-resolved",
  feedbackResolvedInk: "--feedback-resolved-ink",
  feedbackRing: "--feedback-ring",
  alert: "--alert",
  viewportGlow: "--viewport-glow",
  viewportEdge: "--viewport-edge",
  surfaceDesk: "--surface-desk",
  surfaceRaised: "--surface-raised",
  text: "--text",
  textMuted: "--text-muted",
  textFaint: "--text-faint",
};

/** Every UI token the view's stylesheet uses, with the value `tokens.css` gives it; the fallback when it is missing. */
export const TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(TOKENS).map(([key, token]) => [token, DEFAULT_PALETTE[key as keyof Palette]])),
  "--feedback-soft": "rgba(221, 101, 61, 0.16)",
  "--size-pin": "22px",
  "--radius-full": "999px",
  "--weight-bold": "700",
  "--text-xs": "11.5px",
  "--font-sans": '"Figtree Variable", "Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  "--shadow-tooltip": "0 6px 18px rgba(0, 0, 0, 0.45)",
  "--duration-fast": "0.15s",
  "--ease-standard": "ease-out",
};

export function readPalette(element: Element): Palette {
  const style = getComputedStyle(element);
  const palette = { ...DEFAULT_PALETTE };
  for (const key of Object.keys(TOKENS) as (keyof Palette)[]) {
    const value = style.getPropertyValue(TOKENS[key]).trim();
    if (value !== "") palette[key] = value;
  }
  return palette;
}

export function cssVar(key: keyof Palette): string {
  return cssToken(TOKENS[key]);
}

/** `var(--token, its tokens.css value)`. */
export function cssToken(token: string): string {
  return `var(${token}, ${TOKEN_DEFAULTS[token] ?? "initial"})`;
}

/** sRGB bytes of a CSS color, resolved by a 2D canvas so any CSS color syntax works. */
export function colorBytes(color: string): [number, number, number, number] {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [0, 0, 0, 255];
  context.fillStyle = "#000";
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a];
}
