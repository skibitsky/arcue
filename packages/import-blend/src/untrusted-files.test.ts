import { describe, expect, it } from "vitest";
import type { Version } from "../test/fixtures";
import { importBytes, readFixture, VERSIONS } from "../test/fixtures";
import type { BlendFile, BlendStruct } from "./blend/file";
import { readBlendFile } from "./blend/file";
import { datablocks, idName } from "./blend/ids";

function setPointer(file: BlendFile, struct: BlendStruct, member: string, address: bigint): void {
  const field = struct.field(member);
  if (!field) throw new Error(`No ${member} in ${struct.typeName}.`);
  file.view.setBigUint64(struct.offset + field.offset, address, file.little);
}

function setNumber(file: BlendFile, struct: BlendStruct, member: string, value: number): void {
  const field = struct.field(member);
  if (!field) throw new Error(`No ${member} in ${struct.typeName}.`);
  const offset = struct.offset + field.offset;
  if (field.size === 1) file.view.setInt8(offset, value);
  else if (field.size === 2) file.view.setInt16(offset, value, file.little);
  else file.view.setInt32(offset, value, file.little);
}

/** The rig fixture's bytes, changed through its BodyMesh. */
function changedBody(version: Version, change: (file: BlendFile, mesh: BlendStruct) => void): Uint8Array {
  const bytes = readFixture("rig", version);
  const file = readBlendFile(bytes);
  const mesh = datablocks(file, "ME").find((candidate) => idName(candidate) === "BodyMesh");
  if (!mesh) throw new Error("The rig fixture has no BodyMesh.");
  change(file, mesh);
  return bytes;
}

/** The rig fixture with the first child list of its root bone leading back to the root. */
function loopedBones(version: Version): { bytes: Uint8Array; file: BlendFile } {
  const bytes = readFixture("rig", version);
  const file = readBlendFile(bytes);
  const root = datablocks(file, "AR")[0]?.list("bonebase")[0];
  const children = root?.list("childbase")[0]?.struct("childbase");
  if (!root || !children) throw new Error("The rig fixture has no bone with a child.");
  setPointer(file, children, "first", root.block.address);
  return { bytes, file };
}

const ARMATURE_NOT_READ = {
  subject: { kind: "node", name: "Rig" },
  message: "Armature not read: Rig",
  detail: "Armature RigData lists bone Root twice",
};

async function expectBodyLeftOut(bytes: Uint8Array, detail: string): Promise<void> {
  const scene = await importBytes("counted.blend", bytes);
  expect(scene.meshes.map((built) => built.name)).toEqual(["Prop"]);
  const invalid = scene.source.warnings.find((warning) => warning.code === "invalid-data");
  expect(invalid).toMatchObject({ subject: { kind: "node", name: "Body" }, message: "Mesh not read: Body", detail });
}

const COUNTS = [
  ["totvert", "vertices"],
  ["totedge", "edges"],
  ["totpoly", "faces"],
  ["totloop", "face corners"],
] as const;

describe("a damaged or crafted file", () => {
  it.each(VERSIONS)("leaves out the bones of a Blender %s armature that lists a bone twice", async (version) => {
    const scene = await importBytes("looped.blend", loopedBones(version).bytes);
    expect(scene.nodes.map((node) => node.name)).toEqual(["Rig", "Body", "Prop"]);
    expect(scene.meshes.map((mesh) => mesh.name)).toEqual(["Body", "Prop"]);
    expect(scene.skeletons).toEqual([]);
    expect(scene.source.warnings.filter((warning) => warning.code === "invalid-data")).toMatchObject([
      ARMATURE_NOT_READ,
    ]);
  });

  it("leaves out those bones where a parent loop reaches them through a bone parent", async () => {
    const { bytes, file } = loopedBones("5.2");
    const objects = datablocks(file, "OB");
    const rig = objects.find((object) => idName(object) === "Rig");
    const prop = objects.find((object) => idName(object) === "Prop");
    if (!rig || !prop) throw new Error("The rig fixture has no Rig or Prop.");
    setPointer(file, rig, "parent", prop.block.address);
    const scene = await importBytes("looped.blend", bytes);
    expect(scene.source.warnings).toContainEqual(expect.objectContaining(ARMATURE_NOT_READ));
  });

  it.each(VERSIONS.flatMap((version) => COUNTS.map(([member, what]) => [version, what, member] as const)))(
    "leaves out a mesh from Blender %s that counts more %s than it holds, as invalid data",
    async (version, what, member) => {
      let held = 0;
      const bytes = changedBody(version, (file, mesh) => {
        held = mesh.number(member);
        setNumber(file, mesh, member, 100_000_000);
      });
      await expectBodyLeftOut(bytes, `Mesh BodyMesh counts 100000000 ${what} but holds ${held}`);
    },
  );

  it.each([
    ["position", "totvert", "vertices"],
    [".edge_verts", "totedge", "edges"],
    [".corner_vert", "totloop", "face corners"],
  ])("counts %s stored as one value for the whole mesh as holding one element", async (name, member, what) => {
    const bytes = changedBody("5.2", (file, mesh) => {
      const storage = mesh.struct("attribute_storage");
      const attribute = storage?.derefAll("dna_attributes").find((candidate) => candidate.text("name") === name);
      if (!attribute) throw new Error(`BodyMesh has no ${name} attribute.`);
      setNumber(file, attribute, "storage_type", 1);
      setNumber(file, mesh, member, 100_000_000);
    });
    await expectBodyLeftOut(bytes, `Mesh BodyMesh counts 100000000 ${what} but holds 1`);
  });

  it("is refused as unreadable when its SDNA lays a struct's members past the struct's size", async () => {
    const bytes = readFixture("rig", VERSIONS[1]);
    const file = readBlendFile(bytes);
    const dna = file.blocksWithCode("DNA1")[0];
    const float = file.sdna.struct("Object")?.field("loc")?.typeIndex;
    if (!dna || float === undefined) throw new Error("The rig fixture has no SDNA float.");
    const lengths = Buffer.from(bytes.subarray(dna.offset, dna.offset + dna.size)).indexOf("TLEN") + 4;
    file.view.setUint16(dna.offset + lengths + 2 * float, 8, file.little);
    await expect(importBytes("widened.blend", bytes)).rejects.toMatchObject({
      code: "invalid-input",
      message: expect.stringMatching(
        /^widened\.blend is not a readable Blender file: its SDNA struct \w+ has members past its \d+ bytes$/,
      ),
    });
  });

  it("is refused as unreadable when its compressed data holds a Blender header and then zeros", async () => {
    const header = new TextEncoder().encode("BLENDER-v405");
    const zeroBlock = 128 * 1024;
    const blocks = 8;
    const content = header.length + blocks * zeroBlock;
    const littleEndian = (value: number, bytes: number) =>
      Array.from({ length: bytes }, (_, index) => Math.floor(value / 256 ** index) % 256);
    const frame = [0x28, 0xb5, 0x2f, 0xfd, 0xa0, ...littleEndian(content, 4)];
    const raw = [...littleEndian(header.length << 3, 3), ...header];
    const zeros = Array.from({ length: blocks }, (_, index) => [
      ...littleEndian((zeroBlock << 3) | (1 << 1) | (index === blocks - 1 ? 1 : 0), 3),
      0,
    ]).flat();
    await expect(importBytes("zeros.blend", Uint8Array.from([...frame, ...raw, ...zeros]))).rejects.toMatchObject({
      code: "invalid-input",
      message: "zeros.blend is not a readable Blender file: its block at byte 12 has no code",
    });
  });

  it("is refused before decompressing when it declares more data than a file can hold", async () => {
    const frameOfFourGibibytes = [0x28, 0xb5, 0x2f, 0xfd, 0xe0, 0, 0, 0, 0, 1, 0, 0, 0];
    const lastBlockRepeatingZero = [0x03, 0x00, 0x10, 0x00];
    const bomb = Uint8Array.from([...frameOfFourGibibytes, ...lastBlockRepeatingZero]);
    await expect(importBytes("bomb.blend", bomb)).rejects.toMatchObject({
      code: "invalid-input",
      message: "bomb.blend is not a readable Blender file: it expands to more than 1 GiB",
    });
  });
});
