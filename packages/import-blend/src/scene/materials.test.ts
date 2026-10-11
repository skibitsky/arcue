import { readFileSync } from "node:fs";
import type { Material, UvTransform } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { findInFixtures, fixturesDir, importFixture, VERSIONS } from "../../test/fixtures";

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
  /** The color and alpha Cycles renders over a transparent film at the middle of surfaces a bake cannot show. */
  rendered: Record<string, number[]>;
  /** The same for EEVEE, for materials that glow with veil.png. */
  renderedByEevee: Record<string, number[]>;
  /** The color and alpha of each texel of veil.png, as its file stores them. */
  veil: number[];
  /** The color and alpha of each texel of premultiplied.png, as its file stores them. */
  premultiplied: number[];
  /** The base color of the shader EEVEE's output shows. */
  eevee: Record<string, number[]>;
}

function shadingReference(version: string): ShadingReference {
  return JSON.parse(readFileSync(`${fixturesDir}shading-${version}.json`, "utf8"));
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
  const material = (name: string): Material => {
    const found = scene.materials.find((candidate) => candidate.name === name);
    if (!found) throw new RangeError(`No material ${name}.`);
    return found;
  };
  const baked = (name: string) => {
    const found = expected.baked[name];
    if (!found) throw new RangeError(`No baked values for ${name}.`);
    return found;
  };
  const notes = (name: string) =>
    scene.source.warnings.find((warning) => warning.code === "material-approximated" && warning.subject.name === name)
      ?.detail;

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
      expect(material(name).alphaMode, name).toBe("blend");
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
    expect(scaled.alphaMode).toBe("blend");
    expectNear(
      expected.cutoutAlpha.map((alpha) => alpha * scaled.baseColor[3]),
      expected.clipped.AlphaFactor,
      2,
    );
    expect(material("MixByAlpha")).toMatchObject({ alphaMode: "blend", baseColor: [1, 1, 1, 1] });
    expect(material("AlphaDoubled")).toMatchObject({ alphaMode: "blend", baseColor: [1, 1, 1, 1] });
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
    expect(material("AlphaUnused")).toMatchObject({ alphaMode: "blend", baseColorTexture: { alpha: "premultiply" } });
    expect(material("AlphaUnused").baseColor[3]).toBeCloseTo(0.6);
    expect(material("CheckerBase").baseColorTexture?.alpha).toBe("premultiply");
    for (const name of ["AlphaRead", "NonColorBase", "ClipKeepsAll", "PackedAlphaBase"]) {
      expect(material(name).baseColorTexture?.alpha, name).toBe("none");
    }
    for (const name of ["MixByAlpha", "AlphaFactor", "ClipBelow", "AlphaDoubled", "MixShaderClip"]) {
      expect(material(name).baseColorTexture?.alpha, name).toBeUndefined();
    }
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
      ["NonColorBase", "data.png is Non-Color, shown as sRGB"],
      ["SrgbRoughness", "gray.png is sRGB, shown as Non-Color"],
      ["Closest", "checker.png uses Closest interpolation, shown Linear"],
      ["Sequence", "sequence is an image sequence, which the preview leaves out"],
      ["VolumeOnly", "Its volume comes from Principled Volume, which the preview leaves out"],
      ["MappingNoVector", "checker.png's Mapping has no vector input, shown with the UV map"],
      ["AlphaDoubled", "Alpha passes cutout.png's alpha through Math, which the preview leaves out"],
      ["MixAlphaOtherNode", "Alpha comes from cutout.png, which the preview leaves out"],
      ["RoughMathSeparate", "Roughness comes from the Red channel of orm.png, which the preview leaves out"],
      ["FloatMixLeftover", "Roughness comes from Mix, shown at the value set on the input"],
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
