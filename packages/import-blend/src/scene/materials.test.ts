import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import type { Material, Mesh, SceneDescription, UvTransform } from "@arcue/scene";
import { describe, expect, it, vi } from "vitest";
import type { Version } from "../../test/fixtures";
import { findInFixtures, fixturesDir, importBytes, importFixture, readFixture, VERSIONS } from "../../test/fixtures";
import type { ImageSpec, MaterialSpec } from "../../test/shader-trees";
import { Nodes, ShaderTree } from "../../test/shader-trees";
import { decompressBlend } from "../blend/decompress";
import { BlendStruct, readBlendFile } from "../blend/file";
import { datablocks, idName } from "../blend/ids";
import { grayCandidates } from "./build";
import type { GrayCheck, GrayRead, MaterialDraft } from "./materials";
import { readMaterial } from "./materials";
import { collectSceneObjects } from "./objects";

/** What Cycles bakes for the shading fixture's materials, written by `fixtures/generate.py`. */
interface ShadingReference {
  /** At the first texel, the diffuse color with specular off, which is the base color times one minus metallic. */
  baked: Record<string, { base: number[]; emission: number[] }>;
  /** For each texel, its UV and where the material's Mapping nodes send it: [u, v, x, y]. */
  mapped: Record<string, [number, number, number, number][]>;
  /** For each texel, the alpha the material's Alpha input takes. */
  clipped: Record<string, number[]>;
  /** For each texel, the alpha of cutout.png. */
  cutoutAlpha: number[];
  /**
   * The color and alpha Cycles renders over a transparent film at the middle of surfaces a bake cannot show, and of
   * surfaces whose image has Alpha Mode None.
   */
  rendered: Record<string, number[]>;
  /**
   * The same for EEVEE: for materials that glow with veil.png, and under a white world for materials whose Image
   * Texture node has no image.
   */
  renderedByEevee: Record<string, number[]>;
  /** The color and alpha of each texel of veil.png, as its file stores them. */
  veil: number[];
  /** The color and alpha of each texel of premultiplied.png, as its file stores them. */
  premultiplied: number[];
  /** The base color of the shader EEVEE's output shows. */
  eevee: Record<string, number[]>;
  /** The diffuse color EEVEE renders under a white world, as a share of what it renders for a white base color. */
  albedo: Record<string, number[]>;
  /** The color each UDIM tile and sequence frame file stores, by its path. */
  files: Record<string, number[]>;
  /** The scene frame the fixture is saved at. */
  frame: number;
  /**
   * For each packed image: the material whose base color is its red channel, its packed size, whether every pixel is
   * gray, and whether the bake of that material shows the image as a texture.
   */
  packedImages: Record<string, { material: string; packedSize: number; gray: boolean; bakedTexture: boolean }>;
  /** The render method of each material whose alpha is 0.5. */
  renderMethods: Record<string, string>;
  /**
   * At the first texel, the roughness Cycles bakes for materials whose roughness comes from an image, and for
   * TintedMetallic the metallic its diffuse bake shows: one minus the baked diffuse color over the base color.
   */
  bakedScalar: Record<string, number>;
  /** The color and alpha of every texel of tinted.png, as its file stores them. */
  tintedTexel: number[];
}

/** An 8-bit RGB PNG of the pixels `pixel` gives, unfiltered. */
function rgbPng(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): Uint8Array {
  const stride = 1 + width * 3;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * stride + 1 + x * 3);
  }
  const chunk = (type: string, data: Uint8Array) => {
    const bytes = Buffer.alloc(12 + data.byteLength);
    bytes.writeUInt32BE(data.byteLength, 0);
    bytes.write(type, 4, "latin1");
    bytes.set(data, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, 8 + data.byteLength)), 8 + data.byteLength);
    return bytes;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2], 8);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function shadingReference(version: string): ShadingReference {
  return JSON.parse(readFileSync(`${fixturesDir}shading-${version}.json`, "utf8"));
}

/** The shading fixture's bytes, and a way to change the integer render settings of its scene, such as its frames. */
async function shadingScene(version: Version) {
  const bytes = await decompressBlend(readFixture("shading", version));
  const file = readBlendFile(bytes);
  const render = datablocks(file, "SC")[0]?.struct("r");
  if (!render) throw new Error("The shading fixture has no scene.");
  const set = (name: string, value: number) => {
    const field = render.field(name);
    if (field?.size !== 4) throw new Error(`No integer render setting ${name}.`);
    file.view.setInt32(render.offset + field.offset, value, file.little);
  };
  return { bytes, startFrame: render.number("sfra"), set };
}

function materialIn(scene: SceneDescription, name: string): Material {
  const found = scene.materials.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`No material ${name}.`);
  return found;
}

function expectNear(
  actual: readonly number[],
  expected: readonly number[] | undefined,
  digits: number,
  label?: string,
): void {
  expect(expected?.length, label).toBe(actual.length);
  for (const [index, value] of actual.entries())
    expect(value, label).toBeCloseTo(expected?.[index] ?? Number.NaN, digits);
}

function decodeSrgb(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Applies a UV transform in the order UvTransform gives: scale, then rotate, then offset. */
function applyTransform(transform: UvTransform | null, u: number, v: number): [number, number] {
  if (!transform) return [u, v];
  const { offset, scale, rotation } = transform;
  const [su, sv] = [u * scale[0], v * scale[1]];
  return [
    Math.cos(rotation) * su - Math.sin(rotation) * sv + offset[0],
    Math.sin(rotation) * su + Math.cos(rotation) * sv + offset[1],
  ];
}

describe.each(VERSIONS)("the shading fixture from Blender %s", async (version) => {
  const scene = await importFixture("shading", version, findInFixtures);
  const expected = shadingReference(version);
  const { startFrame } = await shadingScene(version);
  const material = (name: string): Material => materialIn(scene, name);
  const baked = (name: string) => {
    const found = expected.baked[name];
    if (!found) throw new RangeError(`No baked values for ${name}.`);
    return found;
  };
  const notes = (name: string) =>
    scene.source.warnings.find((warning) => warning.code === "material-approximated" && warning.subject.name === name)
      ?.detail;
  /** The mesh of a material's plane, and the material each of its groups shows. */
  const plane = (name: string) => {
    const mesh = scene.meshes.find((candidate) => candidate.name === `${name}Plane`);
    if (!mesh) throw new RangeError(`No plane for ${name}.`);
    const shown = mesh.groups.map((group) => scene.materials[group.material]);
    return { mesh, shown };
  };
  const firstColor = (mesh: Mesh) => Array.from(mesh.colors?.subarray(0, 3) ?? []);

  it("reads RGB and Value nodes, reroutes, muted nodes and muted links as Blender evaluates them", () => {
    for (const name of [
      "RgbBase",
      "RgbEmission",
      "ValueStrength",
      "ColorAsValue",
      "MutedConstant",
      "MutedMix",
      "MutedLink",
      "NoSurface",
      "UnavailableOutput",
      "RgbSurface",
      "ValueSurface",
    ]) {
      const shown = material(name);
      const diffuse = shown.baseColor.slice(0, 3).map((channel) => channel * (1 - shown.metallic));
      expectNear(diffuse, baked(name).base, 4, name);
      expectNear(shown.emissive, baked(name).emission, 4, name);
      expect(notes(name), name).toBeUndefined();
    }
    expect(material("ColorAsValue").roughness).toBeCloseTo(0.25);
    expect(material("MutedHue").baseColorTexture?.texture).toBe(material("CheckerBase").baseColorTexture?.texture);
    expect(baked("MutedHue").base).toEqual(baked("CheckerBase").base);
    const image = material("ImageSurface");
    expect(image).toMatchObject({ baseColor: [0, 0, 0, 1], emissive: [1, 1, 1] });
    expect(scene.textures[image.emissiveTexture?.texture ?? -1]?.name).toBe("checker");
    expectNear(baked("ImageSurface").emission, baked("CheckerBase").base, 4);
    expect(notes("ImageSurface")).toBeUndefined();
  });

  it("shows the output EEVEE renders, the light an Add Shader puts over a see-through surface and a volume's surface", () => {
    for (const name of ["TargetEevee", "TargetAllAndEevee", "TargetActiveAll"]) {
      expectNear(material(name).baseColor.slice(0, 3), expected.eevee[name], 4, name);
    }
    const clear = material("AddClear");
    expect(clear.alphaMode).toBe("opaque");
    expectNear(clear.emissive, expected.rendered.AddClear?.slice(0, 3), 4);
    for (const name of ["VolumeOnly", "Holdout"]) {
      expect(material(name).alphaMode, name).toBe("hash");
      expect(material(name).baseColor[3], name).toBe(expected.rendered[name]?.[3]);
    }
    expect(material("CyclesOnly").baseColor).toEqual([0, 0, 0, 1]);
    for (const name of ["Toon", "ToonSurface"]) {
      expect(
        material(name)
          .baseColor.slice(0, 3)
          .map((channel) => Math.round(channel * 100) / 100),
        name,
      ).toEqual([0.2, 0.4, 0.9]);
    }
  });

  it("reads glTF's color and roughness factors with their images", () => {
    const factors = material("GltfFactors");
    expect(factors.baseColor.map((channel) => Math.round(channel * 100) / 100)).toEqual([1, 0.5, 0.5, 1]);
    expect(scene.textures[factors.metallicRoughnessTexture?.texture ?? -1]?.name).toBe("orm");
    expect([factors.metallic, factors.roughness]).toEqual([1, 0.5]);
    const checker = baked("CheckerBase").base;
    expectNear(
      factors.emissive.map((channel, index) => channel * (checker[index] ?? Number.NaN)),
      baked("GltfFactors").emission,
      4,
    );
  });

  it("maps UVs as Blender's Point, Texture and Vector Mapping nodes do, alone, chained or scaled by a Value node", () => {
    for (const name of [
      "MappingPoint",
      "MappingTexture",
      "MappingTextureTurned",
      "MappingVector",
      "MappingLinkedScale",
      "MappingFlipped",
      "MappingChain",
    ]) {
      const transform = material(name).baseColorTexture?.transform ?? null;
      for (const [u, v, x, y] of expected.mapped[name] ?? []) {
        const [mappedU, mappedV] = applyTransform(transform, u, v);
        expect(mappedU, `${name} at ${u}, ${v}`).toBeCloseTo(x, 4);
        expect(mappedV, `${name} at ${u}, ${v}`).toBeCloseTo(y, 4);
      }
    }
    const muted = material("MappingMuted").baseColorTexture;
    expect(muted).toMatchObject({ uvSet: 1, transform: null });
    for (const [u, v, x, y] of expected.mapped.MappingMuted ?? []) {
      expect(x).toBeCloseTo(u * 0.5, 4);
      expect(y).toBeCloseTo(v * 0.5, 4);
    }
    expect(material("MappingDriven").baseColorTexture?.transform).toBeNull();
    const constant = expected.mapped.MappingNoVector ?? [];
    expect(new Set(constant.map(([, , x, y]) => `${x} ${y}`)).size).toBe(1);
    expect(material("MappingNoVector").baseColorTexture?.transform).toBeNull();
  });

  it("clips alpha where Math nodes compare it, as glTF's importer builds a cutout", () => {
    for (const name of [
      "ClipBelow",
      "ClipAbove",
      "ClipLessThanReversed",
      "ClipInvertedGreater",
      "ClipRound",
      "GltfMaskFactor",
      "MixShaderClip",
      "ClipAtZero",
      "ClipKeepsAll",
      "MixClipTranslucent",
      "ClipThenMix",
    ]) {
      const clip = material(name);
      expect(clip.alphaMode, name).toBe(name === "ClipKeepsAll" ? "opaque" : "mask");
      const kept = expected.cutoutAlpha.map((alpha) =>
        clip.alphaMode === "opaque" || alpha * clip.baseColor[3] >= clip.alphaCutoff ? 1 : 0,
      );
      expect(kept, name).toEqual(expected.clipped[name]);
    }
    const scaled = material("AlphaFactor");
    expect(scaled.alphaMode).toBe("hash");
    expectNear(
      expected.cutoutAlpha.map((alpha) => alpha * scaled.baseColor[3]),
      expected.clipped.AlphaFactor,
      2,
    );
    expect(material("MixByAlpha")).toMatchObject({ alphaMode: "hash", baseColor: [1, 1, 1, 1] });
    expect(material("AlphaDoubled")).toMatchObject({ alphaMode: "hash", baseColor: [1, 1, 1, 1] });
    for (const name of ["AlphaElsewhere", "MixAlphaOtherNode", "ClipNegativeFactor"]) {
      expect(material(name).alphaMode, name).toBe("opaque");
    }
    for (const name of ["ClipBelow", "MixByAlpha", "GltfMaskFactor", "MixShaderClip"]) {
      expect(notes(name), name).toBeUndefined();
    }
  });

  it("multiplies an image's color by its alpha where no node reads the alpha, as EEVEE does, unless it is premultiplied", () => {
    const [red = 0, green = 0, blue = 0, alpha = 0] = expected.veil;
    for (const name of ["VeilUnread", "VeilRead"]) {
      const glow = material(name);
      const premultiplied = glow.emissiveTexture?.alpha === "premultiply";
      const shown = [red, green, blue].map(
        (channel, index) => decodeSrgb(channel) * (premultiplied ? alpha : 1) * (glow.emissive[index] ?? 0),
      );
      expectNear(shown, expected.renderedByEevee[name]?.slice(0, 3), 2, name);
    }
    expectNear(baked("PackedAlphaBase").base, [red, green, blue].map(decodeSrgb), 3);
    const premultiplied = material("VeilPremulUnread");
    expect(premultiplied.emissiveTexture?.alpha).toBeUndefined();
    const stored = expected.premultiplied.slice(0, 3).map(decodeSrgb);
    const glows = stored.map((channel, index) => channel * (premultiplied.emissive[index] ?? 0));
    expectNear(glows, expected.renderedByEevee.VeilPremulUnread?.slice(0, 3), 2);
    expect(material("VeilUnread").emissiveTexture?.alpha).toBe("premultiply");
    expect(material("VeilRead").emissiveTexture?.alpha).toBeUndefined();
    expect(material("AlphaUnused")).toMatchObject({ alphaMode: "hash", baseColorTexture: { alpha: "premultiply" } });
    expect(material("AlphaUnused").baseColor[3]).toBeCloseTo(0.6);
    expect(material("CheckerBase").baseColorTexture?.alpha).toBe("premultiply");
    for (const name of ["AlphaRead", "NonColorBase", "ClipKeepsAll", "PackedAlphaBase"]) {
      expect(material(name).baseColorTexture?.alpha, name).toBe("none");
    }
    for (const name of ["MixByAlpha", "AlphaFactor", "ClipBelow", "AlphaDoubled", "MixShaderClip"]) {
      expect(material(name).baseColorTexture?.alpha, name).toBeUndefined();
    }
  });

  it("decodes each image in its own color space, as Cycles bakes a Non-Color or Linear Rec.709 base color and an sRGB or Non-Color roughness", () => {
    const stored = 128 / 255;
    expect(material("NonColorBase").baseColorTexture?.colorSpace).toBe("linear");
    expectNear(baked("NonColorBase").base, [stored, stored, stored], 5);
    expect(material("LinearBase").baseColorTexture?.colorSpace).toBe("linear");
    expectNear(baked("LinearBase").base, [stored, stored, stored], 5);
    expect(material("SrgbRoughness").roughnessTexture?.colorSpace).toBe("srgb");
    expect(expected.bakedScalar.SrgbRoughness).toBeCloseTo(decodeSrgb(stored), 5);
    expect(material("LinearRoughness").roughnessTexture).not.toBeNull();
    expect(material("LinearRoughness").roughnessTexture?.colorSpace).toBeUndefined();
    expect(expected.bakedScalar.LinearRoughness).toBeCloseTo(stored, 5);
    expect(material("CheckerBase").baseColorTexture?.colorSpace).toBeUndefined();
    for (const name of ["NonColorBase", "LinearBase", "SrgbRoughness", "LinearRoughness"]) {
      expect(notes(name), name).toBeUndefined();
    }
  });

  it("notes roughness and metallic that come from the brightness of a colored image, shown as one of its channels", () => {
    const [red = 0, green = 0, blue = 0] = expected.tintedTexel;
    const brightness = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    for (const name of ["TintedRoughness", "TintedBwRoughness", "TintedMetallic"]) {
      const value = expected.bakedScalar[name] ?? Number.NaN;
      expect(brightness, name).toBeCloseTo(value, 3);
      expect(green, name).not.toBeCloseTo(value, 3);
      expect(blue, name).not.toBeCloseTo(value, 3);
    }
    for (const name of ["TintedRoughness", "TintedBwRoughness"]) {
      expect(scene.textures[material(name).roughnessTexture?.texture ?? -1]?.name, name).toBe("tinted");
      expect(notes(name), name).toBe("Roughness comes from the brightness of tinted.png, shown as its green channel");
    }
    expect(scene.textures[material("TintedMetallic").metalnessTexture?.texture ?? -1]?.name).toBe("tinted");
    expect(notes("TintedMetallic")).toBe("Metallic comes from the brightness of tinted.png, shown as its blue channel");
    expect(material("SrgbRoughness").roughnessTexture).not.toBeNull();
    expect(notes("SrgbRoughness")).toBeUndefined();
  });

  it("keeps a material opaque that reads the alpha of an image whose Alpha Mode is None, as Cycles renders it", () => {
    expect(Math.max(...expected.cutoutAlpha)).toBeLessThan(1);
    for (const name of ["AlphaNone", "MixAlphaNone"]) {
      const shown = material(name);
      expect(scene.textures[shown.baseColorTexture?.texture ?? -1]?.name, name).toBe("cutout");
      expect(shown, name).toMatchObject({ alphaMode: "opaque", baseColorTexture: { alpha: "none" } });
      expect(shown.baseColor[3], name).toBe(1);
      expect(expected.rendered[name]?.[3], name).toBe(1);
      expect(notes(name), name).toBeUndefined();
    }
  });

  it("reads an Image Texture node without an image as black, with the alpha EEVEE renders for it", () => {
    expect(material("EmptyImageBase").baseColor).toEqual([0, 0, 0, 1]);
    expectNear(expected.renderedByEevee.EmptyImageBase ?? [], [0, 0, 0, 1], 4);
    const alpha = material("EmptyImageAlpha");
    const rendered = expected.renderedByEevee.EmptyImageAlpha?.[3];
    expect(rendered).toBe(version === "4.2" ? 0 : 1);
    expect(alpha.baseColor[3]).toBe(rendered);
    expect(alpha.alphaMode).toBe(version === "4.2" ? "hash" : "opaque");
    for (const name of ["EmptyImageBase", "EmptyImageAlpha"]) expect(notes(name), name).toBeUndefined();
  });

  it("asks about the whole of an image one value of which reaches a color input, and a sample of one for roughness", async () => {
    const file = readBlendFile(await decompressBlend(readFixture("shading", version)));
    const candidates = grayCandidates(file, collectSceneObjects(file));
    const reads = new Map(candidates.map((candidate) => [idName(candidate.image), candidate.read]));
    expect(Object.fromEntries(reads)).toEqual({
      "gray.png": "sample",
      "cutout.png": "whole",
      "checker.png": "whole",
      PackedNoise: "whole",
      PackedGray: "whole",
      "tinted.png": "whole",
      "gray-data": "sample",
    });
  });

  it("notes a roughness image whose color shows in a sample of its first pixels, and reads no further", async () => {
    const roughness = async (coloredRow: number) => {
      const tinted = rgbPng(256, 4096, (_, y) => (y === coloredRow ? [255, 0, 0] : [128, 128, 128]));
      const imported = await importFixture("shading", version, (path) =>
        path.endsWith("gray.png") ? Promise.resolve({ path, bytes: tinted }) : findInFixtures(path),
      );
      const note = imported.source.warnings.find(
        (warning) => warning.code === "material-approximated" && warning.subject.name === "SrgbRoughness",
      );
      return note?.detail;
    };
    expect(await roughness(0)).toBe("Roughness comes from the brightness of gray.png, shown as its green channel");
    expect(await roughness(4095)).toBeUndefined();
  });

  it("draws transparency blended under the Blended render method, and dithered under the Dithered one every other material keeps", () => {
    expect(expected.renderMethods).toEqual({ AlphaBlended: "BLENDED", AlphaDithered: "DITHERED" });
    const transparent = scene.materials.filter((shown) => shown.alphaMode === "hash" || shown.alphaMode === "blend");
    expect(transparent.length).toBeGreaterThan(2);
    expect(transparent.filter((shown) => shown.alphaMode === "blend").map((shown) => shown.name)).toEqual([
      "AlphaBlended",
    ]);
    expect(material("AlphaDithered").alphaMode).toBe("hash");
    for (const name of ["AlphaBlended", "AlphaDithered"]) {
      expect(material(name).baseColor[3], name).toBe(0.5);
      expect(notes(name), name).toBeUndefined();
    }
  });

  it("keeps how a material would sample an image it cannot find, so that a texture chosen for it samples the same way", async () => {
    const hidden = await importFixture("shading", version, (path) =>
      path.endsWith("checker.png") ? Promise.resolve(null) : findInFixtures(path),
    );
    for (const name of ["CheckerBase", "MappingPoint", "MappingChain", "MappingMuted"]) {
      const found = material(name).baseColorTexture;
      if (!found) throw new RangeError(`No texture for ${name}.`);
      const { texture: _, ...sampling } = found;
      const missing = hidden.materials.find((candidate) => candidate.name === name);
      expect(missing?.baseColorTexture, name).toBeNull();
      expect(missing?.missingTextures?.baseColor, name).toBe("textures/checker.png");
      expect(missing?.missingTextureSampling?.baseColor, name).toEqual(sampling);
    }
    expect(material("MappingMuted").baseColorTexture?.uvSet).toBe(1);
    expect(material("MappingPoint").baseColorTexture?.transform).not.toBeNull();
  });

  it("reads a packed image's factors only from 0 to 1, and leaves a missing one out", () => {
    const doubled = material("PackedDoubled");
    expect(scene.textures[doubled.metallicRoughnessTexture?.texture ?? -1]?.name).toBe("orm");
    expect([doubled.metallic, doubled.roughness]).toEqual([1, 1]);
    expect(material("PackedMissing")).toMatchObject({ metallicRoughnessTexture: null, metallic: 0, roughness: 0.5 });
  });

  it("warns about what it reads differently from Blender", () => {
    const approximated = scene.source.warnings.filter((warning) => warning.code === "material-approximated");
    expect(approximated.map((warning) => [warning.subject.name, warning.detail])).toEqual([
      ["MappingSheared", "checker.png's Mapping shears it, which the preview leaves out"],
      ["MappingDriven", "checker.png's Mapping takes its scale from Noise Texture, shown without the Mapping"],
      ["AddClear", "Add Shader adds a Transparent BSDF, which the preview leaves out"],
      ["Toon", "Emission takes its color from Shader to RGB, shown as the shader it reads"],
      ["AlphaElsewhere", "Alpha comes from orm.png, which the preview leaves out"],
      ["RoughFromAlpha", "Roughness comes from the alpha of orm.png, which the preview leaves out"],
      ["RerouteSeparate", "Roughness comes from the Red channel of orm.png, which the preview leaves out"],
      ["HsvSeparate", "Roughness comes from the Saturation channel of orm.png, which the preview leaves out"],
      ["Closest", "checker.png uses Closest interpolation, shown Linear"],
      ["Sequence", `sequence is an image sequence, shown as it is at frame ${startFrame}`],
      ["VolumeOnly", "Its volume comes from Principled Volume, which the preview leaves out"],
      ["MappingNoVector", "checker.png's Mapping has no vector input, shown with the UV map"],
      ["AlphaDoubled", "Alpha passes cutout.png's alpha through Math, which the preview leaves out"],
      ["MixAlphaOtherNode", "Alpha comes from cutout.png, which the preview leaves out"],
      ["RoughMathSeparate", "Roughness comes from the Red channel of orm.png, which the preview leaves out"],
      ["FloatMixLeftover", "Roughness comes from Mix, shown at the value set on the input"],
      ["NormalStrengthDriven", "Normal map strength comes from Noise Texture, shown at the value set on the input"],
      ["MappingLong", "checker.png's vector passes 16 Mapping nodes or more, shown with the UV map"],
      ["GlossyRoughDriven", "Roughness comes from Noise Texture, shown at the value set on the input"],
      ["ClipAtZero", "cutout.png uses Closest interpolation, shown Linear"],
      ["ClipNegativeFactor", "Alpha comes from cutout.png, which the preview leaves out"],
      ["MixClipTranslucent", "Alpha is 0.6 inside the cutout, shown opaque"],
      ["AlphaRead", "Roughness comes from the alpha of cutout.png, which the preview leaves out"],
      ["VeilRead", "Roughness comes from the alpha of veil.png, which the preview leaves out"],
      ["BaseFromRed", "Base color comes from the Red channel of cutout.png, which the preview leaves out"],
      ["BaseFromBrightness", "Base color comes from the brightness of cutout.png, which the preview leaves out"],
      ["BaseMixedByAlpha", "Base color passes cutout.png through Mix, which the preview leaves out"],
      ["EmissionFromAlpha", "Emission comes from the alpha of cutout.png, which the preview leaves out"],
      [
        "PackedDoubled",
        "Roughness passes orm.png through Math, which the preview leaves out; " +
          "Metallic passes orm.png through Math.001, which the preview leaves out",
      ],
      ["Holdout", "Holdout hides what is behind it too, shown see-through"],
      ["NoiseSurface", "Its surface emits the output of Noise Texture, which the preview leaves out"],
      ["ToonSurface", "Its surface takes its color from Shader to RGB, shown as the shader it reads"],
      ["MixClearAddGlow", "Add Shader adds a Transparent BSDF, which the preview leaves out"],
      ["CyclesOnly", "Its output is for Cycles only, shown black as EEVEE renders it"],
      [
        "VeilPremulRead",
        "Roughness comes from the alpha of premultiplied.png, which the preview leaves out; " +
          "premultiplied.png has premultiplied alpha, shown as straight",
      ],
      ["ClipThenMix", "Alpha is 0.5 inside the cutout, shown opaque"],
      [
        "BaseRedThroughMath",
        "Base color comes from the Red channel of cutout.png through Math, which the preview leaves out",
      ],
      [
        "BaseAlphaThroughMath",
        "Base color comes from the alpha of cutout.png through Math, which the preview leaves out",
      ],
      [
        "BaseAlphaThroughRamp",
        "Base color comes from the alpha of cutout.png through Color Ramp, which the preview leaves out",
      ],
      [
        "BaseRedThroughRamp",
        "Base color comes from the Red channel of cutout.png through Color Ramp, which the preview leaves out",
      ],
      [
        "BaseRedThroughMix",
        "Base color comes from the Red channel of cutout.png through Mix, which the preview leaves out",
      ],
      [
        "BaseBrightnessThroughRamp",
        "Base color comes from the brightness of cutout.png through Color Ramp, which the preview leaves out",
      ],
      ["BaseMixedByOtherAlpha", "Base color passes checker.png through Mix, which the preview leaves out"],
      ["GrayThroughRamp", "Base color passes checker.png through Color Ramp, which the preview leaves out"],
      ["GrayRedThroughRamp", "Base color passes checker.png through Color Ramp, which the preview leaves out"],
      [
        "GrayHueThroughRamp",
        "Base color comes from the Hue channel of checker.png through Color Ramp, which the preview leaves out",
      ],
      ["GrayRampEmission", "Emission passes checker.png through Color Ramp, which the preview leaves out"],
      [
        "EmissionRedThroughRamp",
        "Emission comes from the Red channel of cutout.png through Color Ramp, which the preview leaves out",
      ],
      [
        "EmissionShaderRedThroughRamp",
        "Emission comes from the Red channel of cutout.png through Color Ramp, which the preview leaves out",
      ],
      [
        "SurfaceRedThroughRamp",
        "Emission comes from the Red channel of cutout.png through Color Ramp, which the preview leaves out",
      ],
      [
        "AttributeOther",
        "Base color comes from color attribute Tint of AttributeSharedPlane, which the preview leaves out",
      ],
      ["MixEmitter", "2 shaders mix, shown as Principled BSDF"],
      ["AddPrincipledGlow", "2 shaders mix, shown as Diffuse BSDF"],
      ["AddGlowOverImage", "Emission adds light the preview leaves out"],
      ["SpecularBase", "Its surface is Specular BSDF, shown as a plain shader of its color"],
      ["UdimBase", "udim is a UDIM tiled image, shown with its first tile"],
      ["SequenceOffset", `sequence-offset is an image sequence, shown as it is at frame ${startFrame}`],
      ["SequenceCyclic", `sequence-cyclic is an image sequence, shown as it is at frame ${startFrame}`],
      ...(version === "5.2"
        ? [
            ["MetallicBase", "Its surface is Metallic BSDF, shown as a plain shader of its color"],
            ["MetallicConductor", "Its surface is Metallic BSDF, shown as a plain shader of its color"],
          ]
        : []),
      ["PackedChannel", "Base color comes from the Red channel of PackedNoise, which the preview leaves out"],
      ["TintedRoughness", "Roughness comes from the brightness of tinted.png, shown as its green channel"],
      ["TintedMetallic", "Metallic comes from the brightness of tinted.png, shown as its blue channel"],
      ["TintedBwRoughness", "Roughness comes from the brightness of tinted.png, shown as its green channel"],
      ["TintedRedBase", "Base color comes from the Red channel of tinted.png, which the preview leaves out"],
    ]);
    const roughness = (name: string) => material(name).roughnessTexture;
    for (const name of ["RoughFromAlpha", "RerouteSeparate", "HsvSeparate", "RoughMathSeparate", "FloatMixLeftover"]) {
      expect(roughness(name), name).toBeNull();
    }
    expect(scene.textures[roughness("SeparateXyzGreen")?.texture ?? -1]?.name).toBe("orm");
    for (const name of [
      "BaseFromRed",
      "BaseFromBrightness",
      "EmissionFromAlpha",
      "BaseRedThroughMath",
      "BaseAlphaThroughMath",
      "BaseAlphaThroughRamp",
    ]) {
      expect(material(name), name).toMatchObject({ baseColorTexture: null, emissiveTexture: null });
    }
    expectNear(material("BaseFromRed").baseColor, [0.8, 0.8, 0.8, 1], 4);
    expect(scene.textures[material("BaseMixedByAlpha").baseColorTexture?.texture ?? -1]?.name).toBe("cutout");
  });

  it("leaves out an image that reaches a color input only as one value, and shows one whose color does", () => {
    for (const name of ["BaseRedThroughRamp", "BaseRedThroughMix", "BaseBrightnessThroughRamp"]) {
      expect(material(name).baseColorTexture, name).toBeNull();
    }
    const [red = 0] = baked("BaseFromRed").base;
    expectNear(baked("BaseRedThroughRamp").base, [red, red, red], 4);
    expectNear(baked("BaseRedThroughMix").base, [red / 2, red / 2, (red + 1) / 2], 4);
    expectNear(baked("BaseBrightnessThroughRamp").base, baked("BaseFromBrightness").base, 4);
    expect(scene.textures[material("BaseMixedByOtherAlpha").baseColorTexture?.texture ?? -1]?.name).toBe("checker");
    const [alpha = 0] = baked("BaseAlphaThroughRamp").base;
    const mixed = baked("CheckerBase").base.map((channel) => channel * (1 - alpha) + alpha);
    expectNear(baked("BaseMixedByOtherAlpha").base, mixed, 4);
  });

  it("copies a packed image only to make a texture of it, and checks whether it is gray without a copy", async () => {
    const { PackedNoise: noise, PackedGray: gray } = expected.packedImages;
    if (!noise || !gray) throw new Error("No packed images.");
    expect([noise, gray].map((image) => [image.material, image.gray, image.bakedTexture])).toEqual([
      ["PackedChannel", false, true],
      ["PackedGrayChannel", true, true],
    ]);
    const slice = vi.spyOn(Uint8Array.prototype, "slice");
    let imported: Awaited<ReturnType<typeof importFixture>>;
    let copied: number[];
    try {
      imported = await importFixture("shading", version, findInFixtures);
      copied = slice.mock.results.flatMap((result) => (result.type === "return" ? [result.value.byteLength] : []));
    } finally {
      slice.mockRestore();
    }
    expect(copied.filter((length) => length === noise.packedSize)).toEqual([]);
    expect(copied.filter((length) => length === gray.packedSize)).toEqual([gray.packedSize]);
    const shown = (name: string) => imported.materials.find((candidate) => candidate.name === name);
    expect(shown("PackedChannel")?.baseColorTexture).toBeNull();
    expect(imported.textures[shown("PackedGrayChannel")?.baseColorTexture?.texture ?? -1]?.name).toBe("PackedGray");
  });

  it("shows an image whose every pixel is gray where its red channel or brightness reaches a color input", () => {
    const gray = baked("CheckerBase").base;
    for (const name of ["GrayThroughRamp", "GrayRedThroughRamp"]) {
      expect(scene.textures[material(name).baseColorTexture?.texture ?? -1]?.name, name).toBe("checker");
      expectNear(baked(name).base, gray, 4, name);
    }
    const glow = material("GrayRampEmission");
    expect(scene.textures[glow.emissiveTexture?.texture ?? -1]?.name).toBe("checker");
    expect(glow.emissive).toEqual([1, 1, 1]);
    expectNear(baked("GrayRampEmission").emission, gray, 4);
    expect(material("GrayHueThroughRamp").baseColorTexture).toBeNull();
    expectNear(baked("GrayHueThroughRamp").base, [0, 0, 0], 4);
  });

  it("multiplies the base color or the light by the color attribute a Color Attribute node reads, as Blender does", () => {
    for (const name of ["AttributeBase", "AttributeNamed", "AttributeFactor"]) {
      const { mesh, shown } = plane(name);
      const [colored] = shown;
      expect(colored?.vertexColors, name).toEqual({ baseColor: true, emissive: false });
      const color = firstColor(mesh).map((channel, index) => channel * (colored?.baseColor[index] ?? Number.NaN));
      expectNear(color, baked(name).base, 3, name);
      expect(notes(name), name).toBeUndefined();
    }
    for (const name of ["AttributeEmission", "AttributeSurface"]) {
      const { mesh, shown } = plane(name);
      const [colored] = shown;
      expect(colored?.vertexColors, name).toEqual({ baseColor: false, emissive: true });
      const light = firstColor(mesh).map((channel, index) => channel * (colored?.emissive[index] ?? Number.NaN));
      expectNear(light, baked(name).emission, 3, name);
      expect(notes(name), name).toBeUndefined();
    }
    const missing = plane("AttributeMissing").shown[0];
    expect(missing?.vertexColors).toBeUndefined();
    expectNear(missing?.baseColor.slice(0, 3) ?? [], baked("AttributeMissing").base, 4);
    const glowMissing = plane("AttributeGlowMissing").shown[0];
    expect(glowMissing?.vertexColors).toBeUndefined();
    expectNear(glowMissing?.emissive ?? [], baked("AttributeGlowMissing").emission, 4);
    const shared = plane("AttributeShared");
    expectNear(firstColor(shared.mesh), baked("AttributeBase").base, 4);
    expect(shared.shown.map((shown) => [shown?.name, shown?.vertexColors])).toEqual([
      ["AttributeShared", { baseColor: true, emissive: false }],
      ["AttributeOther", undefined],
    ]);
    const unused = plane("AttributeUnusedSlot");
    expectNear(firstColor(unused.mesh), baked("AttributeBase").base, 4);
    expect(unused.shown.map((shown) => [shown?.name, shown?.vertexColors])).toEqual([
      ["AttributeUnusedSlot", { baseColor: true, emissive: false }],
    ]);
    expect(plane("CheckerBase").shown[0]?.vertexColors).toBeUndefined();
  });

  it("adds the light of the Emission shaders and Principled BSDFs that Add and Mix shaders put over the surface", () => {
    for (const name of ["AddGlow", "AddGlowFirst", "MixGlow", "MixEmitter", "AddPrincipledGlow"]) {
      expectNear(material(name).emissive, baked(name).emission, 4, name);
    }
    for (const name of ["AddGlow", "AddGlowFirst", "MixGlow", "MixHalfEmpty", "AddPrincipledGlow", "AddImageGlow"]) {
      const shown = material(name);
      const diffuse = shown.baseColor.slice(0, 3).map((channel) => channel * (1 - shown.metallic));
      expectNear(diffuse, baked(name).base, 4, name);
    }
    for (const name of ["AddGlow", "AddGlowFirst", "MixGlow", "MixHalfEmpty", "AddImageGlow"]) {
      expect(notes(name), name).toBeUndefined();
    }
    const image = material("AddImageGlow");
    expect(scene.textures[image.emissiveTexture?.texture ?? -1]?.name).toBe("checker");
    expect(image.emissive).toEqual([1, 1, 1]);
    expectNear(baked("AddImageGlow").emission, baked("CheckerBase").base, 4);
    expect(scene.textures[material("AddGlowOverImage").emissiveTexture?.texture ?? -1]?.name).toBe("checker");
  });

  it("shows the Specular BSDF's base color as EEVEE renders it, and the Metallic BSDF's as a metal's", () => {
    expectNear(material("SpecularBase").baseColor.slice(0, 3), expected.albedo.SpecularBase, 2);
    expect(material("SpecularBase").metallic).toBe(0);
    if (version === "5.2") {
      expectNear(material("MetallicBase").baseColor.slice(0, 3), expected.eevee.MetallicBase, 4);
      expect(material("MetallicBase").metallic).toBe(1);
      expectNear(material("MetallicConductor").baseColor.slice(0, 3), expected.albedo.MetallicConductor ?? [], 3);
      expect(material("MetallicConductor").metallic).toBe(1);
    }
  });

  it("shows a UDIM image's first tile and the frame an image sequence shows at the scene's start frame, as Blender does there", async () => {
    const { bytes, set } = await shadingScene(version);
    set("sfra", expected.frame);
    set("cfra", expected.frame + 1);
    const started = await importBytes("shading.blend", bytes, findInFixtures);
    const found = (name: string) =>
      started.textures[materialIn(started, name).baseColorTexture?.texture ?? -1]?.foundPath ?? "";
    expect(found("UdimBase")).toBe("textures/udim.1001.png");
    const frames = ["Sequence", "SequenceOffset", "SequenceCyclic"].map(found);
    expect(new Set(frames).size).toBe(3);
    for (const name of ["UdimBase", "Sequence", "SequenceOffset", "SequenceCyclic"]) {
      expectNear(expected.files[found(name)]?.map(decodeSrgb) ?? [], baked(name).base, 4, name);
    }
  });

  it("gives no light where it leaves out the image an emission comes from", () => {
    const red = baked("BaseRedThroughRamp").base;
    for (const name of ["EmissionRedThroughRamp", "EmissionShaderRedThroughRamp", "SurfaceRedThroughRamp"]) {
      expect(material(name), name).toMatchObject({ emissiveTexture: null, emissive: [0, 0, 0] });
      expectNear(baked(name).emission, red, 4, name);
    }
    for (const name of ["EmissionShaderRedThroughRamp", "SurfaceRedThroughRamp"]) {
      expect(material(name).baseColor, name).toEqual([0, 0, 0, 1]);
      expectNear(baked(name).base, [0, 0, 0], 4, name);
    }
  });
});

/** A material whose surface is `build`'s shader, read as `readMaterial` reads it. */
function readTree(
  build: (tree: ShaderTree, output: number) => void,
  options: { material?: MaterialSpec; version?: string; isGray?: GrayCheck } = {},
): MaterialDraft {
  const tree = new ShaderTree();
  build(tree, tree.add(Nodes.output()));
  const material = tree.material(options.material, options.version);
  return readMaterial(material, material.file.version, options.isGray ?? (() => null), 1);
}

/** A Principled BSDF on the surface whose inputs read an Image Texture node's outputs, as `links` pairs them. */
function imagePrincipled(image: ImageSpec | null, links: readonly ["Color" | "Alpha", string][]) {
  return (tree: ShaderTree, output: number) => {
    const principled = tree.add(Nodes.principled());
    tree.link(principled, "BSDF", output, "Surface");
    const node = tree.add(Nodes.image(image ?? undefined));
    for (const [from, to] of links) tree.link(node, from, principled, to);
  };
}

/** Mix shaders `depth` deep, both inputs of each from the next, over `leaf`. */
function sharedMixes(tree: ShaderTree, output: number, depth: number, leaf: number, leafOutput: string): void {
  let above = output;
  let aboveInputs = ["Surface"];
  for (let level = 0; level < depth; level++) {
    const mix = tree.add(Nodes.mix(0.5, `Mix ${level}`));
    for (const input of aboveInputs) tree.link(mix, "Shader", above, input);
    above = mix;
    aboveInputs = ["Shader", "Shader_001"];
  }
  for (const input of aboveInputs) tree.link(leaf, leafOutput, above, input);
}

describe("a material read from its node tree", () => {
  it("reads a shader that many mix shaders share once, however many ways lead to it", () => {
    const list = vi.spyOn(BlendStruct.prototype, "list");
    const draft = readTree((tree, output) => {
      const emission = tree.add(Nodes.emission([1, 0.5, 0.25, 1]));
      let previous = tree.add(Nodes.math("Math 0"));
      for (let index = 1; index < 200; index++) {
        const math = tree.add(Nodes.math(`Math ${index}`));
        tree.link(previous, "Value", math, "Value");
        previous = math;
      }
      tree.link(previous, "Value", emission, "Color");
      sharedMixes(tree, output, 16, emission, "Emission");
    });
    expect(list.mock.calls.length).toBeLessThan(5_000);
    list.mockRestore();
    expect(draft.emissive).toEqual([1, 0.5, 0.25]);
    expect(draft.approximations).toEqual([
      "Color comes from Math 199 through more than 16 nodes, shown at the value set on the input",
    ]);
  });

  it("reads the nodes that many shaders share once, however many shaders read them", () => {
    const list = vi.spyOn(BlendStruct.prototype, "list");
    const draft = readTree((tree, output) => {
      let previous = tree.add(Nodes.math("Math 0"));
      for (let index = 1; index < 300; index++) {
        const math = tree.add(Nodes.math(`Math ${index}`));
        tree.link(previous, "Value", math, "Value");
        previous = math;
      }
      let above: [number, string][] = [[output, "Surface"]];
      for (let level = 0; level < 8; level++) {
        above = above.flatMap(([node, input]): [number, string][] => {
          const add = tree.add(Nodes.add(`Add ${level}`));
          tree.link(add, "Shader", node, input);
          return [
            [add, "Shader"],
            [add, "Shader_001"],
          ];
        });
      }
      for (const [index, [node, input]] of above.entries()) {
        const emission = tree.add(Nodes.emission());
        const own = tree.add(Nodes.math(`Own ${index}`));
        tree.link(previous, "Value", own, "Value");
        tree.link(own, "Value", emission, "Color");
        tree.link(emission, "Emission", node, input);
      }
    });
    expect(list.mock.calls.length).toBeLessThan(10_000);
    list.mockRestore();
    expect(draft.emissive).toEqual([256, 256, 256]);
  });

  it("adds the shares of every way to a shader, and reads a loop of mix shaders, as a damaged file has, as cut", () => {
    const shared = readTree((tree, output) => {
      const principled = tree.add(Nodes.principled([1, 0, 0, 1]));
      sharedMixes(tree, output, 1, principled, "BSDF");
    });
    expect(shared).toMatchObject({ baseColor: [1, 0, 0, 1], approximations: [] });
    const doubled = readTree((tree, output) => {
      const add = tree.add(Nodes.add());
      const emission = tree.add(Nodes.emission([0.5, 0.25, 0, 1]));
      tree.link(add, "Shader", output, "Surface");
      tree.link(emission, "Emission", add, "Shader");
      tree.link(emission, "Emission", add, "Shader_001");
    });
    expect(doubled.emissive).toEqual([1, 0.5, 0]);
    const looped = readTree((tree, output) => {
      const first = tree.add(Nodes.mix(0.5, "First"));
      const second = tree.add(Nodes.mix(0.5, "Second"));
      const principled = tree.add(Nodes.principled([0, 1, 0, 1]));
      tree.link(first, "Shader", output, "Surface");
      tree.link(second, "Shader", first, "Shader");
      tree.link(principled, "BSDF", first, "Shader_001");
      tree.link(first, "Shader", second, "Shader");
      tree.link(principled, "BSDF", second, "Shader_001");
    });
    expect(looped.baseColor).toEqual([0, 0.75, 0, 1]);
  });

  it("notes the shaders it leaves out past 16 nested mix shaders", () => {
    const nested = (depth: number) =>
      readTree((tree, output) => {
        const principled = tree.add(Nodes.principled([1, 0, 0, 1]));
        sharedMixes(tree, output, depth, principled, "BSDF");
      });
    expect(nested(16)).toMatchObject({ baseColor: [1, 0, 0, 1], approximations: [] });
    expect(nested(17)).toMatchObject({
      baseColor: [0, 0, 0, 1],
      approximations: ["Its surface nests shaders more than 16 deep, which the preview leaves out"],
    });
  });

  it("notes an input whose nodes it stops following before an image", () => {
    const chained = (length: number) =>
      readTree((tree, output) => {
        const principled = tree.add(Nodes.principled());
        tree.link(principled, "BSDF", output, "Surface");
        let previous = tree.add(Nodes.image({ name: "tex.png" }));
        let previousOutput = "Color";
        for (let index = 0; index < length; index++) {
          const math = tree.add(Nodes.math(`Math ${index}`));
          tree.link(previous, previousOutput, math, "Value");
          previous = math;
          previousOutput = "Value";
        }
        tree.link(previous, previousOutput, principled, "Roughness");
      });
    const followed = chained(16);
    expect(followed.roughnessImage?.image.string("name")).toBe("//tex.png");
    expect(followed.approximations.some((note) => note.includes("more than"))).toBe(false);
    expect(chained(17)).toMatchObject({
      roughnessImage: null,
      approximations: ["Roughness comes from Math 16 through more than 16 nodes, shown at the value set on the input"],
    });
  });

  it("shows an Image Texture node without an image black, and its alpha as the file's Blender version does", () => {
    const empty = (version: string) =>
      readTree(
        imagePrincipled(null, [
          ["Color", "Base Color"],
          ["Alpha", "Alpha"],
        ]),
        { version },
      );
    expect(empty("402")).toMatchObject({
      baseColor: [0, 0, 0, 0],
      baseColorImage: null,
      alphaMode: "hash",
      approximations: [],
    });
    expect(empty("0502")).toMatchObject({ baseColor: [0, 0, 0, 1], alphaMode: "opaque", approximations: [] });
  });

  it("keeps an image opaque whose Alpha Mode is None, unless it holds data", () => {
    const links: ["Color" | "Alpha", string][] = [
      ["Color", "Base Color"],
      ["Alpha", "Alpha"],
    ];
    const ignored = readTree(imagePrincipled({ name: "cutout.png", alphaMode: 3 }, links));
    expect(ignored).toMatchObject({ alphaMode: "opaque", baseColorImage: { alpha: "none" } });
    expect(ignored.baseColor[3]).toBe(1);
    const data = readTree(imagePrincipled({ name: "cutout.png", alphaMode: 3, colorSpace: "Non-Color" }, links));
    expect(data).toMatchObject({ alphaMode: "hash", baseColorImage: { alpha: "opacity" } });
    const mixed = readTree((tree, output) => {
      const mix = tree.add(Nodes.mix());
      const clear = tree.add(Nodes.transparent());
      const principled = tree.add(Nodes.principled());
      const image = tree.add(Nodes.image({ name: "cutout.png", alphaMode: 3 }));
      tree.link(mix, "Shader", output, "Surface");
      tree.link(image, "Alpha", mix, "Fac");
      tree.link(clear, "BSDF", mix, "Shader");
      tree.link(principled, "BSDF", mix, "Shader_001");
      tree.link(image, "Color", principled, "Base Color");
    });
    expect(mixed).toMatchObject({ alphaMode: "opaque", approximations: [] });
    expect(mixed.baseColor[3]).toBe(1);
  });

  it("notes a roughness or metallic image a sample shows is not gray, whose brightness Blender reads", () => {
    const rough = (isGray: GrayCheck) =>
      readTree(imagePrincipled({ name: "tinted.png", colorSpace: "Non-Color" }, [["Color", "Roughness"]]), { isGray });
    const reads: GrayRead[] = [];
    rough((_, read) => {
      reads.push(read);
      return null;
    });
    expect(reads).toEqual(["sample"]);
    expect(rough(() => false)).toMatchObject({
      roughnessImage: { colorSpace: "linear" },
      approximations: ["Roughness comes from the brightness of tinted.png, shown as its green channel"],
    });
    for (const known of [true, null]) {
      expect(
        rough(() => known),
        String(known),
      ).toMatchObject({ roughnessImage: { colorSpace: "linear" }, approximations: [] });
    }
    const metal = readTree(imagePrincipled({ name: "tinted.png" }, [["Color", "Metallic"]]), { isGray: () => false });
    expect(metal.approximations).toEqual([
      "Metallic comes from the brightness of tinted.png, shown as its blue channel",
    ]);
  });

  it("decodes an image in its color space, noting a space the preview shows with other primaries or curve", () => {
    const decoded = (colorSpace: string, input: string) =>
      readTree(imagePrincipled({ name: "tex.png", colorSpace }, [["Color", input]]));
    const cases: [space: string, input: string, decoding: string | null, note: string | null][] = [
      ["sRGB", "Base Color", "srgb", null],
      ["Non-Color", "Base Color", "linear", null],
      ["Linear Rec.709", "Base Color", "linear", null],
      ["Linear Rec.2020", "Base Color", "linear", "tex.png is Linear Rec.2020, shown as Linear Rec.709"],
      ["Display P3", "Base Color", "srgb", "tex.png is Display P3, shown as sRGB"],
      ["Filmic sRGB", "Base Color", null, "tex.png is Filmic sRGB, shown as sRGB"],
      ["sRGB", "Roughness", "srgb", null],
      ["Linear Rec.2020", "Roughness", "linear", null],
      ["AgX Log", "Roughness", null, "tex.png is AgX Log, shown as Non-Color"],
    ];
    for (const [space, input, decoding, note] of cases) {
      const draft = decoded(space, input);
      const use = draft.baseColorImage ?? draft.roughnessImage;
      expect(use?.colorSpace, `${space} into ${input}`).toBe(decoding);
      expect(draft.approximations, `${space} into ${input}`).toEqual(note ? [note] : []);
    }
  });

  it("draws transparency hashed where Blender dithers it, and blended where Blender blends it", () => {
    const halfClear = (material: MaterialSpec, version?: string) =>
      readTree(
        (tree, output) => {
          const principled = tree.add(Nodes.principled([0.8, 0.8, 0.8, 1], 0.5));
          tree.link(principled, "BSDF", output, "Surface");
        },
        version === undefined ? { material } : { material, version },
      ).alphaMode;
    expect(halfClear({ renderMethod: 0, blendMethod: 5 })).toBe("hash");
    expect(halfClear({ renderMethod: 1, blendMethod: 4 })).toBe("blend");
    expect(halfClear({ renderMethod: 0, blendMethod: 4 }, "401")).toBe("hash");
    expect(halfClear({ renderMethod: 0, blendMethod: 5 }, "401")).toBe("blend");
    expect(halfClear({ renderMethod: 0, blendMethod: 3 }, "401")).toBe("mask");
  });

  it("shows a material before Blender 5.0 by its own color where Use Nodes is off, and by its nodes from 5.0 on", () => {
    const nodeless = (useNodes: boolean, version: string) =>
      readTree(
        (tree, output) => {
          const principled = tree.add(Nodes.principled([1, 0, 0, 1]));
          tree.link(principled, "BSDF", output, "Surface");
        },
        { material: { color: [0, 1, 0], useNodes }, version },
      ).baseColor;
    expect(nodeless(false, "402")).toEqual([0, 1, 0, 1]);
    expect(nodeless(true, "402")).toEqual([1, 0, 0, 1]);
    expect(nodeless(false, "0500")).toEqual([1, 0, 0, 1]);
  });
});
