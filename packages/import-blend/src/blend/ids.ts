import type { BlendFile, BlendStruct } from "./file";

/** `Library.flag`: the library holds data-blocks packed into this file, as Blender 5 packs linked data. */
const LIBRARY_ARCHIVE = 1 << 0;
/** `ID.flag`: the linked data-block is packed into this file. */
const ID_LINKED_AND_PACKED = 0x8000;

/** The ID header of a datablock struct, which every datablock starts with. */
export function idOf(datablock: BlendStruct): BlendStruct | null {
  return datablock.typeName === "ID" ? datablock : datablock.struct("id");
}

/** A datablock's name without the two-letter type prefix Blender stores, such as "Cube" for "OBCube". */
export function idName(datablock: BlendStruct | null): string {
  if (!datablock) return "";
  return (idOf(datablock)?.string("name") ?? "").slice(2);
}

/**
 * Whether the datablock comes from another .blend file, which this one only links. Data that Blender 5 packs into this
 * file with its library is this file's own: the file holds all of it.
 */
export function isLinked(datablock: BlendStruct): boolean {
  const id = idOf(datablock);
  if (!id || id.pointer("lib") === 0n) return false;
  if (datablock.typeName === "ID") return true;
  if ((id.number("flag") & ID_LINKED_AND_PACKED) !== 0) return false;
  return ((id.deref("lib")?.number("flag") ?? 0) & LIBRARY_ARCHIVE) === 0;
}

/**
 * Whether a linked datablock's library is a whole .blend file packed into this one, as Pack Linked Libraries leaves it.
 * Arcue does not read such a file.
 */
export function isInPackedLibrary(datablock: BlendStruct): boolean {
  return (idOf(datablock)?.deref("lib")?.pointer("packedfile") ?? 0n) !== 0n;
}

/** The first struct of every block with `code`, such as every object for "OB". */
export function datablocks(file: BlendFile, code: string): BlendStruct[] {
  return file.blocksWithCode(code).flatMap((block) => {
    const first = file.first(block);
    return first ? [first] : [];
  });
}
