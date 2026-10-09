import type { Camera, Scene, WebGLRenderer } from "three";
import { FloatType, NearestFilter, RGBAFormat, WebGLRenderTarget } from "three";
import { PICK_LAYER } from "./model";

export interface IdSample {
  /** Index into the scene's meshes, or -1 where no mesh covers the pixel. */
  mesh: number;
  triangle: number;
  /** Distance from the camera along its view direction. */
  depth: number;
}

const NO_HIT: IdSample = { mesh: -1, triangle: -1, depth: Number.POSITIVE_INFINITY };

/** A block of ID pass pixels read back from the GPU, addressed in CSS pixels from the top left like pointer events. */
export class IdPixels {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  private readonly data: Float32Array;

  constructor(x: number, y: number, width: number, height: number, data: Float32Array) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.data = data;
  }

  contains(x: number, y: number): boolean {
    return x >= this.x && y >= this.y && x < this.x + this.width && y < this.y + this.height;
  }

  at(x: number, y: number): IdSample {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (!this.contains(px, py)) return NO_HIT;
    const row = this.height - 1 - (py - this.y);
    const offset = (row * this.width + (px - this.x)) * 4;
    const mesh = Math.round(this.data[offset] ?? 0) - 1;
    if (mesh < 0) return NO_HIT;
    return {
      mesh,
      triangle: Math.round(this.data[offset + 1] ?? 0),
      depth: this.data[offset + 2] ?? 0,
    };
  }
}

/**
 * Renders the posed meshes into an offscreen float target with each pixel's mesh, triangle and depth, and
 * reads pixels back for picking, painting and pin visibility. It renders again only when the view or pose changed.
 */
export class IdPass {
  private readonly target: WebGLRenderTarget;
  private readonly renderer: WebGLRenderer;
  private renderedVersion = -1;

  constructor(renderer: WebGLRenderer, width = 1, height = 1) {
    this.renderer = renderer;
    this.target = new WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
      type: FloatType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
  }

  get width(): number {
    return this.target.width;
  }

  get height(): number {
    return this.target.height;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.target.width && h === this.target.height) return;
    this.target.setSize(w, h);
    this.renderedVersion = -1;
  }

  invalidate(): void {
    this.renderedVersion = -1;
  }

  /** Renders the pass unless it was last rendered for the same view version. */
  render(scene: Scene, camera: Camera, version: number): void {
    if (version === this.renderedVersion) return;
    const previousTarget = this.renderer.getRenderTarget();
    const previousMask = camera.layers.mask;
    camera.layers.set(PICK_LAYER);
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(previousTarget);
    camera.layers.mask = previousMask;
    this.renderedVersion = version;
  }

  /** Reads the pixels of a rectangle in CSS pixels from the top left, clipped to the target. */
  read(x: number, y: number, width: number, height: number): IdPixels {
    const rect = this.clip(x, y, width, height);
    const data = new Float32Array(Math.max(1, rect.width * rect.height) * 4);
    if (rect.width > 0 && rect.height > 0) {
      this.renderer.readRenderTargetPixels(this.target, rect.x, rect.glY, rect.width, rect.height, data);
    }
    return new IdPixels(rect.x, rect.y, rect.width, rect.height, data);
  }

  /** Like `read`, without stalling the GPU; the result describes the pass as it was rendered when this was called. */
  async readAsync(x: number, y: number, width: number, height: number): Promise<IdPixels> {
    const rect = this.clip(x, y, width, height);
    const data = new Float32Array(Math.max(1, rect.width * rect.height) * 4);
    if (rect.width > 0 && rect.height > 0) {
      await this.renderer.readRenderTargetPixelsAsync(this.target, rect.x, rect.glY, rect.width, rect.height, data);
    }
    return new IdPixels(rect.x, rect.y, rect.width, rect.height, data);
  }

  private clip(x: number, y: number, width: number, height: number) {
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(this.target.width, Math.floor(x) + Math.max(1, Math.ceil(width)));
    const bottom = Math.min(this.target.height, Math.floor(y) + Math.max(1, Math.ceil(height)));
    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom - top);
    return { x: left, y: top, width: w, height: h, glY: this.target.height - top - h };
  }

  dispose(): void {
    this.target.dispose();
  }
}
