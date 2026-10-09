import type { CommentOverlay } from "../viewport";

interface PinElement {
  button: HTMLButtonElement;
  dot: HTMLSpanElement;
}

export interface PinPlacement {
  x: number;
  y: number;
  onScreen: boolean;
  /** False when the surface under the pin faces away or something hides it. */
  surfaceVisible: boolean;
}

export class PinLayer {
  private readonly pins = new Map<string, PinElement>();
  private readonly layer: HTMLElement;
  private readonly onClick: (id: string) => void;
  private readonly onHover: (id: string | null) => void;

  constructor(layer: HTMLElement, onClick: (id: string) => void, onHover: (id: string | null) => void) {
    this.layer = layer;
    this.onClick = onClick;
    this.onHover = onHover;
  }

  sync(overlays: readonly CommentOverlay[]): void {
    const keep = new Set(overlays.map((overlay) => overlay.id));
    for (const [id, pin] of this.pins) {
      if (keep.has(id)) continue;
      pin.button.remove();
      this.pins.delete(id);
    }
    for (const overlay of overlays) {
      const pin = this.pins.get(overlay.id) ?? this.create(overlay.id);
      const pending = overlay.pending === true;
      const number = pending ? null : overlay.number;
      const label = number === null ? "" : String(number);
      if (pin.dot.textContent !== label) pin.dot.textContent = label;
      pin.button.setAttribute("aria-label", number === null ? "Comment" : `Comment ${number}`);
      pin.button.classList.toggle("is-selected", overlay.selected);
      pin.button.classList.toggle("is-pending", pending);
      pin.button.classList.toggle("is-sent", !pending && overlay.state === "sent");
      pin.button.classList.toggle("is-resolved", !pending && overlay.state === "resolved");
    }
  }

  place(id: string, placement: PinPlacement | null): void {
    const pin = this.pins.get(id);
    if (!pin) return;
    if (!placement?.onScreen) {
      pin.button.classList.add("is-offscreen");
      return;
    }
    pin.button.classList.remove("is-offscreen");
    pin.button.style.transform = `translate3d(${placement.x.toFixed(1)}px, ${placement.y.toFixed(1)}px, 0)`;
    pin.button.classList.toggle("is-hidden-surface", !placement.surfaceVisible);
  }

  setHovered(id: string | null): void {
    for (const [pinId, pin] of this.pins) pin.button.classList.toggle("is-hovered", pinId === id);
  }

  private create(id: string): PinElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "arcue-vp-pin is-offscreen";
    button.dataset.overlayId = id;
    const dot = document.createElement("span");
    dot.className = "arcue-vp-pin-dot";
    button.append(dot);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onClick(id);
    });
    button.addEventListener("pointerenter", () => this.onHover(id));
    button.addEventListener("pointerleave", () => this.onHover(null));
    this.layer.append(button);
    const pin = { button, dot };
    this.pins.set(id, pin);
    return pin;
  }

  dispose(): void {
    for (const pin of this.pins.values()) pin.button.remove();
    this.pins.clear();
  }
}
