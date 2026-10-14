import type { BlendFile, BlendStruct } from "./file";

/**
 * The structs of a ListBase member that `seen` does not hold, by struct offset, each added to it. The walk stops at the
 * first struct `seen` holds: Blender writes each struct in one list only, so lists that share structs take no longer
 * to read than the structs they hold.
 */
export function unseenList(owner: BlendStruct, name: string, seen: Set<number>): BlendStruct[] {
  const base = owner.struct(name);
  const items: BlendStruct[] = [];
  if (!base) return items;
  let from = base;
  for (let address = base.pointer("first"); address !== 0n; address = from.file.pointerAt(from.offset)) {
    const item = from.file.first(from.resolve(address));
    if (!item || item.type.size < item.file.pointerSize || seen.has(item.offset)) break;
    seen.add(item.offset);
    items.push(item);
    from = item;
  }
  return items;
}

/**
 * Reads the ListBase member `name` of each owner once, by the owner's offset, as `unseenList` reads it with one `seen`
 * for every owner. An owner read again gets the list it got the first time.
 */
export function ownedLists(name: string): (owner: BlendStruct) => readonly BlendStruct[] {
  const lists = new Map<number, readonly BlendStruct[]>();
  const seen = new Set<number>();
  return (owner) => {
    let items = lists.get(owner.offset);
    if (!items) {
      items = unseenList(owner, name, seen);
      lists.set(owner.offset, items);
    }
    return items;
  };
}

const fileLists = new WeakMap<BlendFile, Map<string, (owner: BlendStruct) => readonly BlendStruct[]>>();

/** The owner's ListBase member `name`, read as `ownedLists(name)` reads it, with one reader for each file and name. */
export function ownedList(owner: BlendStruct, name: string): readonly BlendStruct[] {
  let byName = fileLists.get(owner.file);
  if (!byName) {
    byName = new Map();
    fileLists.set(owner.file, byName);
  }
  let listOf = byName.get(name);
  if (!listOf) {
    listOf = ownedLists(name);
    byName.set(name, listOf);
  }
  return listOf(owner);
}
