import { describe, expect, it, vi } from "vitest";
import type { FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { BlendFile, readBlendFile } from "../blend/file";
import { datablocks } from "../blend/ids";
import { ArmatureReadError, readBones } from "./armature";

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
      ["float", "arm_head[3]"],
      ["float", "arm_tail[3]"],
      ["float", "rad_head"],
      ["float", "rad_tail"],
      ["float", "dist"],
      ["float", "weight"],
    ],
  },
  {
    type: "bArmature",
    fields: [
      ["ID", "id"],
      ["ListBase", "bonebase"],
    ],
  },
];

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * An armature written from scratch with `children` naming each bone's children; the first bone is the only root. The
 * bone at `index` reaches from (0, index, 0) to (0, index + 1, 0), with radii 0.25 and 0.5, falloff 0.75 and weight 0.125.
 */
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
          arm_head: [0, indices.get(name) ?? 0, 0],
          arm_tail: [0, (indices.get(name) ?? 0) + 1, 0],
          rad_head: 0.25,
          rad_tail: 0.5,
          dist: 0.75,
          weight: 0.125,
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
      {
        code: "AR",
        struct: "bArmature",
        address: 0x10n,
        data: [{ id: { name: "ARRigData" }, bonebase: list(names.slice(0, 1)) }],
      },
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

  it("reads each bone's envelope at rest in armature space", () => {
    const bones = readBones(armature(["Root", "Spine"], { Root: ["Spine"] }));
    const reach = { headRadius: 0.25, tailRadius: 0.5, falloff: 0.75, weight: 0.125 };
    expect(bones.map((bone) => bone.envelope)).toEqual([
      { head: [0, 0, 0], tail: [0, 1, 0], ...reach },
      { head: [0, 1, 0], tail: [0, 2, 0], ...reach },
    ]);
  });

  it("reads a chain of bones far deeper than the call stack, with their envelopes", () => {
    const names = Array.from({ length: 20_000 }, (_, index) => `B${index}`);
    const children = Object.fromEntries(names.slice(0, -1).map((name, index) => [name, [names[index + 1] ?? ""]]));
    const bones = readBones(armature(names, children));
    expect(bones).toHaveLength(20_000);
    expect(bones.at(-1)?.parent).toBe(19_998);
    expect(bones.at(-1)?.envelope).toMatchObject({ head: [0, 19_999, 0], tail: [0, 20_000, 0] });
  });

  it("refuses an armature whose bone lists reach a bone twice", () => {
    const looped = armature(["Root", "Spine", "Neck"], { Root: ["Spine"], Spine: ["Neck"], Neck: ["Root"] });
    expect(() => readBones(looped)).toThrow(new ArmatureReadError("Armature RigData lists bone Root twice"));
  });

  it("refuses child lists that share their tails before queuing any bone twice", () => {
    const count = 1000;
    const address = (index: number) => 0x1000n + BigInt(index) * 0x100n;
    const bones = Array.from({ length: count }, (_, index) => ({
      code: "DATA",
      struct: "Bone",
      address: address(index),
      data: [
        {
          name: `B${index}`,
          next: index > 0 && index + 1 < count ? address(index + 1) : 0n,
          childbase: { first: index + 1 < count ? address(index + 1) : 0n },
          arm_mat: IDENTITY,
        },
      ],
    }));
    const file = readBlendFile(
      writeBlend({
        header: "old",
        pointerSize: 8,
        little: true,
        structs: STRUCTS,
        blocks: [
          {
            code: "AR",
            struct: "bArmature",
            address: 0x10n,
            data: [{ id: { name: "ARRigData" }, bonebase: { first: address(0), last: address(0) } }],
          },
          ...bones,
        ],
      }),
    );
    const [shared] = datablocks(file, "AR");
    if (!shared) throw new Error("No armature was written.");
    const first = vi.spyOn(BlendFile.prototype, "first");
    expect(() => readBones(shared)).toThrow(ArmatureReadError);
    expect(first.mock.calls.length).toBeLessThan(3 * count);
    first.mockRestore();
  });
});
