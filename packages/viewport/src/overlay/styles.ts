import { cssToken, cssVar } from "../render/palette";

const STYLE_ID = "arcue-viewport-styles";

export const VIEWPORT_CSS = `
.arcue-vp {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(120% 95% at 50% 32%, ${cssVar("viewportGlow")}, ${cssVar("viewportEdge")} 78%);
}
.arcue-vp-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  outline: none;
}
.arcue-vp-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.arcue-vp-pin {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  padding: 0;
  border: 0;
  background: none;
  pointer-events: auto;
  cursor: pointer;
  z-index: 2;
}
.arcue-vp-pin-dot {
  position: absolute;
  left: 0;
  top: 0;
  width: ${cssToken("--size-pin")};
  height: ${cssToken("--size-pin")};
  translate: -50% -50%;
  border-radius: ${cssToken("--radius-full")};
  background: ${cssVar("feedback")};
  color: ${cssVar("feedbackInk")};
  font: ${cssToken("--weight-bold")} ${cssToken("--text-xs")} / ${cssToken("--size-pin")} ${cssToken("--font-sans")};
  font-variant-numeric: tabular-nums;
  text-align: center;
  box-shadow: 0 0 0 2px ${cssVar("surfaceDesk")}, ${cssToken("--shadow-tooltip")};
  transition: transform ${cssToken("--duration-fast")} ${cssToken("--ease-standard")},
    opacity ${cssToken("--duration-fast")} ${cssToken("--ease-standard")},
    box-shadow ${cssToken("--duration-fast")} ${cssToken("--ease-standard")},
    background-color ${cssToken("--duration-fast")} ${cssToken("--ease-standard")};
  animation: arcue-vp-pin-in ${cssToken("--duration-slow")} ${cssToken("--ease-standard")};
}
@keyframes arcue-vp-pin-in {
  from {
    scale: 0.4;
    opacity: 0;
    color: transparent;
  }
  50% {
    color: transparent;
  }
}
.arcue-vp-pin:hover .arcue-vp-pin-dot,
.arcue-vp-pin.is-hovered .arcue-vp-pin-dot {
  transform: scale(1.14);
  background: ${cssVar("feedbackHover")};
}
.arcue-vp-pin.is-selected .arcue-vp-pin-dot {
  transform: scale(1.14);
  background: ${cssVar("feedback")};
  box-shadow: 0 0 0 2px ${cssVar("surfaceDesk")}, 0 0 0 6px ${cssVar("feedbackRing")},
    ${cssToken("--shadow-tooltip")};
}
.arcue-vp-pin.is-sent .arcue-vp-pin-dot {
  background: ${cssVar("feedbackSent")};
  color: ${cssVar("text")};
}
.arcue-vp-pin.is-resolved .arcue-vp-pin-dot {
  background: ${cssVar("feedbackResolved")};
  color: ${cssVar("feedbackResolvedInk")};
}
.arcue-vp-pin.is-pending .arcue-vp-pin-dot::after {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 1.5px solid ${cssVar("feedback")};
  opacity: 0;
  animation: arcue-vp-pin-lock ${cssToken("--duration-slow")} ${cssToken("--ease-standard")} 0.08s both;
}
@keyframes arcue-vp-pin-lock {
  from {
    scale: 1.7;
    opacity: 0;
  }
  45% {
    opacity: 0.85;
  }
  to {
    scale: 1;
    opacity: 0;
  }
}
.arcue-vp-pin.is-hidden-surface .arcue-vp-pin-dot {
  opacity: 0.42;
}
.arcue-vp-pin.is-offscreen {
  visibility: hidden;
}
.arcue-vp-brush {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 50%;
  border: 1.5px solid ${cssVar("text")};
  box-shadow: 0 0 0 1px ${cssVar("surfaceDesk")};
  opacity: 0.8;
  pointer-events: none;
  z-index: 3;
  transition: border-color ${cssToken("--duration-fast")} ${cssToken("--ease-standard")},
    background-color ${cssToken("--duration-fast")} ${cssToken("--ease-standard")},
    opacity ${cssToken("--duration-fast")} ${cssToken("--ease-standard")};
}
.arcue-vp-brush.is-painting {
  opacity: 1;
  border-color: ${cssVar("feedback")};
  background: ${cssToken("--feedback-soft")};
}
@media (prefers-reduced-motion: reduce) {
  .arcue-vp-pin-dot,
  .arcue-vp-brush {
    transition: none;
  }
  .arcue-vp-pin-dot,
  .arcue-vp-pin.is-pending .arcue-vp-pin-dot::after {
    animation: none;
  }
}
`;

export function installStyles(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = VIEWPORT_CSS;
  document.head.append(style);
}
