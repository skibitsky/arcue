export type Vec3 = [x: number, y: number, z: number];

export type Vec4 = [x: number, y: number, z: number, w: number];

export type Quat = [x: number, y: number, z: number, w: number];

/**
 * A .blend file's scene, ready to render. Positions, transforms and tracks are in glTF's space: meters, right-handed,
 * +Y up and +Z front, turned from Blender's +Z up by −90° about X and scaled by `unitScale`, as Blender's glTF exporter
 * does. Matrices are column-major 4×4 and quaternions are xyzw. Large arrays are typed arrays that never view the
 * file's bytes, so the scene can be posted between workers and its buffers transferred. Arrays may share a buffer, as
 * the meshes of linked duplicates do, so list each buffer once when transferring them.
 */
export interface BlendScene {
  /** The version of Blender that saved the file, such as "4.2". */
  blenderVersion: string;
  fps: number;
  /** Meters per Blender unit: the scene's unit scale. */
  unitScale: number;
  nodes: BlendNode[];
  meshes: BlendMesh[];
  skeletons: Skeleton[];
  materials: BlendMaterial[];
  images: BlendImage[];
  clips: BlendClip[];
  warnings: BlendWarning[];
}

export interface ReadBlendOptions {
  /**
   * Reads an image file that the .blend file names but does not pack, for the materials whose colors depend on whether
   * the image is gray. It is called once for each such image with the path the file stores for it, relative to the
   * .blend file's folder or absolute, or with the image's name where it stores none. Resolves to null when there is no
   * such file. Without it, those images are not known to be gray.
   */
  readImage?(path: string): Promise<Uint8Array | null>;
}

export type NodeKind = "mesh" | "bone" | "empty";

export interface BlendNode {
  /** The object's or bone's name. */
  name: string;
  /** Index of the parent node, or -1 for a root. A parent always comes before its children. */
  parent: number;
  kind: NodeKind;
  /** The rest transform relative to the parent. It is the bind pose of the meshes the node skins. */
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
  /** Index into `BlendScene.meshes` for mesh nodes, otherwise null. */
  mesh: number | null;
  /**
   * Whether Blender's viewport hides the object or draws no surface for it: hidden with the eye in the view layer, an
   * instancer that shows only its instances, or an object displayed as bounds or wire. False for bones.
   */
  hidden: boolean;
}

export interface UvSet {
  /** The UV map's name. */
  name: string;
  /** Two values per rendered vertex, with the origin at the bottom left and v pointing up. */
  values: Float32Array;
}

export interface MaterialGroup {
  /** First triangle of the group. */
  start: number;
  triangleCount: number;
  /** Index into `BlendScene.materials`. */
  material: number;
}

export interface MorphTarget {
  /** The shape key's name. */
  name: string;
  /** The shape key's value in the rest pose and in clips that do not animate it. */
  defaultWeight: number;
  /** The range of the shape key's slider, which Blender clamps its value to. */
  range: [min: number, max: number];
  /** Position offsets, three values per rendered vertex. */
  positions: Float32Array;
  /** Normal offsets, three values per rendered vertex. */
  normals: Float32Array | null;
}

/**
 * Every skin influence of every file vertex, in compressed sparse row layout: `offsets` has sourceVertexCount + 1
 * entries, and the influences of file vertex v sit at offsets[v] up to, not including, offsets[v + 1].
 */
export interface SkinWeights {
  offsets: Uint32Array;
  /** Index into the skeleton's `joints`. */
  joints: Uint16Array;
  weights: Float32Array;
}

export interface Skin {
  /** Index into `BlendScene.skeletons`. */
  skeleton: number;
  /**
   * The matrix that took the mesh's local positions into scene space when it was bound to the skeleton. A skinned
   * position is the sum over influences of weight × jointWorld × inverseBindMatrix × bindMatrix × localPosition.
   */
  bindMatrix: Float32Array;
  /** The four strongest joints of each rendered vertex. */
  joints: Uint16Array;
  /** Weights of `joints`, scaled to sum to 1. */
  weights: Float32Array;
  /** Every influence of every file vertex. */
  sourceWeights: SkinWeights;
}

/**
 * The rest pose is the bind pose: the nodes' rest transforms place every joint where it was when the meshes were bound.
 */
export interface Skeleton {
  /** Node index of each joint. Joint indices in skins point into this list. */
  joints: number[];
  /** One matrix per joint, mapping scene space at bind time into the joint's space. */
  inverseBindMatrices: Float32Array;
}

/**
 * A triangle mesh in the local space of the one node that uses it. Rendered vertices are the file's vertices split
 * where normals, UVs or colors differ, and each one records the file vertex it came from. The file's own vertex
 * numbers are kept as they are: no vertex is welded, reordered or dropped.
 */
export interface BlendMesh {
  /** The object's name. */
  name: string;
  /** The mesh datablock's name. */
  dataName: string;
  positions: Float32Array;
  normals: Float32Array;
  /** At most eight UV sets. */
  uvs: UvSet[];
  /** Linear RGBA, four values per rendered vertex, from the color attribute the materials read. */
  colors: Float32Array | null;
  /** Three rendered vertex indices per triangle. */
  indices: Uint32Array;
  /** Runs of triangles that draw in one material. */
  groups: MaterialGroup[];
  morphTargets: MorphTarget[];
  skin: Skin | null;
  /** The file's vertex number of each rendered vertex. */
  sourceVertex: Uint32Array;
  sourceVertexCount: number;
  /** The rest position of each file vertex in scene space, three values each. */
  restPositions: Float32Array;
  /** The file's faces as runs of file vertex numbers: face f has vertices[offsets[f]] up to vertices[offsets[f + 1]]. */
  faces: { offsets: Uint32Array; vertices: Uint32Array };
  /** The face each triangle comes from. The triangles of a face are consecutive. */
  triangleFaces: Uint32Array;
}

/**
 * How a material's alpha shows: not at all, cut out at `alphaCutoff`, as stochastic transparency (Blender's Dithered
 * or Hashed render method), or blended over what is behind.
 */
export type AlphaMode = "opaque" | "mask" | "hash" | "blend";

export type WrapMode = "repeat" | "clamp" | "mirror";

/** Applied to UVs before sampling: scale, then rotate counterclockwise around the origin, then offset. */
export interface UvTransform {
  offset: [u: number, v: number];
  scale: [u: number, v: number];
  /** Radians. */
  rotation: number;
}

/**
 * What a material does with a texture's alpha: multiply its opacity, multiply the texture's color as Blender does
 * where nothing reads an image's alpha, or nothing.
 */
export type TextureAlpha = "opacity" | "premultiply" | "none";

/** How a texture's values decode: from sRGB, or as they are stored. */
export type TextureColorSpace = "srgb" | "linear";

export interface TextureRef {
  /** Index into `BlendScene.images`. */
  image: number;
  /** Index into the mesh's `uvs`. */
  uvSet: number;
  wrapU: WrapMode;
  wrapV: WrapMode;
  /** Null when the UVs are used as they are. */
  transform: UvTransform | null;
  alpha: TextureAlpha;
  colorSpace: TextureColorSpace;
}

/**
 * What a mesh's color attribute does to a material's color: multiplies it, makes it black because the material reads
 * an attribute the mesh lacks, as Blender shows it, or nothing.
 */
export type VertexColorUse = "multiply" | "black" | "none";

/**
 * A metallic-roughness approximation of a Blender material. A material that meshes with different UV maps or color
 * attributes use appears once for each, under the same name, since its texture references point into a mesh's UV sets.
 */
export interface BlendMaterial {
  name: string;
  /** Linear RGBA. */
  baseColor: Vec4;
  baseColorTexture: TextureRef | null;
  metallic: number;
  roughness: number;
  /** Roughness in the green channel, metalness in the blue channel, as glTF packs them. */
  metallicRoughnessTexture: TextureRef | null;
  /** A grayscale roughness map. Where present it replaces `roughness`. */
  roughnessTexture: TextureRef | null;
  /** A grayscale metalness map. Where present it replaces `metallic`. */
  metalnessTexture: TextureRef | null;
  normalTexture: TextureRef | null;
  normalScale: number;
  /** Linear RGB: the emission color times its strength. */
  emissive: Vec3;
  emissiveTexture: TextureRef | null;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  vertexColors: { baseColor: VertexColorUse; emissive: VertexColorUse };
}

/** An image the materials sample. */
export interface BlendImage {
  /** The Image datablock's name. */
  name: string;
  /**
   * Where its pixels are: in a file of their own, packed into the .blend file, or nowhere a file holds them, as for a
   * generated image, a movie, or an image of another .blend file that this one links.
   */
  source: "file" | "packed" | "none";
  /**
   * The path the file stores for the image file the scene shows, a UDIM image's first tile or an image sequence's frame
   * at the scene's start frame, or the image's name where it stores none. Empty for an image no file holds.
   */
  path: string;
  /** Whether `path` is relative to the .blend file's folder, as Blender's "//" prefix marks it. */
  relative: boolean;
  /** The bytes packed into the .blend file, or null. */
  packed: Uint8Array | null;
}

export type TrackProperty = "translation" | "rotation" | "scale" | "weights";

export type Interpolation = "linear" | "step";

export interface Track {
  /** Index into `BlendScene.nodes`. */
  node: number;
  property: TrackProperty;
  interpolation: Interpolation;
  /** Seconds from the start of the clip. */
  times: Float32Array;
  /**
   * Per key: three values for translation and scale, an xyzw quaternion for rotation, and for weights one value per
   * morph target.
   */
  values: Float32Array;
  /** True for a track that only holds the pose the file saves on a node the clip does not key. */
  held?: boolean;
}

/** An action sampled over the scene's nodes. */
export interface BlendClip {
  /** The action's name. */
  name: string;
  /** Seconds. */
  duration: number;
  tracks: Track[];
  /** Key times of each value the clip animates, in seconds from the clip's start. */
  curveKeyTimes: Float32Array[];
  /** The file's frame at the clip's start, and how many of the file's frames each frame of the clip advances. */
  fileFrames: { start: number; step: number };
}

export type BlendWarningCode =
  | "action-layer-not-played"
  | "clip-not-sampled"
  | "constraint-not-evaluated"
  | "curve-modifier-not-applied"
  | "deform-approximated"
  | "driver-not-evaluated"
  | "extra-skins"
  | "invalid-data"
  | "library-not-loaded"
  | "material-approximated"
  | "modifier-not-applied"
  | "object-not-shown"
  | "too-many-bones"
  | "too-many-uv-sets"
  | "unweighted-vertices";

export interface BlendWarningSubject {
  kind: "node" | "material" | "clip" | "file";
  /** The node's, material's or clip's name, or a file's name. An empty file name is the file being read. */
  name: string;
}

/** Something the scene shows differently from Blender, or leaves out. Its text calls the scene the preview. */
export interface BlendWarning {
  /** Stable across versions, for tools to match on. */
  code: BlendWarningCode;
  subject: BlendWarningSubject;
  /** Short and plain, for people. */
  message: string;
  /** Facts beyond the message. */
  detail?: string;
}
