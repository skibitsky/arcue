import { describe, expect, it, vi } from "vitest";
import { importSample } from "../test/samples";

const control = vi.hoisted(() => ({ abortNextImport: false, modulesCreated: 0 }));

vi.mock("../wasm/arcue-ufbx.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../wasm/arcue-ufbx.js")>();
  return {
    default: async () => {
      control.modulesCreated++;
      const parser = await actual.default();
      const parse = parser._arcue_import;
      parser._arcue_import = (data, size) => {
        if (!control.abortNextImport) return parse(data, size);
        control.abortNextImport = false;
        throw new Error("Aborted(). Build with -sASSERTIONS for more info.");
      };
      return parser;
    },
  };
});

describe("parseFbx after the module fails", () => {
  it("reports the failure readably and parses the next file with a fresh module", async () => {
    await importSample("crate.fbx");
    const before = control.modulesCreated;
    control.abortNextImport = true;
    await expect(importSample("crate.fbx")).rejects.toMatchObject({
      name: "ArcueError",
      code: "internal",
      message: "The FBX parser failed on crate.fbx: it ran out of memory",
    });
    const scene = await importSample("crate.fbx");
    expect(scene.meshes[0]?.name).toBe("Crate");
    expect(control.modulesCreated).toBe(before + 1);
  });
});
