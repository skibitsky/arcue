import type { RegionAnchor } from "@arcue/scene";
import { Vector3 } from "three";
import { forEachNeighbor, regionAnchor } from "../math/regions";
import { triangleCorners } from "../render/anchor-points";
import type { IdPixels, IdSample } from "../render/id-pass";
import type { MeshRuntime, Model } from "../render/model";
import type { Projector } from "../render/projector";

export type StrokeMode = "paint" | "add" | "erase";

/** The selected region a Shift stroke adds to and a Ctrl or Cmd stroke erases from. */
export interface StrokeBase {
  overlayId: string;
  runtime: MeshRuntime;
  triangles: Iterable<number>;
}

export interface StrokeContext {
  model: Model;
  projector: Projector;
  cameraPosition: Vector3;
  radius: number;
  modelSize: number;
  /** Reads the ID pass over a rectangle in CSS pixels, rendering it first if the view changed. */
  read(x: number, y: number, width: number, height: number): IdPixels;
}

/**
 * One brush stroke. Each sample paints the triangles around the point under the cursor that the camera sees, that face
 * it as that point's triangle does, whose centers fall inside the brush, and that connect to that point across painted
 * triangles. The ID pass finds the seed and hides what is behind other surface; the CPU walks the mesh from the seed,
 * so triangles smaller than a pixel are painted too.
 */
export class PaintStroke {
  readonly erase: boolean;
  readonly overlayId: string | null;
  private runtime: MeshRuntime | null;
  private readonly triangles: Set<number>;
  private readonly pending: [number, number][] = [];
  private last: [number, number] | null = null;
  private stamps: Uint32Array | null = null;
  private stamp = 0;
  private changedAny = false;

  constructor(mode: StrokeMode, base: StrokeBase | null) {
    const editsBase = mode !== "paint" && base !== null;
    this.erase = mode === "erase" && editsBase;
    this.overlayId = editsBase ? base.overlayId : null;
    this.runtime = editsBase ? base.runtime : null;
    this.triangles = new Set(editsBase ? base.triangles : []);
  }

  get mesh(): MeshRuntime | null {
    return this.runtime;
  }

  get painted(): ReadonlySet<number> {
    return this.triangles;
  }

  get changed(): boolean {
    return this.changedAny;
  }

  addPoint(x: number, y: number, radius: number): void {
    const spacing = Math.max(1.5, radius * 0.35);
    if (!this.last) {
      this.pending.push([x, y]);
    } else {
      const [lx, ly] = this.last;
      const steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / spacing));
      for (let step = 1; step <= steps; step++) {
        this.pending.push([lx + ((x - lx) * step) / steps, ly + ((y - ly) * step) / steps]);
      }
    }
    this.last = [x, y];
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** Paints the queued positions. Returns whether any triangle changed. */
  process(context: StrokeContext): boolean {
    let changed = false;
    for (const [x, y] of this.pending.splice(0)) changed = this.paintAt(context, x, y) || changed;
    if (changed) this.changedAny = true;
    return changed;
  }

  result(): { overlayId: string | null; anchor: RegionAnchor | null } | null {
    if (!this.runtime) return null;
    if (this.overlayId === null && this.triangles.size === 0) return null;
    return { overlayId: this.overlayId, anchor: regionAnchor(this.runtime.path, this.runtime.data, this.triangles) };
  }

  private paintAt(context: StrokeContext, x: number, y: number): boolean {
    const { radius } = context;
    const pixels = context.read(x - radius - 1, y - radius - 1, radius * 2 + 3, radius * 2 + 3);
    const seed = this.findSeed(pixels, x, y, radius, context.model);
    if (!seed) return false;
    const runtime = this.runtime ?? context.model.meshes.find((candidate) => candidate.index === seed.mesh) ?? null;
    if (!runtime) return false;
    this.runtime = runtime;
    if (!this.stamps || this.stamps.length !== runtime.triangleCount)
      this.stamps = new Uint32Array(runtime.triangleCount);
    const stamps = this.stamps;
    this.stamp++;
    if (this.stamp >= 0xffffffff) {
      stamps.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;

    const facingSign = Math.sign(this.facing(runtime, seed.triangle, context.cameraPosition)) || 1;
    const radiusSquared = radius * radius;
    const tolerance = (depth: number) => Math.max(depth * 0.004, context.modelSize * 0.002);
    const center = new Vector3();
    const stack = [seed.triangle];
    let changed = false;
    while (stack.length > 0) {
      const triangle = stack.pop() ?? 0;
      if (stamps[triangle] === stamp) continue;
      stamps[triangle] = stamp;
      if (triangle !== seed.triangle) {
        const [p0, p1, p2] = triangleCorners(runtime, triangle);
        center.set((p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3);
        const projected = context.projector.project(center.x, center.y, center.z);
        if ((projected.x - x) ** 2 + (projected.y - y) ** 2 > radiusSquared) continue;
        if (this.facing(runtime, triangle, context.cameraPosition) * facingSign <= 0) continue;
        const seen = pixels.at(projected.x, projected.y);
        const hidden =
          seen.mesh >= 0 &&
          !(seen.mesh === runtime.index && seen.triangle === triangle) &&
          seen.depth < projected.depth - tolerance(projected.depth);
        if (hidden) continue;
      }
      if (this.erase) {
        if (this.triangles.delete(triangle)) changed = true;
      } else if (!this.triangles.has(triangle)) {
        this.triangles.add(triangle);
        changed = true;
      }
      forEachNeighbor(runtime.data, runtime.adjacency(), triangle, (neighbor) => {
        if (stamps[neighbor] !== stamp) stack.push(neighbor);
      });
    }
    return changed;
  }

  /** The visible triangle of the stroke's mesh under the brush center, or the nearest one within half the radius. */
  private findSeed(pixels: IdPixels, x: number, y: number, radius: number, model: Model): IdSample | null {
    const wanted = this.runtime?.index;
    const accepts = (sample: IdSample) => sample.mesh >= 0 && (wanted === undefined || sample.mesh === wanted);
    const center = pixels.at(x, y);
    if (accepts(center)) return center;
    const reach = Math.max(1, Math.floor(radius / 2));
    let best: IdSample | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const distance = dx * dx + dy * dy;
        if (distance > reach * reach || distance >= bestDistance) continue;
        const sample = pixels.at(x + dx, y + dy);
        if (!accepts(sample)) continue;
        best = sample;
        bestDistance = distance;
      }
    }
    return best && model.meshes.some((runtime) => runtime.index === best.mesh) ? best : null;
  }

  private facing(runtime: MeshRuntime, triangle: number, camera: Vector3): number {
    const [p0, p1, p2] = triangleCorners(runtime, triangle);
    const e1x = p1[0] - p0[0];
    const e1y = p1[1] - p0[1];
    const e1z = p1[2] - p0[2];
    const e2x = p2[0] - p0[0];
    const e2y = p2[1] - p0[1];
    const e2z = p2[2] - p0[2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    return nx * (camera.x - p0[0]) + ny * (camera.y - p0[1]) + nz * (camera.z - p0[2]);
  }
}
