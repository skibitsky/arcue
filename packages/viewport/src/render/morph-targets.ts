import type { MorphTarget } from "@arcue/scene";
import type { Material } from "three";
import { DataArrayTexture, FloatType } from "three";
import { patchShaders } from "./materials";

/** Texels per row of the offsets texture: the largest texture size that every WebGL 2 implementation supports. */
const TEXTURE_WIDTH = 2048;

const VERTEX_PARS = /* glsl */ `
attribute float morphVertex;
uniform highp sampler2DArray morphOffsets;
uniform vec4 morphWeights[ MORPH_WEIGHT_VECTORS ];

vec3 morphOffset( const in int target, const in int texelOfVertex ) {
  int texel = int( morphVertex ) * MORPH_TEXELS_PER_VERTEX + texelOfVertex;
  int width = textureSize( morphOffsets, 0 ).x;
  int y = texel / width;
  int x = texel - y * width;
  return texelFetch( morphOffsets, ivec3( x, y, target ), 0 ).xyz;
}

vec3 morphSum( const in int texelOfVertex ) {
  vec3 sum = vec3( 0.0 );
  for ( int i = 0; i < MORPH_WEIGHT_VECTORS; i ++ ) {
    vec4 weights = morphWeights[ i ];
    if ( weights.x != 0.0 ) sum += morphOffset( 4 * i, texelOfVertex ) * weights.x;
    if ( weights.y != 0.0 ) sum += morphOffset( 4 * i + 1, texelOfVertex ) * weights.y;
    if ( weights.z != 0.0 ) sum += morphOffset( 4 * i + 2, texelOfVertex ) * weights.z;
    if ( weights.w != 0.0 ) sum += morphOffset( 4 * i + 3, texelOfVertex ) * weights.w;
  }
  return sum;
}`;

/**
 * A mesh's morph targets on the GPU, stored once per rendered vertex. three.js stores them once per drawn vertex,
 * which for geometry with no shared corners is about six times as much. Every material that draws the mesh fetches the
 * offsets through the geometry's `morphVertex` attribute, the rendered vertex of each corner, after `patch`.
 *
 * The packed offsets exist only while three.js uploads them: the texture packs them when three.js reads its data, and
 * drops them once uploaded. A restored WebGL context reads the data again, so it packs them again.
 */
export class MorphTargets {
  readonly texture: DataArrayTexture;
  /** Whether the targets carry normal offsets as well as position offsets. */
  readonly normals: boolean;
  /** The weight of each target as the shaders read it, padded with zeros to whole vectors of four. */
  readonly weights: Float32Array;
  private readonly uniforms: { morphOffsets: { value: DataArrayTexture }; morphWeights: { value: Float32Array } };
  private readonly key: string;

  constructor(targets: readonly MorphTarget[], vertexCount: number) {
    this.normals = targets.length > 0 && targets.every((target) => target.normals !== null);
    const texelsPerVertex = this.normals ? 2 : 1;
    const texels = Math.max(1, vertexCount * texelsPerVertex);
    const width = Math.min(texels, TEXTURE_WIDTH);
    const height = Math.ceil(texels / width);
    const depth = Math.max(1, targets.length);
    const pack = () => packOffsets(targets, vertexCount, this.normals, width * height);
    let packed: Float32Array | null = null;
    this.texture = new DataArrayTexture(null, width, height, depth);
    this.texture.image = {
      width,
      height,
      depth,
      get data() {
        packed ??= pack();
        return packed;
      },
    };
    this.texture.type = FloatType;
    this.texture.onUpdate = () => {
      packed = null;
    };
    this.texture.needsUpdate = true;
    const vectors = Math.max(1, Math.ceil(targets.length / 4));
    this.weights = new Float32Array(vectors * 4);
    this.uniforms = { morphOffsets: { value: this.texture }, morphWeights: { value: this.weights } };
    this.key = `arcue-morphs|${vectors}|${texelsPerVertex}`;
  }

  /** Sets the weight of each target, in the order of the mesh's morph targets. A weight that is not finite counts as 0. */
  setWeights(weights: ArrayLike<number>): void {
    for (let target = 0; target < this.weights.length; target++) {
      const weight = weights[target] ?? 0;
      this.weights[target] = Number.isFinite(weight) ? weight : 0;
    }
  }

  /** Makes the material add the weighted offsets to each vertex's position, and to its normal where they have one. */
  patch(material: Material): void {
    const vectors = this.weights.length / 4;
    const texelsPerVertex = this.normals ? 2 : 1;
    patchShaders(material, this.key, (shader) => {
      shader.uniforms.morphOffsets = this.uniforms.morphOffsets;
      shader.uniforms.morphWeights = this.uniforms.morphWeights;
      const pars = `#define MORPH_WEIGHT_VECTORS ${vectors}\n#define MORPH_TEXELS_PER_VERTEX ${texelsPerVertex}\n${VERTEX_PARS}`;
      shader.vertexShader = shader.vertexShader
        .replace("#include <morphtarget_pars_vertex>", pars)
        .replace("#include <morphtarget_vertex>", "transformed += morphSum( 0 );")
        .replace("#include <morphnormal_vertex>", this.normals ? "objectNormal += morphSum( 1 );" : "");
    });
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** The offsets as the texture lays them out: one layer per target, and one or two texels per vertex in each layer. */
export function packOffsets(
  targets: readonly MorphTarget[],
  vertexCount: number,
  normals: boolean,
  texelsPerLayer: number,
): Float32Array {
  const texelsPerVertex = normals ? 2 : 1;
  const data = new Float32Array(texelsPerLayer * 4 * Math.max(1, targets.length));
  targets.forEach((target, layer) => {
    const layerStart = layer * texelsPerLayer * 4;
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const texel = layerStart + vertex * texelsPerVertex * 4;
      for (let k = 0; k < 3; k++) data[texel + k] = target.positions[vertex * 3 + k] ?? 0;
      if (normals) for (let k = 0; k < 3; k++) data[texel + 4 + k] = target.normals?.[vertex * 3 + k] ?? 0;
    }
  });
  return data;
}

/** The rendered vertex of each corner, as the `morphVertex` attribute that the patched shaders fetch offsets by. */
export function morphVertexAttribute(indices: Uint32Array, corners: number): Float32Array {
  const vertices = new Float32Array(corners);
  for (let corner = 0; corner < corners; corner++) vertices[corner] = indices[corner] ?? 0;
  return vertices;
}
