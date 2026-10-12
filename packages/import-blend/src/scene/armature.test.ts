import { describe, expect, it } from "vitest";
import type { FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { readBlendFile } from "../blend/file";
import { readBones } from "./armature";

const STRUCTS: FileDefinition["structs"] = [
  {
    type: "ListBase",
    fields: [
      ["void", "*first"],
      ["void", "*last"],
    ],
  },
  {
    type: "Bone",
    fields: [
      ["Bone", "*next"],
      ["Bone", "*prev"],
      ["char", "name[16]"],
      ["ListBase", "childbase"],
      ["float", "arm_mat[4][4]"],
    ],
  },
  { type: "bArmature", fields: [["ListBase", "bonebase"]] },
];

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** An armature written from scratch with `children` naming each bone's children; the first bone is the only root. */
function armature(names: readonly string[], children: Readonly<Record<string, readonly string[]>>) {
  const indices = new Map(names.map((name, index) => [name, index]));
  const address = (name: string) => 0x1000n + BigInt(indices.get(name) ?? 0) * 0x100n;
  const list = (members: readonly string[]) => {
    const first = members[0];
    const last = members.at(-1);
    return { first: first ? address(first) : 0n, last: last ? address(last) : 0n };
  };
  const groups = new Map(Object.values(children).flatMap((group) => group.map((name) => [name, group] as const)));
  const siblings = (name: string) => groups.get(name) ?? [name];
  const bones = names.map((name) => {
    const group = siblings(name);
    const at = group.indexOf(name);
    const next = group[at + 1];
    const prev = group[at - 1];
    return {
      code: "DATA",
      struct: "Bone",
      address: address(name),
      data: [
        {
          name,
          next: next ? address(next) : 0n,
          prev: prev ? address(prev) : 0n,
          childbase: list(children[name] ?? []),
          arm_mat: IDENTITY,
        },
      ],
    };
  });
  const bytes = writeBlend({
    header: "old",
    pointerSize: 8,
    little: true,
    structs: STRUCTS,
    blocks: [
      { code: "AR", struct: "bArmature", address: 0x10n, data: [{ bonebase: list(names.slice(0, 1)) }] },
      ...bones,
    ],
  });
  const file = readBlendFile(bytes);
  const [block] = file.blocksWithCode("AR");
  const [struct] = block ? file.elements(block) : [];
  if (!struct) throw new Error("No armature was written.");
  return struct;
}

describe("readBones", () => {
  it("lists each parent before its children, in the order Blender lists them", () => {
    const bones = readBones(armature(["Root", "Spine", "Neck", "Tail"], { Root: ["Spine", "Tail"], Spine: ["Neck"] }));
    expect(bones.map((bone) => [bone.name, bone.parent])).toEqual([
      ["Root", -1],
      ["Spine", 0],
      ["Neck", 1],
      ["Tail", 0],
    ]);
  });

  it("reads a chain of bones far deeper than the call stack", () => {
    const names = Array.from({ length: 20_000 }, (_, index) => `B${index}`);
    const children = Object.fromEntries(names.slice(0, -1).map((name, index) => [name, [names[index + 1] ?? ""]]));
    const bones = readBones(armature(names, children));
    expect(bones).toHaveLength(20_000);
    expect(bones.at(-1)?.parent).toBe(19_998);
  });
});
