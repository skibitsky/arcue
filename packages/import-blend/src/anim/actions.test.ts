import { describe, expect, it } from "vitest";
import type { FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { readBlendFile } from "../blend/file";
import { datablocks } from "../blend/ids";
import { usedActions } from "./actions";

const STRUCTS: FileDefinition["structs"] = [
  {
    type: "ListBase",
    fields: [
      ["void", "*first"],
      ["void", "*last"],
    ],
  },
  {
    type: "ID",
    fields: [
      ["void", "*next"],
      ["void", "*prev"],
      ["char", "name[66]"],
      ["void", "*lib"],
    ],
  },
  { type: "bAction", fields: [["ID", "id"]] },
  {
    type: "NlaStrip",
    fields: [
      ["NlaStrip", "*next"],
      ["NlaStrip", "*prev"],
      ["ListBase", "strips"],
      ["bAction", "*act"],
      ["int", "flag"],
    ],
  },
  {
    type: "NlaTrack",
    fields: [
      ["NlaTrack", "*next"],
      ["NlaTrack", "*prev"],
      ["ListBase", "strips"],
      ["int", "flag"],
    ],
  },
  {
    type: "AnimData",
    fields: [
      ["bAction", "*action"],
      ["ListBase", "nla_tracks"],
      ["int", "flag"],
    ],
  },
  {
    type: "Object",
    fields: [
      ["ID", "id"],
      ["AnimData", "*adt"],
    ],
  },
];

describe("usedActions", () => {
  it("reads a strip that lists itself among its strips once", () => {
    const [object, track, strip, action] = [0x100n, 0x300n, 0x400n, 0x500n];
    const bytes = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs: STRUCTS,
      blocks: [
        { code: "AC", struct: "bAction", address: action, data: [{ id: { name: "ACWalk" } }] },
        { code: "OB", struct: "Object", address: object, data: [{ id: { name: "OBRig" }, adt: 0x200n }] },
        {
          code: "DATA",
          struct: "AnimData",
          address: 0x200n,
          data: [{ nla_tracks: { first: track, last: track } }],
        },
        { code: "DATA", struct: "NlaTrack", address: track, data: [{ strips: { first: strip, last: strip } }] },
        {
          code: "DATA",
          struct: "NlaStrip",
          address: strip,
          data: [{ strips: { first: strip, last: strip }, act: action }],
        },
      ],
    });
    const [rig] = datablocks(readBlendFile(bytes), "OB");
    if (!rig) throw new Error("No object was written.");
    expect(usedActions(rig).map((use) => use.played)).toEqual([true]);
  });
});
