import { describe, expect, it } from "vitest";
import { writeBlend } from "../../test/synthetic.js";
import { readBlendFile } from "./file.js";
import { datablocks, idName, isInPackedLibrary, isLinked } from "./ids.js";

const ID_LINKED_AND_PACKED = 0x8000;
const LIBRARY_ARCHIVE = 1;

/** One object of each kind Blender writes: local, linked, and linked but packed into the file in two ways. */
function file() {
  return readBlendFile(
    writeBlend({
      header: "new",
      pointerSize: 8,
      little: true,
      structs: [
        {
          type: "ID",
          fields: [
            ["void", "*next"],
            ["void", "*prev"],
            ["char", "name[66]"],
            ["short", "flag"],
            ["void", "*lib"],
          ],
        },
        {
          type: "Library",
          fields: [
            ["ID", "id"],
            ["char", "name[64]"],
            ["short", "flag"],
            ["void", "*packedfile"],
          ],
        },
        { type: "Object", fields: [["ID", "id"]] },
      ],
      blocks: [
        {
          code: "LI",
          struct: "Library",
          address: 0x100n,
          data: [{ id: { name: "LIkit.blend" }, name: "//kit.blend" }],
        },
        {
          code: "LI",
          struct: "Library",
          address: 0x200n,
          data: [{ id: { name: "LIkit.blend.001" }, name: "//kit.blend", flag: LIBRARY_ARCHIVE }],
        },
        {
          code: "LI",
          struct: "Library",
          address: 0x300n,
          data: [{ id: { name: "LIrig.blend" }, name: "//rig.blend", packedfile: 0x900n }],
        },
        { code: "OB", struct: "Object", address: 0x1000n, data: [{ id: { name: "OBLocal" } }] },
        { code: "OB", struct: "Object", address: 0x1100n, data: [{ id: { name: "OBLinked", lib: 0x100n } }] },
        {
          code: "OB",
          struct: "Object",
          address: 0x1200n,
          data: [{ id: { name: "OBFlagged", lib: 0x100n, flag: ID_LINKED_AND_PACKED } }],
        },
        { code: "OB", struct: "Object", address: 0x1300n, data: [{ id: { name: "OBArchived", lib: 0x200n } }] },
        { code: "ID", struct: "ID", address: 0x1400n, data: [{ name: "OBPlaceholder", lib: 0x200n }] },
        { code: "ID", struct: "ID", address: 0x1500n, data: [{ name: "OBInPackedFile", lib: 0x300n }] },
      ],
    }),
  );
}

describe("isLinked", () => {
  it("counts data that Blender 5 packs into the file with its library as the file's own", () => {
    const blend = file();
    const objects = [...datablocks(blend, "OB"), ...datablocks(blend, "ID")];
    expect(objects.map((object) => [idName(object), isLinked(object)])).toEqual([
      ["Local", false],
      ["Linked", true],
      ["Flagged", false],
      ["Archived", false],
      ["Placeholder", true],
      ["InPackedFile", true],
    ]);
  });
});

describe("isInPackedLibrary", () => {
  it("tells data of a whole .blend file packed into this one from data of a file elsewhere", () => {
    const blend = file();
    const placeholders = datablocks(blend, "ID");
    expect(placeholders.map((id) => [idName(id), isInPackedLibrary(id)])).toEqual([
      ["Placeholder", false],
      ["InPackedFile", true],
    ]);
  });
});
