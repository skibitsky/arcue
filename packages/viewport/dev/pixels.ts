const CHANGED = 24;

/** Decodes PNG bytes, or PNG bytes in base64, into pixels. */
export async function decodePng(png: Uint8Array | string): Promise<ImageData> {
  const bytes = typeof png === "string" ? Uint8Array.from(atob(png), (char) => char.charCodeAt(0)) : png;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const bitmap = await createImageBitmap(new Blob([copy], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D context.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function difference(a: Uint8ClampedArray, b: Uint8ClampedArray, pixel: number): number {
  const i = pixel * 4;
  return (
    Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
    Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
    Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0))
  );
}

function brightness(data: Uint8ClampedArray, pixel: number): number {
  const i = pixel * 4;
  return 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
}

/** Mean brightness of the 3 × 3 pixels around a point, clamped to the image. */
export function luminanceAt(image: ImageData, x: number, y: number): number {
  let total = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const px = Math.min(image.width - 1, Math.max(0, Math.floor(x) + dx));
      const py = Math.min(image.height - 1, Math.max(0, Math.floor(y) + dy));
      total += brightness(image.data, py * image.width + px);
    }
  }
  return total / 9;
}

/** Pixels that differ from the background image, so the model or its shadow covers them. */
export async function modelPixels(shot: string, background: string): Promise<number> {
  const image = await decodePng(shot);
  const empty = await decodePng(background);
  if (image.width !== empty.width || image.height !== empty.height) throw new Error("The images differ in size.");
  let count = 0;
  for (let pixel = 0; pixel < image.width * image.height; pixel++) {
    if (difference(image.data, empty.data, pixel) > CHANGED) count++;
  }
  return count;
}

/**
 * How much the surface color varies across the model: the coefficient of variation of the lit brightness divided by
 * the clay brightness, over pixels the clay model covers. Dividing by clay cancels the lighting, so an untextured
 * material scores near 0 and a texture scores by its contrast.
 */
export async function albedoSpread(lit: string, clay: string, background: string): Promise<number> {
  const litImage = await decodePng(lit);
  const clayImage = await decodePng(clay);
  const empty = await decodePng(background);
  const ratios: number[] = [];
  for (let pixel = 0; pixel < clayImage.width * clayImage.height; pixel++) {
    const shaded = brightness(clayImage.data, pixel);
    if (difference(clayImage.data, empty.data, pixel) <= CHANGED * 3 || shaded < 24) continue;
    ratios.push(brightness(litImage.data, pixel) / shaded);
  }
  if (ratios.length === 0) return 0;
  const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  const variance = ratios.reduce((sum, ratio) => sum + (ratio - mean) ** 2, 0) / ratios.length;
  return mean > 0 ? Math.sqrt(variance) / mean : 0;
}

/** The share of pixels, from 0 to 1, that differ between two screenshots of the same size. */
export async function changedShare(first: string, second: string): Promise<number> {
  const a = await decodePng(first);
  const b = await decodePng(second);
  if (a.width !== b.width || a.height !== b.height) throw new Error("The images differ in size.");
  const count = a.width * a.height;
  let changed = 0;
  for (let pixel = 0; pixel < count; pixel++) if (difference(a.data, b.data, pixel) > CHANGED) changed++;
  return changed / count;
}
