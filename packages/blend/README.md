# @arcue/blend

Reads Blender `.blend` files in JavaScript, without Blender: meshes, armatures, skin weights, shape keys, materials and animation sampled into clips. It runs in browsers, Web Workers and Node 22 or later, with no native code and no WebAssembly. It is the reader behind Arcue's Blender support.

## What it reads

| | |
|---|---|
| Blender versions | Files saved by Blender 2.80 and later. Older files are refused. The tests run on files saved by Blender 4.2.0 and 5.2.2 LTS. Files from other versions are expected to work, but no test covers them. |
| Compression | Uncompressed files, zstd-compressed files (Blender 3.0 and later) and gzip-compressed files (earlier versions). A bundled copy of fzstd decodes zstd. Gzip needs `DecompressionStream`, which browsers and Node have. |
| Modifiers | Only the Armature modifier and the Smooth by Angle node group are evaluated. Every other modifier that is on in the viewport is skipped, and the object gets a `modifier-not-applied` warning. Physics settings such as Collision change no shape and are skipped without a warning. |
| Other data it does not evaluate | Constraints, drivers and F-curve modifiers, each with its own warning. Data linked from other `.blend` files is not loaded, instances are not expanded, and only the first layer of a layered action plays. Objects that are not meshes, such as curves and text, come through as empty nodes with a warning. |
| Untrusted files | Files that expand past 1 GiB or nest objects and bones more than 1024 levels deep are refused with an error. A clip that would sample too many values is left out with a `clip-not-sampled` warning. |

## Usage

```js
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BlendReadError, readBlend } from "@arcue/blend";

const path = "assets/character.blend";
try {
  const scene = await readBlend(new Uint8Array(await readFile(path)), {
    readImage: (stored) => readFile(resolve(dirname(path), stored)).then((bytes) => new Uint8Array(bytes), () => null),
  });
  console.log(scene.meshes.map((mesh) => mesh.name), scene.clips.map((clip) => clip.name));
} catch (error) {
  if (error instanceof BlendReadError) console.error(`${path}: ${error.message}`);
  else throw error;
}
```

`readImage` is optional. The reader calls it only for images whose pixels change a material's colors, to tell whether they are gray, and reads no files on its own.

## The scene

Positions, transforms and tracks are in glTF's space: meters, right-handed, +Y up and +Z front. The reader turns Blender's +Z up by −90° about X and scales by the scene's unit scale, as Blender's glTF exporter does. Matrices are column-major 4×4 and quaternions are xyzw. Large arrays are typed arrays that never view the file's bytes, so a scene can be posted from a worker with its buffers transferred. Arrays may share a buffer, as the meshes of linked duplicates do, so list each buffer once in the transfer list.

| Field | Holds |
|---|---|
| `nodes` | Objects and bones, parents first, with their rest transforms and whether Blender's viewport hides them. |
| `meshes` | One triangle mesh per mesh object, in its node's local space. |
| `skeletons` | The joints and inverse bind matrices that skinned meshes share. |
| `materials` | Metallic-roughness approximations of Blender's materials. |
| `images` | The images the materials sample: packed bytes, or the path the file stores. |
| `clips` | One clip per action, sampled over the scene's nodes into translation, rotation, scale and shape key weight tracks. |
| `warnings` | What the scene shows differently from Blender, or leaves out, each with a stable `code`. Their text calls the scene the preview. |

Some details that matter when using the scene:

- **File vertices are kept.** Rendered vertices are split where normals, UVs or colors differ. Each records the file's own vertex number in `sourceVertex`, and no vertex is welded, reordered or dropped. `faces` holds the file's faces as runs of vertex numbers, and `triangleFaces` the face of each triangle.
- **Skinning.** A skinned position is the sum over influences of weight × jointWorld × inverseBindMatrix × bindMatrix × localPosition. `skin.joints` and `skin.weights` hold the four strongest influences of each rendered vertex, and `skin.sourceWeights` every influence of every file vertex.
- **Materials per layout.** A texture reference names a UV set by its index in the mesh. So a material that meshes with different UV maps or color attributes use appears once for each, under the same name.
- **The rest pose.** It is the scene at its start frame, and it is the bind pose of the skinned meshes.

## Errors

`readBlend` throws a `BlendReadError` for a file it cannot read. Its `reason` says why, and its `detail` holds the specific part.

| `reason` | Meaning | `detail` |
|---|---|---|
| `unreadable` | The bytes are not a `.blend` file the reader understands. | Why, such as "its file header is damaged". |
| `too-old` | Blender before 2.80 saved the file. | The version, such as "2.79". |
| `too-deep` | The scene nests objects and bones more than 1024 levels deep. | How deep it nests. |
| `failed` | Reading the scene failed. `cause` holds the error. | The error's message. |

## License

MIT. The package includes fzstd 0.1.1 by Arjun Barrett, also MIT, in `dist/vendor/fzstd`, with the local fixes that its header lists.
