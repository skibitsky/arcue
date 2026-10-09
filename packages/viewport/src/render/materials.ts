import type { Material as SceneMaterial, TextureRef, WrapMode } from "@arcue/scene";
import type { DataTexture, Side, Texture, Wrapping } from "three";
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
  SRGBColorSpace,
} from "three";
import type { Palette } from "./palette";
import type { DecodedImage } from "./textures";
import { textureFrom } from "./textures";

export interface RegionTintUniforms {
  regionTint: { value: DataTexture };
  regionTintWidth: { value: number };
}

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
 * Tints painted triangles in the mesh shader itself, so a region deforms with the mesh. The tint is mixed in after
 * tone mapping and the output color space, so the feedback color on screen is the token's color.
 */
export function withRegionTint(material: MeshStandardMaterial, uniforms: RegionTintUniforms): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.regionTint = uniforms.regionTint;
    shader.uniforms.regionTintWidth = uniforms.regionTintWidth;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${TINT_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRegionTriangle = triangle;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${TINT_FRAGMENT_PARS}`)
      .replace("#include <colorspace_fragment>", `#include <colorspace_fragment>${TINT_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => "arcue-region-tint";
  return material;
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
  anisotropy: number;
  fallbackColor: string;
}

/** The file's material as a metallic-roughness preview. Vertex colors are left out, as most engines' default shaders do. */
export function litMaterial({ material, images, uvSetCount, anisotropy, fallbackColor }: LitMaterialInput) {
  if (!material) return new MeshStandardMaterial({ color: new Color(fallbackColor), roughness: 0.8, metalness: 0 });
  const result = new MeshStandardMaterial({ name: material.name });
  const [r, g, b, alpha] = material.baseColor;
  result.color.setRGB(r, g, b);
  result.metalness = material.metallic;
  result.roughness = material.roughness;
  result.emissive.setRGB(...material.emissive);
  result.side = sideOf(material.doubleSided);
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
 * that material's base color map, opacity and cutoff, so clicks and strokes pass through the cut-out texels.
 */
export function idMaterial(
  meshIndex: number,
  side: Side,
  cutout: MeshStandardMaterial | null = null,
): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ side });
  if (cutout && cutout.alphaTest > 0) {
    material.map = cutout.map;
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
