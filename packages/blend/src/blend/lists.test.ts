import { describe, expect, it } from "vitest";
import type { BlockDefinition } from "../../test/synthetic.js";
import { writeBlend } from "../../test/synthetic.js";
import type { BlendFile, BlendStruct } from "./file.js";
import { readBlendFile } from "./file.js";
import { ownedList, ownedLists, unseenList } from "./lists.js";

/** A file of owners at 0x100 and 0x110 with the lists of `heads`, and links at 0x400 on, each one's `next` in `links`. */
function fileWith(heads: readonly bigint[], links: readonly bigint[]): BlendFile {
  const bytes = writeBlend({
    header: "old",
    pointerSize: 8,
    little: true,
    structs: [
      {
        type: "ListBase",
        fields: [
          ["void", "*first"],
          ["void", "*last"],
        ],
      },
      {
        type: "Item",
        fields: [
          ["Item", "*next"],
          ["Item", "*prev"],
        ],
      },
      { type: "Owner", fields: [["ListBase", "items"]] },
    ],
    blocks: [
      ...heads.map(
        (first, index): BlockDefinition => ({
          code: "DATA",
          struct: "Owner",
          address: 0x100n + BigInt(index) * 0x10n,
          data: [{ items: { first, last: 0n } }],
        }),
      ),
      ...links.map(
        (next, index): BlockDefinition => ({
          code: "DATA",
          struct: "Item",
          address: 0x400n + BigInt(index) * 0x10n,
          data: [{ next }],
        }),
      ),
    ],
  });
  return readBlendFile(bytes);
}

function ownerAt(file: BlendFile, address: bigint): BlendStruct {
  const struct = file.first(file.block(address));
  if (!struct) throw new Error("No struct was written there.");
  return struct;
}

describe("unseenList", () => {
  it("reads a list in order and ends a later list at a struct an earlier list read", () => {
    const file = fileWith([0x400n, 0x430n], [0x410n, 0x420n, 0n, 0x410n]);
    const starts = [0x400n, 0x410n, 0x420n, 0x430n].map((address) => ownerAt(file, address).offset);
    const seen = new Set<number>();
    const first = unseenList(ownerAt(file, 0x100n), "items", seen);
    const second = unseenList(ownerAt(file, 0x110n), "items", seen);
    expect([first, second].map((list) => list.map((item) => starts.indexOf(item.offset)))).toEqual([[0, 1, 2], [3]]);
  });

  it("ends a list that links back into itself", () => {
    const file = fileWith([0x400n], [0x410n, 0x400n]);
    expect(unseenList(ownerAt(file, 0x100n), "items", new Set())).toHaveLength(2);
  });

  it("reads nothing for an owner without the list", () => {
    const file = fileWith([0x400n], [0n]);
    expect(unseenList(ownerAt(file, 0x100n), "missing", new Set())).toEqual([]);
  });
});

describe("ownedLists", () => {
  it("ends a later owner's list at a struct an earlier owner's list read", () => {
    const file = fileWith([0x400n, 0x410n], [0x410n, 0x420n, 0n]);
    const listOf = ownedLists("items");
    expect(listOf(ownerAt(file, 0x100n))).toHaveLength(3);
    expect(listOf(ownerAt(file, 0x110n))).toEqual([]);
  });

  it("gives an owner read again the list it got the first time", () => {
    const file = fileWith([0x400n], [0x410n, 0n]);
    const listOf = ownedLists("items");
    const first = listOf(ownerAt(file, 0x100n));
    expect(first).toHaveLength(2);
    expect(listOf(ownerAt(file, 0x100n))).toBe(first);
  });
});

describe("ownedList", () => {
  it("reads each owner's list once for every caller of one file, and apart for another file", () => {
    const file = fileWith([0x400n, 0x410n], [0x410n, 0x420n, 0n]);
    const first = ownedList(ownerAt(file, 0x100n), "items");
    expect(first).toHaveLength(3);
    expect(ownedList(ownerAt(file, 0x100n), "items")).toBe(first);
    expect(ownedList(ownerAt(file, 0x110n), "items")).toEqual([]);
    const other = fileWith([0x400n, 0x410n], [0x410n, 0x420n, 0n]);
    expect(ownedList(ownerAt(other, 0x110n), "items")).toHaveLength(2);
  });
});
