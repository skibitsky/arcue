import { z } from "zod";
import { importWarningSchema } from "./import-warning";
import { partSummarySchema } from "./parts";

const countSchema = z.number().int().nonnegative();

export const inspectedMeshSchema = z.object({
  /** The object's name, as the exporting tool shows it. */
  name: z.string(),
  /** The node path that anchors and comments use for the mesh. */
  path: z.string(),
  triangles: countSchema,
  /** The file's own vertices, before splits at UV seams and hard edges. */
  vertices: countSchema,
  skinned: z.boolean(),
});

export const inspectedTextureRefSchema = z.object({
  /** The material property the texture feeds, such as "baseColor" or "normal". */
  slot: z.string(),
  texture: z.string(),
});

export const inspectedMaterialSchema = z.object({
  name: z.string(),
  textures: z.array(inspectedTextureRefSchema),
});

export const inspectedTextureSchema = z.object({
  /** The texture's name, or for a texture that was not found, the path the file stores. */
  name: z.string(),
  found: z.boolean(),
  /** Null when the texture was not found. */
  mimeType: z.string().nullable(),
});

export const inspectedClipSchema = z.object({
  /** The clip's identity: its name in the file, such as "Armature|Walk". */
  name: z.string(),
  displayName: z.string(),
  frames: countSchema,
  fps: z.number().positive(),
  /** Seconds. */
  duration: z.number().nonnegative(),
});

export const inspectedMemberSchema = z.object({
  /** Relative to the model's folder, with "/" separators. */
  file: z.string(),
  /** How the file joins the model: its clips, nodes on a bone, nodes in place, or a material's texture. */
  role: z.enum(["animation", "attach", "set", "texture"]),
  found: z.boolean(),
});

/** What `asset.inspect` reports about a file, all plain JSON. */
export const assetInspectionSchema = z.object({
  file: z.object({
    /** Absolute path, with "/" separators. */
    path: z.string(),
    name: z.string(),
    bytes: countSchema,
  }),
  format: z.string(),
  /** The exporting tool and its version, such as "Blender (stable FBX IO) 5.0.1", or null when the file has none. */
  exporter: z.string().nullable(),
  fps: z.number(),
  /** The file's own up axis, such as "+Z", before Arcue converted it to +Y up. */
  upAxis: z.string(),
  /** How many meters one unit of the file was. */
  unitMeters: z.number(),
  /** Height of the rest pose in meters, 0 for a file without meshes. */
  height: z.number().nonnegative(),
  meshes: z.array(inspectedMeshSchema),
  /** Every mesh in exactly one part; LOD groups, collision helpers and sockets are parts with their own roles. */
  parts: z.array(partSummarySchema),
  triangles: countSchema,
  bones: countSchema,
  materials: z.array(inspectedMaterialSchema),
  textures: z.array(inspectedTextureSchema),
  clips: z.array(inspectedClipSchema),
  /** The composition file applied to the model, absolute with "/" separators, or null when none applies. */
  composition: z.string().nullable(),
  /** The other files the model is composed with: the composition's and "<model>@<clip>" animation files. */
  members: z.array(inspectedMemberSchema),
  warnings: z.array(importWarningSchema),
});

export type InspectedMesh = z.output<typeof inspectedMeshSchema>;
export type InspectedMaterial = z.output<typeof inspectedMaterialSchema>;
export type InspectedTexture = z.output<typeof inspectedTextureSchema>;
export type InspectedClip = z.output<typeof inspectedClipSchema>;
export type InspectedMember = z.output<typeof inspectedMemberSchema>;
export type AssetInspection = z.output<typeof assetInspectionSchema>;
