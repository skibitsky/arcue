import type { SceneDescription } from "@arcue/scene";
import type { Viewport } from "../src/index";
import { decodePng, luminanceAt } from "./pixels";

export interface TextureAgreement {
  samples: number;
  /** Pearson correlation between texel brightness at each triangle's UV and the lit-to-clay brightness on screen. */
  correlation: number;
}

/**
 * Checks that a textured mesh shows its texture the right way up. For visible triangles of the first mesh, it reads
 * the base color texture at the triangle's UV center, taking v as pointing up, and the view's brightness at the
 * triangle's center in lit mode divided by clay mode, which cancels the lighting. The two agree when the UVs and the
 * image meet as the file intends.
 */
export async function textureAgreement(viewport: Viewport, scene: SceneDescription): Promise<TextureAgreement> {
  const mesh = scene.meshes[0];
  const node = scene.nodes.find((candidate) => candidate.mesh === 0);
  const ref = scene.materials[mesh?.groups[0]?.material ?? 0]?.baseColorTexture;
  const texture = ref ? scene.textures[ref.texture] : undefined;
  const uvs = mesh?.uvs[ref?.uvSet ?? 0]?.values;
  if (!mesh || !node || !texture || !uvs) return { samples: 0, correlation: 0 };
  const image = await decodePng(texture.bytes);
  const container = document.getElementById("view");
  const width = container?.clientWidth ?? 1;
  const height = container?.clientHeight ?? 1;
  const camera = viewport.getCamera();
  viewport.setDisplayMode("lit");
  const lit = await decodePng(await viewport.screenshot({ width, height, camera }));
  viewport.setDisplayMode("clay");
  const clay = await decodePng(await viewport.screenshot({ width, height, camera }));
  viewport.setDisplayMode("lit");

  const texels: number[] = [];
  const albedo: number[] = [];
  const triangles = mesh.indices.length / 3;
  const step = Math.max(1, Math.floor(triangles / 1500));
  for (let triangle = 0; triangle < triangles; triangle += step) {
    const corners = [0, 1, 2].map((k) => mesh.indices[triangle * 3 + k] ?? 0);
    const anchor = {
      kind: "surface" as const,
      mesh: node.path,
      vertices: corners.map((corner) => mesh.sourceVertex[corner] ?? 0) as [number, number, number],
      weights: [1 / 3, 1 / 3, 1 / 3] as [number, number, number],
    };
    const position = viewport.screenPosition(anchor);
    if (!position?.visible) continue;
    const u = corners.reduce((sum, corner) => sum + (uvs[corner * 2] ?? 0), 0) / 3;
    const v = corners.reduce((sum, corner) => sum + (uvs[corner * 2 + 1] ?? 0), 0) / 3;
    const shaded = luminanceAt(clay, position.x, position.y);
    if (shaded < 8) continue;
    texels.push(luminanceAt(image, u * image.width, (1 - v) * image.height));
    albedo.push(luminanceAt(lit, position.x, position.y) / shaded);
  }
  return { samples: texels.length, correlation: pearson(texels, albedo) };
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / n;
  const ma = mean(a);
  const mb = mean(b);
  let covariance = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = (a[i] ?? 0) - ma;
    const db = (b[i] ?? 0) - mb;
    covariance += da * db;
    va += da * da;
    vb += db * db;
  }
  return va > 0 && vb > 0 ? covariance / Math.sqrt(va * vb) : 0;
}
