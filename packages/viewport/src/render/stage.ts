import type { Bounds } from "@arcue/scene";
import {
  AgXToneMapping,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Palette } from "./palette";

/** The gap between the floor's layers, which stack just under the model's lowest point, as a fraction of its size. */
const FLOOR_GAP = 0.0005;
/**
 * Draws the floor as if farther away, so a model face lying on it covers it where the gap is below the depth buffer's
 * precision, and behind the wireframe fill, which has an offset of its own.
 */
const BEHIND_COPLANAR = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 } as const;

/** Light colors are physical white light, not UI colors; the studio stays neutral so materials read true. */
const LIGHT = { key: 3.4, rim: 1.2, hemisphere: 0.1, environment: 0.07, exposure: 1.05 };

export interface StageExtent {
  center: Vector3;
  /** The largest side of the model's rest bounds, at least 1 cm. */
  size: number;
  /** The larger horizontal side of the rest bounds, at least 1 cm. */
  footprint: number;
  floor: number;
}

export function extentOf(bounds: Bounds): StageExtent {
  const min = new Vector3(...bounds.min);
  const max = new Vector3(...bounds.max);
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 0.01);
  const footprint = Math.max(max.x - min.x, max.z - min.z, 0.01);
  return { center: min.clone().add(max).multiplyScalar(0.5), size, footprint, floor: min.y };
}

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = LIGHT.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

export class Stage {
  readonly scene = new Scene();
  private readonly key = new DirectionalLight(0xffffff, LIGHT.key);
  private readonly rim = new DirectionalLight(0xffffff, LIGHT.rim);
  private readonly ground: Mesh<PlaneGeometry, ShadowMaterial>;
  private readonly contact: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly grid: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly gridUniforms: GridUniforms = {
    color: { value: new Color() },
    opacity: { value: 0.22 },
    fade: { value: 6 },
    center: { value: new Vector3() },
  };
  private environment: WebGLRenderTarget;

  constructor(renderer: WebGLRenderer, palette: Palette) {
    this.environment = studioEnvironment(renderer);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = LIGHT.environment;

    const hemisphere = new HemisphereLight(0xffffff, 0x404040, LIGHT.hemisphere);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 6;
    this.key.shadow.bias = -0.0004;
    this.scene.add(hemisphere, this.key, this.key.target, this.rim, this.rim.target);

    this.ground = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.34, ...BEHIND_COPLANAR }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;

    this.contact = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: contactTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        ...BEHIND_COPLANAR,
      }),
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.renderOrder = -1;

    this.grid = new Mesh(new PlaneGeometry(1, 1), gridMaterial(this.gridUniforms));
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.renderOrder = -2;
    this.scene.add(this.ground, this.contact, this.grid);
    this.setPalette(palette);
    this.fit(extentOf({ min: [-0.5, 0, -0.5], max: [0.5, 1.8, 0.5] }));
  }

  setPalette(palette: Palette): void {
    this.ground.material.color.set(palette.surfaceDesk);
    this.contact.material.color.set(palette.surfaceDesk);
    this.gridUniforms.color.value.set(palette.textFaint);
  }

  fit(extent: StageExtent): void {
    const { center, size, footprint, floor } = extent;
    const reach = size * 3;
    this.key.position.set(center.x + reach * 0.62, floor + reach * 0.9, center.z + reach * 0.42);
    this.key.target.position.copy(center);
    this.rim.position.set(center.x - reach * 0.7, floor + reach * 0.6, center.z - reach * 0.8);
    this.rim.target.position.copy(center);
    const shadow = this.key.shadow.camera;
    const half = size * 1.1;
    shadow.left = -half;
    shadow.right = half;
    shadow.top = half;
    shadow.bottom = -half;
    shadow.near = reach * 0.2;
    shadow.far = reach * 2.5;
    shadow.updateProjectionMatrix();
    this.key.shadow.normalBias = size * 0.004;
    this.key.shadow.needsUpdate = true;

    const floorSize = Math.max(size * 16, 12);
    this.ground.scale.set(floorSize, floorSize, 1);
    this.ground.position.set(center.x, floor - size * FLOOR_GAP * 3, center.z);
    this.grid.scale.set(floorSize, floorSize, 1);
    this.grid.position.set(center.x, floor - size * FLOOR_GAP * 2, center.z);
    this.gridUniforms.fade.value = Math.max(size * 3, 4);
    this.gridUniforms.center.value.set(center.x, floor, center.z);
    const contact = Math.max(footprint * 2, size * 0.3);
    this.contact.scale.set(contact, contact, 1);
    this.contact.position.set(center.x, floor - size * FLOOR_GAP, center.z);
  }

  /** Renders the environment map again, as after a lost graphics context, which takes everything rendered on the GPU. */
  rebuildEnvironment(renderer: WebGLRenderer): void {
    this.environment.dispose();
    this.environment = studioEnvironment(renderer);
    this.scene.environment = this.environment.texture;
  }

  dispose(): void {
    this.environment.dispose();
    for (const mesh of [this.ground, this.contact, this.grid]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.contact.material.map?.dispose();
    this.key.shadow.map?.dispose();
  }
}

function studioEnvironment(renderer: WebGLRenderer): WebGLRenderTarget {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return target;
}

function contactTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.45)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

type GridUniforms = {
  color: { value: Color };
  opacity: { value: number };
  fade: { value: number };
  center: { value: Vector3 };
};

function gridMaterial(uniforms: GridUniforms): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    ...BEHIND_COPLANAR,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      uniform float fade;
      uniform vec3 center;
      varying vec3 vWorld;
      void main() {
        vec2 cell = vWorld.xz;
        vec2 distanceToLine = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
        float line = 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
        float falloff = 1.0 - smoothstep(fade * 0.25, fade, length(vWorld.xz - center.xz));
        float alpha = line * falloff * opacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
  });
}
