import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repo = fileURLToPath(new URL("..", import.meta.url));
const branding = join(repo, "assets", "branding");
const source = join(branding, "arcue-master.png");
const png = join(branding, "png");
await mkdir(png, { recursive: true });

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 180, 192, 256, 512, 1024];
const images = new Map();
for (const size of sizes) {
  const image = await sharp(source).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
  images.set(size, image);
  await writeFile(join(png, `arcue-${size}.png`), image);
}
await writeFile(join(branding, "arcue.png"), images.get(1024));

const corner = Math.round(128 * 0.225);
const roundedMask = Buffer.from(`<svg width="128" height="128"><rect width="128" height="128" rx="${corner}"/></svg>`);
await sharp(images.get(128))
  .composite([{ input: roundedMask, blend: "dest-in" }])
  .png()
  .toFile(join(png, "arcue-rounded-128.png"));
await sharp(source).resize(1024, 1024).webp({ lossless: true }).toFile(join(branding, "arcue.webp"));

function ico(iconSizes) {
  const header = Buffer.alloc(6 + iconSizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(iconSizes.length, 4);
  let offset = header.length;
  const payloads = iconSizes.map((size, index) => {
    const image = images.get(size);
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
    return image;
  });
  return Buffer.concat([header, ...payloads]);
}

await writeFile(join(branding, "arcue.ico"), ico([16, 20, 24, 32, 40, 48, 64, 128, 256]));
const favicon = ico([16, 32, 48]);
await writeFile(join(branding, "favicon.ico"), favicon);

const representations = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];
const chunks = representations.map(([type, size]) => {
  const image = images.get(size);
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32BE(image.length + 8, 4);
  return Buffer.concat([header, image]);
});
const header = Buffer.alloc(8);
header.write("icns", 0, 4, "ascii");
header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
await writeFile(join(branding, "arcue.icns"), Buffer.concat([header, ...chunks]));

const web = join(repo, "apps", "web", "public");
await mkdir(web, { recursive: true });
await writeFile(join(web, "favicon.ico"), favicon);
await writeFile(join(web, "apple-touch-icon.png"), images.get(180));
await writeFile(join(web, "icon-192.png"), images.get(192));
await writeFile(join(web, "icon-512.png"), images.get(512));
console.log("Generated PNG, WebP, ICO, ICNS, and web icons from assets/branding/arcue-master.png.");
