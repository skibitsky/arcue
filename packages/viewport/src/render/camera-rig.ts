import type { CameraAnchor, Vec3 } from "@arcue/scene";
import { MathUtils, MOUSE, PerspectiveCamera, Spherical, TOUCH, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const TWEEN_MS = 520;
const INITIAL_DIRECTION = new Vector3(-0.42, 0.3, 0.86).normalize();

interface Tween {
  fromTarget: Vector3;
  toTarget: Vector3;
  from: Spherical;
  to: Spherical;
  turn: number;
  fromFov: number;
  toFov: number;
  start: number;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

/**
 * The camera and its orbit controls. Orbit with the left button (the View tool), the right button, or Alt with the
 * left button; pan with the middle button or Shift with the right; zoom with the wheel or a pinch.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(30, 1, 0.01, 100);
  readonly controls: OrbitControls;
  private tween: Tween | null = null;
  private modelSize = 1;
  private readonly onChange: () => void;
  private changes = 0;

  constructor(element: HTMLElement, onChange: () => void) {
    this.onChange = onChange;
    this.controls = new OrbitControls(this.camera, element);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.16;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    this.controls.addEventListener("change", () => {
      this.changes++;
      onChange();
    });
    this.controls.addEventListener("start", () => {
      this.tween = null;
    });
    this.camera.position.set(-1.6, 1.8, 3.6);
    this.controls.target.set(0, 0.9, 0);
    this.controls.update();
  }

  /** Whether the left button orbits for the gesture that starts now: always with the View tool, with Alt otherwise. */
  setLeftButtonOrbits(orbits: boolean): void {
    this.controls.mouseButtons.LEFT = orbits ? MOUSE.ROTATE : null;
    this.controls.touches.ONE = orbits ? TOUCH.ROTATE : null;
  }

  /** Grows whenever the camera's position, orientation or projection may have changed. */
  get revision(): number {
    return this.changes;
  }

  setAspect(aspect: number): void {
    this.changes++;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setModelSize(size: number): void {
    this.modelSize = Math.max(size, 0.01);
    this.controls.minDistance = this.modelSize * 0.02;
    this.controls.maxDistance = this.modelSize * 40;
    this.updateClipping();
  }

  getAnchor(): CameraAnchor {
    const p = this.camera.position;
    const t = this.controls.target;
    const u = this.camera.up;
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], up: [u.x, u.y, u.z], fov: this.camera.fov };
  }

  setAnchor(anchor: CameraAnchor, animate: boolean): void {
    const up = new Vector3(...anchor.up);
    if (up.lengthSq() > 0) this.camera.up.copy(up.normalize());
    this.changes++;
    if (!animate) {
      this.tween = null;
      this.apply(new Vector3(...anchor.position), new Vector3(...anchor.target), anchor.fov);
      return;
    }
    const fromTarget = this.controls.target.clone();
    const toTarget = new Vector3(...anchor.target);
    const from = new Spherical().setFromVector3(this.camera.position.clone().sub(fromTarget));
    const to = new Spherical().setFromVector3(new Vector3(...anchor.position).sub(toTarget));
    const turn = MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, Math.PI * 2) - Math.PI;
    this.tween = {
      fromTarget,
      toTarget,
      from,
      to,
      turn,
      fromFov: this.camera.fov,
      toFov: anchor.fov,
      start: performance.now(),
    };
    this.onChange();
  }

  frameSphere(center: Vec3, radius: number, animate: boolean): void {
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() === 0) direction.copy(INITIAL_DIRECTION);
    direction.normalize();
    this.setAnchor(this.fitAnchor(center, radius, direction), animate);
  }

  frameInitial(center: Vec3, radius: number): void {
    this.setAnchor(this.fitAnchor(center, radius, INITIAL_DIRECTION), false);
  }

  private fitAnchor(center: Vec3, radius: number, direction: Vector3): CameraAnchor {
    const vertical = MathUtils.degToRad(this.camera.fov) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = (Math.max(radius, 1e-4) / Math.sin(Math.min(vertical, horizontal))) * 1.04;
    const position = new Vector3(...center).addScaledVector(direction, distance);
    const u = this.camera.up;
    return {
      position: [position.x, position.y, position.z],
      target: center,
      up: [u.x, u.y, u.z],
      fov: this.camera.fov,
    };
  }

  /** Advances the camera animation and the controls' damping. Returns whether the camera is still moving. */
  step(now: number): boolean {
    let moving = false;
    if (this.tween) {
      const tween = this.tween;
      const k = Math.min(1, (now - tween.start) / TWEEN_MS);
      const e = ease(k);
      const target = tween.fromTarget.clone().lerp(tween.toTarget, e);
      const spherical = new Spherical(
        MathUtils.lerp(tween.from.radius, tween.to.radius, e),
        MathUtils.lerp(tween.from.phi, tween.to.phi, e),
        tween.from.theta + tween.turn * e,
      );
      this.apply(
        new Vector3().setFromSpherical(spherical).add(target),
        target,
        MathUtils.lerp(tween.fromFov, tween.toFov, e),
      );
      if (k >= 1) this.tween = null;
      else moving = true;
    }
    if (this.controls.update()) moving = true;
    this.updateClipping();
    return moving;
  }

  get animating(): boolean {
    return this.tween !== null;
  }

  private apply(position: Vector3, target: Vector3, fov: number): void {
    this.changes++;
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    if (Number.isFinite(fov) && fov > 0 && fov < 180 && fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(target);
    this.controls.update();
    this.updateClipping();
  }

  private updateClipping(): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const near = Math.max(distance * 0.01, this.modelSize * 1e-4, 1e-4);
    const far = (distance + this.modelSize * 4) * 6;
    if (Math.abs(near - this.camera.near) > near * 0.05 || Math.abs(far - this.camera.far) > far * 0.05) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
      this.changes++;
    }
  }

  dispose(): void {
    this.controls.dispose();
  }
}
