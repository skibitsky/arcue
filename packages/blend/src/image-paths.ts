/**
 * The path of one tile of a UDIM image, from the <UDIM> or <UVTILE> token that Blender keeps in the image's path. A
 * path without a token is the tile's own.
 */
export function tilePath(path: string, tile: number): string {
  const u = ((tile - 1001) % 10) + 1;
  const v = Math.floor((tile - 1001) / 10) + 1;
  if (path.includes("<UDIM>")) return path.replace("<UDIM>", String(tile));
  return path.replace("<UVTILE>", `u${u}_v${v}`);
}

/**
 * Blender's `BLI_path_sequence_decode` and `BLI_path_sequence_encode`: the path of one frame of an image sequence. The
 * last number in the file name, before its extension, becomes the frame, padded with zeros to as many digits; a name
 * without a number gets the frame before its extension.
 */
export function sequencePath(path: string, frame: number): string {
  const start = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
  const name = path.slice(start);
  const dot = name.lastIndexOf(".");
  const end = dot > 0 && /[^.]/.test(name.slice(0, dot)) ? start + dot : path.length;
  const shown = Math.max(0, Math.trunc(frame));
  const digits = /(\d+)\D*$/.exec(path.slice(start, end));
  const number = digits?.[1];
  if (!digits || number === undefined) return `${path.slice(0, end)}${shown === 0 ? "" : shown}${path.slice(end)}`;
  const from = start + digits.index;
  return `${path.slice(0, from)}${String(shown).padStart(number.length, "0")}${path.slice(from + number.length)}`;
}
