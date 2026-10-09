import { DataTexture, NearestFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from "three";
import type { RegionTintUniforms } from "./materials";

const MAX_WIDTH = 2048;

/** One RGBA texel per triangle: the tint color in output sRGB and its opacity. */
export class RegionTint {
  readonly uniforms: RegionTintUniforms;
  private readonly data: Uint8Array;
  private readonly width: number;
  private empty = true;
  private readonly triangleCount: number;

  constructor(triangleCount: number) {
    this.triangleCount = triangleCount;
    this.width = Math.max(1, Math.min(MAX_WIDTH, triangleCount));
    const height = Math.max(1, Math.ceil(triangleCount / this.width));
    this.data = new Uint8Array(this.width * height * 4);
    const texture = new DataTexture(this.data, this.width, height, RGBAFormat, UnsignedByteType);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = NoColorSpace;
    texture.needsUpdate = true;
    this.uniforms = { regionTint: { value: texture }, regionTintWidth: { value: this.width } };
  }

  /** Clears every tint. Returns whether anything was tinted before. */
  clear(): boolean {
    const wasEmpty = this.empty;
    if (!wasEmpty) this.data.fill(0);
    this.empty = true;
    return !wasEmpty;
  }

  paint(triangles: Iterable<number>, rgba: readonly [number, number, number, number]): void {
    for (const triangle of triangles) {
      if (triangle < 0 || triangle >= this.triangleCount) continue;
      this.data.set(rgba, triangle * 4);
      this.empty = false;
    }
  }

  upload(): void {
    this.uniforms.regionTint.value.needsUpdate = true;
  }

  dispose(): void {
    this.uniforms.regionTint.value.dispose();
  }
}
