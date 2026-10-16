import { describe, expect, it } from "vitest";
import { PlacedCopies } from "./placed-copies";

const item = (name: string) => ({ name });

describe("PlacedCopies", () => {
  it("removes a copy once the item that made it is released", () => {
    const copies = new PlacedCopies<{ name: string }>();
    const crate = item("Crate.fbx");
    copies.place(crate, "/s/Crate.fbx", true);
    expect(copies.release([crate])).toEqual(["/s/Crate.fbx"]);
    expect(copies.release([crate])).toEqual([]);
  });

  it("keeps a copy another placed item found with the same bytes until both are released, in either order", () => {
    const sharedCopy = () => {
      const copies = new PlacedCopies<{ name: string }>();
      const dropped = item("Crate.fbx");
      const picked = item("Crate.fbx");
      copies.place(dropped, "/s/Crate.fbx", true);
      copies.place(picked, "/s/Crate.fbx", false);
      return { copies, dropped, picked };
    };
    const makerFirst = sharedCopy();
    expect(makerFirst.copies.release([makerFirst.dropped])).toEqual([]);
    expect(makerFirst.copies.release([makerFirst.picked])).toEqual(["/s/Crate.fbx"]);
    const finderFirst = sharedCopy();
    expect(finderFirst.copies.release([finderFirst.picked])).toEqual([]);
    expect(finderFirst.copies.release([finderFirst.dropped])).toEqual(["/s/Crate.fbx"]);
  });

  it("never removes a file that was there before any item was placed", () => {
    const copies = new PlacedCopies<{ name: string }>();
    const texture = item("Stone.png");
    copies.place(texture, "/s/Stone.png", false);
    expect(copies.release([texture])).toEqual([]);
  });

  it("keeps a copy made again at a freed path when an item of the earlier copy is released", () => {
    const copies = new PlacedCopies<{ name: string }>();
    const earlier = item("Crate.fbx");
    const later = item("Crate.fbx");
    copies.place(earlier, "/s/Crate.fbx", true);
    copies.place(later, "/s/Crate.fbx", true);
    expect(copies.release([earlier])).toEqual([]);
    expect(copies.release([later])).toEqual(["/s/Crate.fbx"]);
  });

  it("counts an item placed twice once", () => {
    const copies = new PlacedCopies<{ name: string }>();
    const crate = item("Crate.fbx");
    copies.place(crate, "/s/Crate.fbx", true);
    copies.place(crate, "/s/Crate.fbx", false);
    expect(copies.release([crate])).toEqual(["/s/Crate.fbx"]);
  });
});
