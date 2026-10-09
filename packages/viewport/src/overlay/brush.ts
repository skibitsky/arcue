const MIN_BRUSH_RADIUS = 4;
const MAX_BRUSH_RADIUS = 200;

export class BrushCursor {
  private readonly element: HTMLDivElement;
  private radius = 22;

  constructor(layer: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "arcue-vp-brush";
    this.element.hidden = true;
    layer.append(this.element);
    this.setRadius(this.radius);
  }

  get size(): number {
    return this.radius;
  }

  setRadius(radius: number): void {
    this.radius = Math.min(MAX_BRUSH_RADIUS, Math.max(MIN_BRUSH_RADIUS, Number.isFinite(radius) ? radius : 22));
    this.element.style.width = `${this.radius * 2}px`;
    this.element.style.height = `${this.radius * 2}px`;
  }

  moveTo(x: number, y: number): void {
    this.element.style.transform = `translate3d(${(x - this.radius).toFixed(1)}px, ${(y - this.radius).toFixed(1)}px, 0)`;
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  setPainting(painting: boolean): void {
    this.element.classList.toggle("is-painting", painting);
  }

  dispose(): void {
    this.element.remove();
  }
}
