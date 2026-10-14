const FRAME = 46186158000 / 30;

interface FileSettings {
  coordAxisSign?: number;
  /** 1 for Y up, 2 for Z up. */
  upAxis?: 1 | 2;
  unitScaleFactor?: number;
}

function asciiFbx(
  objects: string,
  connections: string,
  { coordAxisSign = 1, upAxis = 1, unitScaleFactor = 100 }: FileSettings = {},
): string {
  return `; FBX 7.4.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",${upAxis}
		P: "UpAxisSign", "int", "Integer", "",1
		P: "FrontAxis", "int", "Integer", "",${upAxis === 1 ? 2 : 1}
		P: "FrontAxisSign", "int", "Integer", "",${upAxis === 1 ? 1 : -1}
		P: "CoordAxis", "int", "Integer", "",0
		P: "CoordAxisSign", "int", "Integer", "",${coordAxisSign}
		P: "UnitScaleFactor", "double", "Number", "",${unitScaleFactor}
		P: "TimeMode", "enum", "", "",6
	}
}
Objects:  {
${objects}
}
Connections:  {
${connections}
}
`;
}

const TRIANGLE_GEOMETRY = `	Geometry: 1000, "Geometry::Tri", "Mesh" {
		Vertices: *9 {
			a: 0,0,0,1,0,0,0,1,0
		}
		PolygonVertexIndex: *3 {
			a: 0,1,-3
		}
		LayerElementUV: 0 {
			Version: 101
			Name: "UVMap"
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			UV: *6 {
				a: 0,0,1,0,0,1
			}
		}
		LayerElementMaterial: 0 {
			Version: 101
			MappingInformationType: "AllSame"
			ReferenceInformationType: "IndexToDirect"
			Materials: *1 {
				a: 0
			}
		}
		Layer: 0 {
			Version: 100
			LayerElement:  {
				Type: "LayerElementUV"
				TypedIndex: 0
			}
			LayerElement:  {
				Type: "LayerElementMaterial"
				TypedIndex: 0
			}
		}
	}`;

const TRIANGLE_MODEL = `	Model: 2000, "Model::Tri", "Mesh" {
		Version: 232
	}`;

const TRIANGLE_CONNECTIONS = `	C: "OO",2000,0
	C: "OO",1000,2000`;

/**
 * A one-triangle mesh whose material references an image that is not embedded, stored with a relative path and an
 * absolute path from another machine.
 */
export const EXTERNAL_TEXTURE_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	Material: 3000, "Material::Painted", "" {
		Version: 102
		ShadingModel: "lambert"
		Properties70:  {
			P: "DiffuseColor", "Color", "", "A",1,1,1
		}
	}
	Texture: 4000, "Texture::Painted", "" {
		Type: "TextureVideoClip"
		Version: 202
		TextureName: "Texture::Painted"
		FileName: "C:/Users/artist/textures/painted.png"
		RelativeFilename: "textures/painted.png"
	}`,
  `${TRIANGLE_CONNECTIONS}
	C: "OO",3000,2000
	C: "OP",4000,3000, "DiffuseColor"`,
);

function texture(id: number, name: string): string {
  return `	Texture: ${id}, "Texture::${name}", "" {
		Type: "TextureVideoClip"
		Version: 202
		TextureName: "Texture::${name}"
		FileName: "${name}.png"
		RelativeFilename: "${name}.png"
	}`;
}

/**
 * The triangle with a 3ds Max PBR metal/roughness material whose roughness map is "rough.png" and whose metalness
 * map is "metal.png".
 */
export const METAL_ROUGH_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	Material: 3000, "Material::Metal", "" {
		Version: 102
		ShadingModel: "unknown"
		Properties70:  {
			P: "3dsMax|ClassIDa", "int", "Integer", "",3490651648
			P: "3dsMax|ClassIDb", "int", "Integer", "",3195528448
			P: "3dsMax|main|roughness", "float", "Number", "",0.4
			P: "3dsMax|main|metalness", "float", "Number", "",1
		}
	}
${texture(4000, "rough")}
${texture(4001, "metal")}`,
  `${TRIANGLE_CONNECTIONS}
	C: "OO",3000,2000
	C: "OP",4000,3000, "3dsMax|main|roughness_map"
	C: "OP",4001,3000, "3dsMax|main|metalness_map"`,
);

/** The triangle with an FBX Phong material whose ShininessExponent is driven by the texture "gloss.png". */
export const PHONG_SHININESS_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	Material: 3000, "Material::Shiny", "" {
		Version: 102
		ShadingModel: "phong"
		Properties70:  {
			P: "ShininessExponent", "Number", "", "A",20
		}
	}
${texture(4000, "gloss")}`,
  `${TRIANGLE_CONNECTIONS}
	C: "OO",3000,2000
	C: "OP",4000,3000, "ShininessExponent"`,
);

/**
 * One triangle shared by two nodes: "Left" moved 2 m along -X, and "Right" moved 2 m along +X with a geometric
 * translation of 1 m along +Y that applies to its geometry only.
 */
export const SHARED_GEOMETRY_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
	Model: 2000, "Model::Left", "Mesh" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",-2,0,0
		}
	}
	Model: 2001, "Model::Right", "Mesh" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",2,0,0
			P: "GeometricTranslation", "Vector3D", "Vector", "",0,1,0
		}
	}
	Material: 3000, "Material::Plain", "" {
		Version: 102
		ShadingModel: "lambert"
	}`,
  `	C: "OO",2000,0
	C: "OO",2001,0
	C: "OO",1000,2000
	C: "OO",1000,2001
	C: "OO",3000,2000
	C: "OO",3000,2001`,
);

function triangleModel(id: number, name: string, x: number, type = "Mesh"): string {
  return `	Model: ${id}, "Model::${name}", "${type}" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",${x},0,0
		}
	}`;
}

/**
 * The triangle as "Body_LOD0" at the origin, "Body_LOD1" 2 m along +X and the collision helper "UCX_Body" 2 m along
 * -X, and an FBX LOD group "Rock" 5 m along +X whose children "RockHigh" and "RockLow" are its two levels.
 */
export const LOD_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${triangleModel(2000, "Body_LOD0", 0)}
${triangleModel(2001, "Body_LOD1", 2)}
${triangleModel(2002, "UCX_Body", -2)}
	NodeAttribute: 9000, "NodeAttribute::Rock", "LodGroup" {
		TypeFlags: "LodGroup"
	}
${triangleModel(9001, "Rock", 5, "LodGroup")}
${triangleModel(2003, "RockHigh", 0)}
${triangleModel(2004, "RockLow", 0)}`,
  `	C: "OO",2000,0
	C: "OO",2001,0
	C: "OO",2002,0
	C: "OO",9001,0
	C: "OO",9000,9001
	C: "OO",2003,9001
	C: "OO",2004,9001
	C: "OO",1000,2000
	C: "OO",1000,2001
	C: "OO",1000,2002
	C: "OO",1000,2003
	C: "OO",1000,2004`,
);

interface TakeOptions {
  /** The take's range in frames at 30 fps, or null for a take without LocalStart and LocalStop. */
  range: [start: number, stop: number] | null;
  /** Frames at 30 fps of the keys on the triangle's X translation. */
  keyFrames: number[];
  values: number[];
  interpolation: "constant" | "linear";
}

/** The triangle and one take, "Hop", that animates its X translation. */
export function animatedFbx({ range, keyFrames, values, interpolation }: TakeOptions): string {
  const ticks = (frame: number) => Math.round(frame * FRAME);
  const stackRange = range
    ? `
		Properties70:  {
			P: "LocalStart", "KTime", "Time", "",${ticks(range[0])}
			P: "LocalStop", "KTime", "Time", "",${ticks(range[1])}
		}`
    : "";
  return asciiFbx(
    `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	AnimationStack: 5000, "AnimStack::Hop", "" {${stackRange}
	}
	AnimationLayer: 5001, "AnimLayer::BaseLayer", "" {
	}
	AnimationCurveNode: 5002, "AnimCurveNode::T", "" {
		Properties70:  {
			P: "d|X", "Number", "", "A",0
			P: "d|Y", "Number", "", "A",0
			P: "d|Z", "Number", "", "A",0
		}
	}
	AnimationCurve: 5003, "AnimCurve::", "" {
		Default: 0
		KeyVer: 4009
		KeyTime: *${keyFrames.length} {
			a: ${keyFrames.map(ticks).join(",")}
		}
		KeyValueFloat: *${values.length} {
			a: ${values.join(",")}
		}
		KeyAttrFlags: *1 {
			a: ${interpolation === "constant" ? 2 : 4}
		}
		KeyAttrDataFloat: *4 {
			a: 0,0,0,0
		}
		KeyAttrRefCount: *1 {
			a: ${keyFrames.length}
		}
	}`,
    `${TRIANGLE_CONNECTIONS}
	C: "OO",5001,5000
	C: "OO",5002,5001
	C: "OP",5002,2000, "Lcl Translation"
	C: "OP",5003,5002, "d|X"`,
  );
}

/** The triangle in a file whose X axis points left, so its axes are left-handed. */
export const LEFT_HANDED_FBX = asciiFbx(`${TRIANGLE_GEOMETRY}\n${TRIANGLE_MODEL}`, TRIANGLE_CONNECTIONS, {
  coordAxisSign: -1,
});

/** The triangle skinned to one bone, "Root", that weights only its first two vertices. */
export const PARTLY_WEIGHTED_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	NodeAttribute: 6000, "NodeAttribute::Root", "LimbNode" {
		TypeFlags: "Skeleton"
	}
	Model: 6001, "Model::Root", "LimbNode" {
		Version: 232
	}
	Deformer: 7000, "Deformer::Skin", "Skin" {
		Version: 101
		Link_DeformAcuracy: 50
	}
	Deformer: 7001, "SubDeformer::Root", "Cluster" {
		Version: 100
		UserData: "", ""
		Indexes: *2 {
			a: 0,1
		}
		Weights: *2 {
			a: 1,1
		}
		Transform: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
		TransformLink: *16 {
			a: 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1
		}
	}`,
  `${TRIANGLE_CONNECTIONS}
	C: "OO",6001,0
	C: "OO",6000,6001
	C: "OO",7000,1000
	C: "OO",7001,7000
	C: "OO",6001,7001`,
);

/**
 * The triangle with one shape key, "Bulge", at 25%. It has an in-between shape at 50% that lifts the first vertex
 * 0.5 m along Z and a full shape that lifts it 1 m and turns its normal by (0, 1, 0).
 */
export const IN_BETWEEN_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	Geometry: 1100, "Geometry::Half", "Shape" {
		Version: 100
		Indexes: *1 {
			a: 0
		}
		Vertices: *3 {
			a: 0,0,0.5
		}
		Normals: *3 {
			a: 0,0.5,0
		}
	}
	Geometry: 1101, "Geometry::Full", "Shape" {
		Version: 100
		Indexes: *1 {
			a: 0
		}
		Vertices: *3 {
			a: 0,0,1
		}
		Normals: *3 {
			a: 0,1,0
		}
	}
	Deformer: 8000, "Deformer::Blend", "BlendShape" {
		Version: 100
	}
	Deformer: 8001, "SubDeformer::Bulge", "BlendShapeChannel" {
		Version: 100
		DeformPercent: 25
		FullWeights: *2 {
			a: 50,100
		}
	}`,
  `${TRIANGLE_CONNECTIONS}
	C: "OO",8000,1000
	C: "OO",8001,8000
	C: "OO",1100,8001
	C: "OO",1101,8001`,
);

/** The eight-byte PNG signature, enough for the importer to tell the image type. */
export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/** The triangle's node with the given local transform properties, such as `P: "Lcl Scaling", ...`. */
function transformedTriangle(properties: string): string {
  return `${TRIANGLE_GEOMETRY}
	Model: 2000, "Model::Tri", "Mesh" {
		Version: 232
		Properties70:  {
${properties}
		}
	}`;
}

/** A meter file whose root node is scaled by 100, as Blender writes it with "All Local" in a meter scene. */
export const ROOT_SCALE_FBX = asciiFbx(
  transformedTriangle(`			P: "Lcl Scaling", "Lcl Scaling", "", "A",100,100,100`),
  TRIANGLE_CONNECTIONS,
);

/** A centimeter file whose root node is scaled by 100, which only turns meter-sized content into centimeters. */
export const CENTIMETER_ROOT_SCALE_FBX = asciiFbx(
  transformedTriangle(`			P: "Lcl Scaling", "Lcl Scaling", "", "A",100,100,100`),
  TRIANGLE_CONNECTIONS,
  { unitScaleFactor: 1 },
);

/** A Z-up file whose root node is still rotated -90° about X, so its content lies on its back. */
export const ROOT_ROTATION_FBX = asciiFbx(
  transformedTriangle(`			P: "Lcl Rotation", "Lcl Rotation", "", "A",-90,0,0`),
  TRIANGLE_CONNECTIONS,
  { upAxis: 2 },
);

/** A Y-up file whose root node is rotated -90° about X to stand Z-up content up, as Blender writes it. */
export const Y_UP_ROOT_ROTATION_FBX = asciiFbx(
  transformedTriangle(`			P: "Lcl Rotation", "Lcl Rotation", "", "A",-90,0,0`),
  TRIANGLE_CONNECTIONS,
);

/** A meter file with a "Rig" root holding an "Armature" scaled by 0.01, whose child "Hips" is a bone. */
export const ARMATURE_SCALE_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	Model: 6000, "Model::Rig", "Null" {
		Version: 232
	}
	Model: 6001, "Model::Armature", "Null" {
		Version: 232
		Properties70:  {
			P: "Lcl Scaling", "Lcl Scaling", "", "A",0.01,0.01,0.01
		}
	}
	NodeAttribute: 6002, "NodeAttribute::Hips", "LimbNode" {
		TypeFlags: "Skeleton"
	}
	Model: 6003, "Model::Hips", "LimbNode" {
		Version: 232
		Properties70:  {
			P: "Lcl Scaling", "Lcl Scaling", "", "A",0.01,0.01,0.01
		}
	}`,
  `	C: "OO",6000,0
	C: "OO",6001,6000
	C: "OO",6002,6003
	C: "OO",6003,6001
	C: "OO",2000,6000
	C: "OO",1000,2000`,
);

/** The triangle with a second UV map, "Detail". */
const DETAIL_UV_TRIANGLE_GEOMETRY = `	Geometry: 1000, "Geometry::Tri", "Mesh" {
		Vertices: *9 {
			a: 0,0,0,1,0,0,0,1,0
		}
		PolygonVertexIndex: *3 {
			a: 0,1,-3
		}
		LayerElementUV: 0 {
			Version: 101
			Name: "UVMap"
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			UV: *6 {
				a: 0,0,1,0,0,1
			}
		}
		LayerElementUV: 1 {
			Version: 101
			Name: "Detail"
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			UV: *6 {
				a: 1,1,0,1,1,0
			}
		}
		LayerElementMaterial: 0 {
			Version: 101
			MappingInformationType: "AllSame"
			ReferenceInformationType: "IndexToDirect"
			Materials: *1 {
				a: 0
			}
		}
		Layer: 0 {
			Version: 100
			LayerElement:  {
				Type: "LayerElementUV"
				TypedIndex: 0
			}
			LayerElement:  {
				Type: "LayerElementMaterial"
				TypedIndex: 0
			}
		}
		Layer: 1 {
			Version: 100
			LayerElement:  {
				Type: "LayerElementUV"
				TypedIndex: 1
			}
		}
	}`;

/**
 * The triangle with a texture whose only stored path is absolute, from the exporting machine. The texture samples the
 * second UV map, clamps across U and repeats across V, and is offset and scaled.
 */
export const ABSOLUTE_TEXTURE_FBX = asciiFbx(
  `${DETAIL_UV_TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	Material: 3000, "Material::Stone", "" {
		Version: 102
		ShadingModel: "lambert"
	}
	Texture: 4000, "Texture::Stone", "" {
		Type: "TextureVideoClip"
		Version: 202
		TextureName: "Texture::Stone"
		Properties70:  {
			P: "UVSet", "KString", "", "", "Detail"
			P: "WrapModeU", "enum", "", "",1
			P: "Translation", "Vector", "", "A",0.25,0.5,0
			P: "Scaling", "Vector", "", "A",2,4,1
		}
		FileName: "/tmp/export-staging/StoneStriker-BaseColor.png"
		RelativeFilename: ""
	}`,
  `${TRIANGLE_CONNECTIONS}
	C: "OO",3000,2000
	C: "OP",4000,3000, "DiffuseColor"`,
);

/** The triangle with a material that links no texture, and a texture "Body_BaseColor.png" that no material links. */
export const UNLINKED_TEXTURE_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	Material: 3000, "Material::Body", "" {
		Version: 102
		ShadingModel: "lambert"
	}
	Texture: 4000, "Texture::Body", "" {
		Type: "TextureVideoClip"
		Version: 202
		TextureName: "Texture::Body"
		FileName: "C:/Users/artist/textures/Body_BaseColor.png"
		RelativeFilename: "textures/Body_BaseColor.png"
	}`,
  `${TRIANGLE_CONNECTIONS}
	C: "OO",3000,2000`,
);

/**
 * The triangle with a material whose diffuse color is a layered texture of two files, "dirt.png" over "paint.png",
 * as Maya and 3ds Max write layered textures.
 */
export const LAYERED_TEXTURE_FBX = asciiFbx(
  `${TRIANGLE_GEOMETRY}
${TRIANGLE_MODEL}
	Material: 3000, "Material::Layered", "" {
		Version: 102
		ShadingModel: "lambert"
	}
	LayeredTexture: 5000, "LayeredTexture::Layers", "" {
		LayeredTexture: 101
		BlendModes: *2 {
			a: 0,0
		}
		Alphas: *2 {
			a: 1,1
		}
	}
${texture(4000, "dirt")}
${texture(4001, "paint")}`,
  `${TRIANGLE_CONNECTIONS}
	C: "OO",3000,2000
	C: "OO",4000,5000
	C: "OO",4001,5000
	C: "OP",5000,3000, "DiffuseColor"`,
);

/** A chain of `depth` empty nodes, "Link0" at the root and each next one the child of the one before. */
export function nodeChainFbx(depth: number): string {
  const id = (index: number) => 7000 + index;
  const models = Array.from(
    { length: depth },
    (_, index) => `	Model: ${id(index)}, "Model::Link${index}", "Null" {
		Version: 232
	}`,
  );
  const links = Array.from(
    { length: depth },
    (_, index) => `	C: "OO",${id(index)},${index === 0 ? 0 : id(index - 1)}`,
  );
  return asciiFbx(models.join("\n"), links.join("\n"));
}
