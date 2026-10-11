import type { FoundFile, Material, SceneDescription } from "@arcue/scene";
import { parseStoredPath } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { Reference, Version } from "../test/fixtures";
import {
  findInFixtures,
  fixturesDir,
  importBytes,
  importFixture,
  readFixture,
  reference,
  VERSIONS,
} from "../test/fixtures";
import { decompressBlend } from "./blend/decompress";
import type { BlendFile, BlendStruct } from "./blend/file";
import { readBlendFile } from "./blend/file";
import { datablocks, idName } from "./blend/ids";
import { sequencePath } from "./image-paths";
import { sequenceFrame } from "./scene/materials";

interface ImageReference {
  image: string;
  /** The image file relative to the fixtures folder, or null for a packed image. */
  file: string | null;
  exists: boolean;
  linked: boolean;
  /** Linked from another file and packed with its library into this one, which 5.x can do. */
  linkedPacked: boolean;
  source: string;
  packedTiles: number[];
  /** The bytes of the image packed into the file, or 0. */
  packedSize: number;
}

interface ImagesReference extends Reference {
  /** The image each material's Image Texture node samples, as Blender sees it. */
  images: Record<string, ImageReference>;
}

function materialNamed(scene: SceneDescription, name: string): Material {
  const found = scene.materials.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`No material ${name}.`);
  return found;
}

describe.each(VERSIONS)("image files from Blender %s", async (version) => {
  const scene = await importFixture("images", version, findInFixtures);
  const expected = reference("images", version) as ImagesReference;
  const material = (name: string): Material => materialNamed(scene, name);
  const byFile = (exists: boolean) => {
    const groups = new Map<string, string[]>();
    for (const [name, image] of Object.entries(expected.images)) {
      if (image.linked || image.file === null || image.exists !== exists) continue;
      groups.set(image.file, [...(groups.get(image.file) ?? []), name]);
    }
    return [...groups];
  };

  it("loads one texture for each image file, however many Image datablocks name it", () => {
    const found = byFile(true);
    expect(found).toEqual([["textures/checker.png", ["CheckerA", "CheckerB"]]]);
    for (const [file, materials] of found) {
      const textures = new Set(materials.map((name) => material(name).baseColorTexture?.texture));
      expect(textures.size, file).toBe(1);
      expect(scene.textures[[...textures][0] ?? -1]?.storedPath).toBe(file);
    }
    expect(scene.textures.filter((texture) => texture.foundPath !== null)).toHaveLength(found.length);
  });

  it("reports each missing image file once, naming every material that uses it", () => {
    const missing = byFile(false);
    expect(missing).toEqual([["textures/absent.png", ["AbsentA", "AbsentB"]]]);
    const warnings = scene.source.warnings.filter((warning) => warning.code === "texture-not-found");
    expect(warnings.map((warning) => [warning.subject.name, warning.materials])).toEqual(
      missing.map(([file, materials]) => [file.split("/").pop(), materials]),
    );
    for (const [file, materials] of missing) {
      for (const name of materials) expect(material(name).missingTextures).toEqual({ baseColor: file });
    }
  });

  it("leaves out images linked from other files and names them with the other linked data", () => {
    const linked = Object.entries(expected.images).filter(([, image]) => image.linked && !image.linkedPacked);
    expect(linked.map(([name, image]) => [name, image.image])).toEqual([["Borrowed", "SharedChecker"]]);
    for (const [name] of linked) {
      expect(material(name).baseColorTexture, name).toBeNull();
      expect(material(name).baseColor).toEqual([0.8, 0.8, 0.8, 1]);
    }
    const library = scene.source.warnings.find((warning) => warning.code === "library-not-loaded");
    expect(library?.detail).toBe(
      `From other .blend files: images ${linked.map(([, image]) => image.image).join(", ")}`,
    );
  });

  it("shows the images packed with the library they are linked from, which needs no library", () => {
    const packed = Object.entries(expected.images).filter(([, image]) => image.linkedPacked);
    expect(packed.map(([name]) => name)).toEqual(version === "4.2" ? [] : ["LibraryPixels", "LibraryBeside"]);
    for (const [name, image] of packed) {
      const texture = scene.textures[material(name).baseColorTexture?.texture ?? -1];
      if (image.file === null) {
        expect(texture?.bytes.length, name).toBe(image.packedSize);
        expect(Array.from(texture?.bytes.subarray(0, 4) ?? []), name).toEqual([0x89, 0x50, 0x4e, 0x47]);
      } else {
        expect(image.exists, name).toBe(true);
        expect(texture?.foundPath, name).toBe(image.file);
      }
    }
  });

  it("shows the first of the UDIM tiles packed into the file and says so", () => {
    const tiled = Object.entries(expected.images).filter(([, image]) => image.source === "TILED");
    expect(tiled.map(([name, image]) => [name, image.packedTiles])).toEqual([["Tiled", [1001, 1002]]]);
    for (const [name, image] of tiled) {
      const texture = scene.textures[material(name).baseColorTexture?.texture ?? -1];
      expect(Array.from(texture?.bytes.subarray(0, 4) ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
      const approximated = scene.source.warnings.find(
        (warning) => warning.code === "material-approximated" && warning.subject.name === name,
      );
      expect(approximated?.detail).toBe(`${image.image} is a UDIM tiled image, shown with its first tile`);
    }
  });
});

describe.each(VERSIONS)("the gray images of the shading fixture from Blender %s", (version) => {
  it("are read once, for both the gray check and their textures", async () => {
    const asked: string[] = [];
    const scene = await importFixture("shading", version, (storedPath) => {
      asked.push(storedPath);
      return findInFixtures(storedPath);
    });
    expect(asked).toContain("textures/checker.png");
    expect(asked.length).toBe(new Set(asked).size);
    expect(scene.textures.filter((texture) => texture.name === "checker")).toHaveLength(1);
  });
});

describe.each(VERSIONS)("a UDIM image with one tile packed in a file from Blender %s", (version) => {
  it("is shown as Blender shows it, without a note", async () => {
    const expected = reference("images", version) as ImagesReference;
    const bytes = await decompressBlend(readFixture("images", version));
    const file = readBlendFile(bytes);
    const tiled = datablocks(file, "IM").find((image) => idName(image) === expected.images.Tiled?.image);
    const [first, second] = tiled?.list("packedfiles") ?? [];
    const next = first?.field("next");
    if (!first || !second || !next) throw new Error("The images fixture packs no two tiles.");
    file.view.setBigUint64(first.offset + next.offset, 0n, file.little);
    const scene = await importBytes("images.blend", bytes, findInFixtures);
    const tiledMaterial = materialNamed(scene, "Tiled");
    expect(scene.textures[tiledMaterial.baseColorTexture?.texture ?? -1]?.bytes.length).toBe(
      expected.images.Tiled?.packedSize,
    );
    const notes = scene.source.warnings.filter((warning) => warning.subject.name === "Tiled");
    expect(notes).toEqual([]);
  });
});

/** Finds an image as the core does: by the relative path it stores, or for an absolute path by name in textures/. */
function findLikeTheCore(storedPath: string): Promise<FoundFile | null> {
  const stored = parseStoredPath(storedPath);
  return findInFixtures(stored.relative ?? `textures/${stored.name}`);
}

/** The images fixture with the path that the image of `material` stores changed to `path`. */
async function withImagePath(version: Version, material: string, path: string): Promise<Uint8Array> {
  const expected = reference("images", version) as ImagesReference;
  const bytes = await decompressBlend(readFixture("images", version));
  const file = readBlendFile(bytes);
  const image = datablocks(file, "IM").find((candidate) => idName(candidate) === expected.images[material]?.image);
  const field = image?.field("filepath") ?? image?.field("name");
  if (!image || !field) throw new Error(`No image for ${material}.`);
  const encoded = new TextEncoder().encode(path);
  bytes.fill(0, image.offset + field.offset, image.offset + field.offset + field.size);
  bytes.set(encoded, image.offset + field.offset);
  return bytes;
}

describe.each(VERSIONS)("image paths spelled differently in a file from Blender %s", (version) => {
  const expected = reference("images", version) as ImagesReference;
  const missing = (scene: SceneDescription) =>
    scene.source.warnings.filter((warning) => warning.code === "texture-not-found");

  it.each(["//textures/./absent.png", "//textures/sub/../absent.png"])(
    "reports one missing file once when one image stores it as %s",
    async (path) => {
      const scene = await importBytes("images.blend", await withImagePath(version, "AbsentB", path), findLikeTheCore);
      expect(missing(scene).map((warning) => [warning.materials, warning.detail])).toEqual([
        [
          ["AbsentA", "AbsentB"],
          "Stored path: textures/absent.png, used as base color of AbsentA, base color of AbsentB",
        ],
      ]);
      expect(materialNamed(scene, "AbsentA").missingTextures).toEqual({ baseColor: "textures/absent.png" });
      expect(materialNamed(scene, "AbsentB").missingTextures).toEqual({ baseColor: path.slice(2) });
    },
  );

  it("names every material in the one warning for missing files of one name in different folders", async () => {
    const scene = await importBytes(
      "images.blend",
      await withImagePath(version, "AbsentB", "//elsewhere/absent.png"),
      findLikeTheCore,
    );
    expect(missing(scene)).toMatchObject([
      {
        subject: { kind: "texture", name: "absent.png" },
        detail:
          "Stored path: textures/absent.png, used as base color of AbsentA; " +
          "Stored path: elsewhere/absent.png, used as base color of AbsentB",
        materials: ["AbsentA", "AbsentB"],
        uses: [
          { material: "AbsentA", slot: "baseColor" },
          { material: "AbsentB", slot: "baseColor" },
        ],
      },
    ]);
    expect(materialNamed(scene, "AbsentB").missingTextures).toEqual({ baseColor: "elsewhere/absent.png" });
  });

  it("loads one texture for a file that one image stores as relative and another as absolute", async () => {
    const absolute = `${fixturesDir}${expected.images.CheckerA?.file}`;
    const scene = await importBytes(
      "images.blend",
      await withImagePath(version, "CheckerB", absolute),
      findLikeTheCore,
    );
    const checkers = ["CheckerA", "CheckerB"].map((name) => materialNamed(scene, name).baseColorTexture?.texture);
    expect(checkers[0]).toBeDefined();
    expect(checkers[1]).toBe(checkers[0]);
    expect(scene.textures.flatMap((texture) => texture.foundPath ?? [])).toEqual([expected.images.CheckerA?.file]);
    const absolutePath = scene.source.warnings.find((warning) => warning.code === "texture-path-absolute");
    expect(absolutePath?.materials).toEqual(["CheckerB"]);
  });

  it("reports a missing file once when one image stores it as relative and another as absolute", async () => {
    const absolute = `${fixturesDir}${expected.images.AbsentA?.file}`;
    const scene = await importBytes("images.blend", await withImagePath(version, "AbsentB", absolute), findLikeTheCore);
    expect(missing(scene).map((warning) => [warning.subject.name, warning.materials])).toEqual([
      ["absent.png", ["AbsentA", "AbsentB"]],
    ]);
  });
});

/** The shading fixture, with the image user of the Image Texture node of its Sequence material. */
async function sequenceUser(version: Version): Promise<{ bytes: Uint8Array; node: BlendStruct; set: SetUser }> {
  const bytes = await decompressBlend(readFixture("shading", version));
  const file = readBlendFile(bytes);
  const material = datablocks(file, "MA").find((candidate) => idName(candidate) === "Sequence");
  const nodes = material?.deref("nodetree")?.list("nodes") ?? [];
  const node = nodes.find((candidate) => candidate.string("idname") === "ShaderNodeTexImage");
  const user = node?.deref("storage")?.struct("iuser");
  if (!node || !user) throw new Error("The Sequence material has no image user.");
  return { bytes, node, set: (values) => setNumbers(file, user, values) };
}

type SetUser = (values: Record<string, number>) => void;

function setNumbers(file: BlendFile, struct: BlendStruct, values: Record<string, number>): void {
  for (const [name, value] of Object.entries(values)) {
    const field = struct.field(name);
    if (!field) throw new Error(`No field ${name}.`);
    const at = struct.offset + field.offset;
    if (field.size === 1) file.view.setInt8(at, value);
    else if (field.size === 2) file.view.setInt16(at, value, file.little);
    else file.view.setInt32(at, value, file.little);
  }
}

interface SequenceReference {
  /** The color each sequence frame file stores, by its path. */
  files: Record<string, number[]>;
  /** Start frame, frame count, cycling, offset and scene frame of an image user, and the color Cycles bakes for it. */
  sequenceFrames: [sfra: number, frames: number, cycl: number, offset: number, scene: number, baked: number[]][];
}

/** The color Blender shows for an image file it cannot find. */
const MISSING_IMAGE = [1, 0, 1];

function decodeSrgb(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

describe.each(VERSIONS)("the image sequences of the shading fixture from Blender %s", (version) => {
  it("show the frame Blender's Image Texture node picks at a scene frame", async () => {
    const { node, set } = await sequenceUser(version);
    const expected = reference("shading", version) as unknown as SequenceReference;
    expect(expected.sequenceFrames).toHaveLength(7);
    for (const [sfra, frames, cycl, offset, scene, baked] of expected.sequenceFrames) {
      set({ sfra, frames, cycl, offset });
      const file = sequencePath("textures/sequence.0001.png", sequenceFrame(node, scene));
      const shown = expected.files[file]?.map(decodeSrgb) ?? MISSING_IMAGE;
      const label = JSON.stringify({ sfra, frames, cycl, offset, scene, file });
      for (const [index, channel] of shown.entries()) expect(channel, label).toBeCloseTo(baked[index] ?? Number.NaN, 3);
    }
  });

  it("report the frame file Blender reads before the sequence starts as missing", async () => {
    const { bytes, set } = await sequenceUser(version);
    set({ sfra: 5 });
    const scene = await importBytes("shading.blend", bytes, findInFixtures);
    expect(materialNamed(scene, "Sequence")).toMatchObject({
      baseColorTexture: null,
      missingTextures: { baseColor: "textures/sequence.0000.png" },
    });
  });
});
