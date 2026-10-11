import type { BlendFile, BlendStruct } from "./file";

/** The ID header of a datablock struct, which every datablock starts with. */
export function idOf(datablock: BlendStruct): BlendStruct | null {
  return datablock.typeName === "ID" ? datablock : datablock.struct("id");
}

/** A datablock's name without the two-letter type prefix Blender stores, such as "Cube" for "OBCube". */
export function idName(datablock: BlendStruct | null): string {
  if (!datablock) return "";
  return (idOf(datablock)?.string("name") ?? "").slice(2);
}

/** Whether the datablock comes from another .blend file, which this one only links. */
export function isLinked(datablock: BlendStruct): boolean {
  return (idOf(datablock)?.pointer("lib") ?? 0n) !== 0n;
}

/** The first struct of every block with `code`, such as every object for "OB". */
export function datablocks(file: BlendFile, code: string): BlendStruct[] {
  return file.blocksWithCode(code).flatMap((block) => {
    const first = file.first(block);
    return first ? [first] : [];
  });
}

/** Datablocks with `code` that come from other files, which Blender writes as bare ID placeholders. */
export function linkedDatablocks(file: BlendFile, code: string): BlendStruct[] {
  const placeholders = datablocks(file, "ID").filter((id) => (idOf(id)?.string("name") ?? "").startsWith(code));
  return [...datablocks(file, code).filter(isLinked), ...placeholders];
}
