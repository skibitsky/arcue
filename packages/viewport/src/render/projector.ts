import type { PerspectiveCamera } from "three";
import { Vector3 } from "three";

export interface Projection {
  /** CSS pixels from the view's top left. */
  x: number;
  y: number;
  /** Distance in front of the camera along its view direction; negative behind it. */
  depth: number;
}

export class Projector {
  private readonly camera: PerspectiveCamera;
  private readonly width: number;
  private readonly height: number;
  private readonly point = new Vector3();

  constructor(camera: PerspectiveCamera, width: number, height: number) {
    this.camera = camera;
    this.width = width;
    this.height = height;
  }

  project(x: number, y: number, z: number): Projection {
    const view = this.point.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
    const depth = -view.z;
    view.applyMatrix4(this.camera.projectionMatrix);
    return { x: ((view.x + 1) / 2) * this.width, y: ((1 - view.y) / 2) * this.height, depth };
  }

  onScreen(projection: Projection, margin = 0): boolean {
    return (
      projection.depth > this.camera.near &&
      projection.x >= -margin &&
      projection.y >= -margin &&
      projection.x <= this.width + margin &&
      projection.y <= this.height + margin
    );
  }

  ray(x: number, y: number): { origin: Vector3; direction: Vector3 } {
    const origin = new Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    const ndc = new Vector3((x / this.width) * 2 - 1, 1 - (y / this.height) * 2, 0.5);
    const direction = ndc.unproject(this.camera).sub(origin).normalize();
    return { origin, direction };
  }
}
