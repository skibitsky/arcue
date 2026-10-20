import { describe, expect, it } from "vitest";
import { alreadyRunningNotice } from "./already-running";

describe("the notice when Arcue is already running", () => {
  it("names the address arcue serve runs at and offers to open it in the browser", () => {
    expect(alreadyRunningNotice({ pid: 42, url: "http://localhost:4530" })).toEqual({
      message: "Arcue is already running",
      detail: "It runs at http://localhost:4530.",
      buttons: ["Open in browser", "Quit"],
      open: "http://localhost:4530",
    });
  });

  it("only quits when the running core names no address", () => {
    expect(alreadyRunningNotice({ pid: 42, url: null })).toEqual({
      message: "Arcue is already running",
      detail: "Only one Arcue can run at a time.",
      buttons: ["Quit"],
      open: null,
    });
  });

  it("never hands the browser an address that is not a web page", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "arcue-app://index.html", "not a url"]) {
      expect(alreadyRunningNotice({ pid: 42, url })).toMatchObject({ buttons: ["Quit"], open: null });
    }
  });
});
