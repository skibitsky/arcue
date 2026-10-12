import type { Material as SceneMaterial, TextureAlpha, TextureRef, VertexColorUse, WrapMode } from "@arcue/scene";
import type { DataTexture, Material, Side, Texture, WebGLProgramParametersWithUniforms, Wrapping } from "three";
import {
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NoColorSpace,
  RepeatWrapping,
  ShaderChunk,
  SRGBColorSpace,
} from "three";
import type { Palette } from "./palette";
import type { DecodedImage } from "./textures";
import { textureFrom } from "./textures";

export interface RegionTintUniforms {
  regionTint: { value: DataTexture };
  regionTintWidth: { value: number };
}

/** The lines of three.js's shader chunks that multiply the base color and emissive maps into the material. */
const MAP_LINE = "diffuseColor *= sampledDiffuseColor;";
const EMISSIVE_MAP_LINE = "totalEmissiveRadiance *= emissiveColor.rgb;";
/**
 * The line of three.js's shader chunk that multiplies the vertex colors into the base color, and the line that does
 * so for the emission, which runs there too, before the emissive map.
 */
const COLOR_LINE = "diffuseColor *= vColor;";
const EMISSIVE_COLOR_LINE = "totalEmissiveRadiance *= vColor.rgb;";

const TINT_VERTEX_PARS = /* glsl */ `
attribute float triangle;
flat varying float vRegionTriangle;`;

const TINT_FRAGMENT_PARS = /* glsl */ `
uniform sampler2D regionTint;
uniform int regionTintWidth;
flat varying float vRegionTriangle;`;

const TINT_FRAGMENT = /* glsl */ `
{
  int regionTriangle = int(vRegionTriangle + 0.5);
  vec4 region = texelFetch(regionTint, ivec2(regionTriangle % regionTintWidth, regionTriangle / regionTintWidth), 0);
  if (region.a > 0.0) {
    float regionFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, region.rgb * (0.68 + 0.32 * regionFacing), region.a);
  }
}`;

/**
 * Adds a change to the material's shaders after the changes it already has. The cache key names every change, so
 * three.js compiles each combination once.
 */
function patchShaders(material: Material, key: string, patch: (shader: WebGLProgramParametersWithUniforms) => void) {
  const before = material.onBeforeCompile.bind(material);
  const keyBefore = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    patch(shader);
  };
  material.customProgramCacheKey = () => `${keyBefore}|${key}`;
}

/**
 * Tints painted triangles in the mesh shader itself, so a region deforms with the mesh. The tint is mixed in after
 * tone mapping and the output color space, so the feedback color on screen is the token's color.
 */
export function withRegionTint(material: MeshStandardMaterial, uniforms: RegionTintUniforms): MeshStandardMaterial {
  patchShaders(material, "arcue-region-tint", (shader) => {
    shader.uniforms.regionTint = uniforms.regionTint;
    shader.uniforms.regionTintWidth = uniforms.regionTintWidth;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${TINT_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRegionTriangle = triangle;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${TINT_FRAGMENT_PARS}`)
      .replace("#include <colorspace_fragment>", `#include <colorspace_fragment>${TINT_FRAGMENT}`);
  });
  return material;
}

/** Replaces a line of one of three.js's fragment shader chunks. */
function replaceLine(
  material: MeshStandardMaterial,
  chunk: "map_fragment" | "emissivemap_fragment" | "color_fragment",
  line: string,
  replacement: string,
): void {
  patchShaders(material, replacement, (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      `#include <${chunk}>`,
      ShaderChunk[chunk].replace(line, replacement),
    );
  });
}

/** The base color map's line where its alpha is not the opacity, so that a cutout does not cut by it either. */
function mapLine(alpha: Exclude<TextureAlpha, "opacity">): string {
  const color = alpha === "premultiply" ? "sampledDiffuseColor.rgb * sampledDiffuseColor.a" : "sampledDiffuseColor.rgb";
  return `diffuseColor.rgb *= ${color};`;
}

/** Whether a material's base color map gives its opacity, and so cuts out its texels in a cutout. */
export function mapGivesOpacity(material: SceneMaterial | undefined): boolean {
  return (material?.baseColorTexture?.alpha ?? "opacity") === "opacity";
}

export function sideOf(doubleSided: boolean): Side {
  return doubleSided ? DoubleSide : FrontSide;
}

const WRAPPING: Record<WrapMode, Wrapping> = {
  repeat: RepeatWrapping,
  clamp: ClampToEdgeWrapping,
  mirror: MirroredRepeatWrapping,
};

function mapTexture(
  ref: TextureRef | null,
  images: readonly (DecodedImage | null)[],
  uvSetCount: number,
  color: boolean,
  anisotropy: number,
): Texture | null {
  if (!ref) return null;
  const image = images[ref.texture];
  if (!image) return null;
  const texture = textureFrom(image);
  texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = WRAPPING[ref.wrapU];
  texture.wrapT = WRAPPING[ref.wrapV];
  texture.channel = ref.uvSet < uvSetCount && ref.uvSet < 4 ? ref.uvSet : 0;
  texture.anisotropy = anisotropy;
  if (ref.transform) {
    const { offset, scale, rotation } = ref.transform;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    texture.matrixAutoUpdate = false;
    texture.matrix.set(cos * scale[0], -sin * scale[1], offset[0], sin * scale[0], cos * scale[1], offset[1], 0, 0, 1);
  }
  return texture;
}

export interface LitMaterialInput {
  material: SceneMaterial | undefined;
  images: readonly (DecodedImage | null)[];
  uvSetCount: number;
  /** Whether the geometry carries the mesh's colors as its color attribute. */
  vertexColors: boolean;
  anisotropy: number;
  fallbackColor: string;
}

/** Multiplies the colors the material names by the geometry's vertex colors, and only those. */
function multiplyVertexColors(result: MeshStandardMaterial, uses: VertexColorUse): void {
  if (!uses.baseColor && !uses.emissive) return;
  result.vertexColors = true;
  if (!uses.emissive) return;
  replaceLine(result, "color_fragment", COLOR_LINE, `${uses.baseColor ? COLOR_LINE : ""} ${EMISSIVE_COLOR_LINE}`);
}

/**
 * The file's material as a metallic-roughness preview. Vertex colors multiply only the colors the material says they
 * do; elsewhere they are left out, as most engines' default shaders do.
 */
export function litMaterial({
  material,
  images,
  uvSetCount,
  vertexColors,
  anisotropy,
  fallbackColor,
}: LitMaterialInput) {
  if (!material) return new MeshStandardMaterial({ color: new Color(fallbackColor), roughness: 0.8, metalness: 0 });
  const result = new MeshStandardMaterial({ name: material.name });
  const [r, g, b, alpha] = material.baseColor;
  result.color.setRGB(r, g, b);
  result.metalness = material.metallic;
  result.roughness = material.roughness;
  result.emissive.setRGB(...material.emissive);
  result.side = sideOf(material.doubleSided);
  if (vertexColors && material.vertexColors) multiplyVertexColors(result, material.vertexColors);
  const texture = (ref: TextureRef | null, color: boolean) => mapTexture(ref, images, uvSetCount, color, anisotropy);
  result.map = texture(material.baseColorTexture, true);
  result.emissiveMap = texture(material.emissiveTexture, true);
  result.normalMap = texture(material.normalTexture, false);
  result.normalScale.set(material.normalScale, material.normalScale);
  result.aoMap = texture(material.occlusionTexture, false);
  const metallicRoughness = texture(material.metallicRoughnessTexture, false);
  const roughness = texture(material.roughnessTexture, false);
  const metalness = texture(material.metalnessTexture, false);
  result.roughnessMap = roughness ?? metallicRoughness;
  result.metalnessMap = metalness ?? metallicRoughness;
  if (roughness) result.roughness = 1;
  if (metalness) result.metalness = 1;
  const mapAlpha = material.baseColorTexture?.alpha ?? "opacity";
  if (result.map && mapAlpha !== "opacity") {
    replaceLine(result, "map_fragment", MAP_LINE, mapLine(mapAlpha));
  }
  if (result.emissiveMap && material.emissiveTexture?.alpha === "premultiply") {
    replaceLine(
      result,
      "emissivemap_fragment",
      EMISSIVE_MAP_LINE,
      "totalEmissiveRadiance *= emissiveColor.rgb * emissiveColor.a;",
    );
  }
  if (material.alphaMode === "blend") {
    result.transparent = true;
    result.opacity = alpha;
  } else if (material.alphaMode === "mask") {
    result.alphaTest = material.alphaCutoff > 0 ? material.alphaCutoff : 0.5;
    result.opacity = alpha;
  }
  return result;
}

export function clayMaterial(palette: Palette, side: Side): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(palette.textMuted), roughness: 0.82, metalness: 0, side });
}

export function wireFillMaterial(palette: Palette, side: Side): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(palette.surfaceRaised),
    roughness: 1,
    metalness: 0,
    side,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

export function wireLineMaterial(palette: Palette): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(palette.text),
    wireframe: true,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    toneMapped: false,
  });
}

const ID_VERTEX_PARS = /* glsl */ `
attribute float triangle;
flat varying float vIdTriangle;
varying float vIdDepth;`;

const ID_FRAGMENT_PARS = /* glsl */ `
uniform float meshId;
flat varying float vIdTriangle;
varying float vIdDepth;`;

/**
 * The ID pass material: each pixel stores the mesh number plus one, the triangle number and the distance along the
 * view direction. It is a basic material with its output replaced, so it runs the same skinning and morph chunks as
 * the display materials and matches the pose on screen exactly. Given a lit material with an alpha cutout, it takes
 * that material's opacity and cutoff, and its base color map where `cutsByMap` says the map's alpha is the opacity, so
 * clicks and strokes pass through the cut-out texels.
 */
export function idMaterial(
  meshIndex: number,
  side: Side,
  cutout: MeshStandardMaterial | null = null,
  cutsByMap = true,
): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ side });
  if (cutout && cutout.alphaTest > 0) {
    material.map = cutsByMap ? cutout.map : null;
    material.opacity = cutout.opacity;
    material.alphaTest = cutout.alphaTest;
  }
  const meshId = { value: meshIndex + 1 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.meshId = meshId;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${ID_VERTEX_PARS}`)
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvIdTriangle = triangle;\nvIdDepth = -mvPosition.z;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${ID_FRAGMENT_PARS}`)
      .replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\ngl_FragColor = vec4(meshId, vIdTriangle, vIdDepth, 1.0);",
      );
  };
  material.customProgramCacheKey = () => "arcue-id-pass";
  return material;
}
