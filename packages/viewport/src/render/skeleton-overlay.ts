import type { SceneDescription } from "@arcue/scene";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  SRGBColorSpace,
} from "three";

export class SkeletonOverlay {
  readonly object = new Group();
  private readonly bones: number[];
  private readonly parents: number[];
  private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly dots: Points<BufferGeometry, PointsMaterial>;
  private readonly dotTexture: CanvasTexture;

  constructor(scene: SceneDescription, color: string) {
    const joints = new Set(scene.skeletons.flatMap((skeleton) => skeleton.joints));
    const isBone = (index: number) => scene.nodes[index]?.kind === "bone" || joints.has(index);
    this.bones = scene.nodes.map((_, index) => index).filter(isBone);
    this.parents = this.bones.map((bone) => {
      for (let parent = scene.nodes[bone]?.parent ?? -1; parent >= 0; parent = scene.nodes[parent]?.parent ?? -1) {
        if (isBone(parent)) return parent;
      }
      return -1;
    });
    const linkCount = this.parents.filter((parent) => parent >= 0).length;
    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute("position", new BufferAttribute(new Float32Array(linkCount * 6), 3));
    this.lines = new LineSegments(
      lineGeometry,
      new LineBasicMaterial({
        color: new Color(color),
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const dotGeometry = new BufferGeometry();
    dotGeometry.setAttribute("position", new BufferAttribute(new Float32Array(this.bones.length * 3), 3));
    this.dotTexture = dotTexture();
    this.dots = new Points(
      dotGeometry,
      new PointsMaterial({
        color: new Color(color),
        size: 6,
        sizeAttenuation: false,
        map: this.dotTexture,
        transparent: true,
        alphaTest: 0.3,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    for (const object of [this.lines, this.dots]) {
      object.frustumCulled = false;
      object.renderOrder = 20;
    }
    this.object.add(this.lines, this.dots);
    this.object.visible = false;
  }

  update(worlds: Float64Array): void {
    if (!this.object.visible) return;
    const lines = this.lines.geometry.getAttribute("position");
    const dots = this.dots.geometry.getAttribute("position");
    let link = 0;
    this.bones.forEach((bone, index) => {
      const x = worlds[bone * 16 + 12] ?? 0;
      const y = worlds[bone * 16 + 13] ?? 0;
      const z = worlds[bone * 16 + 14] ?? 0;
      dots.setXYZ(index, x, y, z);
      const parent = this.parents[index] ?? -1;
      if (parent < 0) return;
      lines.setXYZ(link * 2, x, y, z);
      lines.setXYZ(
        link * 2 + 1,
        worlds[parent * 16 + 12] ?? 0,
        worlds[parent * 16 + 13] ?? 0,
        worlds[parent * 16 + 14] ?? 0,
      );
      link++;
    });
    lines.needsUpdate = true;
    dots.needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.dots.geometry.dispose();
    this.dots.material.dispose();
    this.dotTexture.dispose();
  }
}

function dotTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#fff";
    context.beginPath();
    context.arc(16, 16, 12, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
