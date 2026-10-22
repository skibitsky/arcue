import { describe, expect, it } from "vitest";
import { alreadyRunningLogLine, alreadyRunningNotice } from "./already-running";

const NOT_WEB_PAGES = ["file:///etc/passwd", "javascript:alert(1)", "arcue-app://index.html", "not a url"];

describe("the notice when Arcue is already running", () => {
  it("names the address an older arcue serve runs at and offers to open it in the browser", () => {
    expect(
      alreadyRunningNotice(
        { info: { pid: 42, url: "http://localhost:4530" }, reason: "unshared", older: true },
        "linux",
      ),
    ).toEqual({
      message: "Arcue is already running",
      detail:
        "An older arcue serve runs at http://localhost:4530 and can't share reviews with this app. Run arcue stop in a terminal, then open Arcue again.",
      buttons: ["Open in browser", "Quit"],
      open: "http://localhost:4530",
    });
    expect(
      alreadyRunningNotice({ info: { pid: 42, url: "https://localhost:4530/" }, reason: "unshared", older: true }),
    ).toMatchObject({ buttons: ["Open in browser", "Quit"], open: "https://localhost:4530/" });
  });

  it("says to stop an older arcue serve where it runs on Windows, where arcue stop can't", () => {
    const running = { info: { pid: 42, url: "http://localhost:4530" }, reason: "unshared", older: true } as const;
    expect(alreadyRunningNotice(running, "win32")).toEqual({
      message: "Arcue is already running",
      detail:
        "An older arcue serve runs at http://localhost:4530 and can't share reviews with this app. Stop it where it runs, then open Arcue again.",
      buttons: ["Open in browser", "Quit"],
      open: "http://localhost:4530",
    });
    expect(alreadyRunningNotice(running, "darwin")).toEqual(alreadyRunningNotice(running, "linux"));
  });

  it("never calls Arcue in the browser of another lock protocol older", () => {
    expect(
      alreadyRunningNotice({ info: { pid: 42, url: "http://localhost:4530" }, reason: "unshared", older: false }),
    ).toEqual({
      message: "Arcue is already running",
      detail:
        "Another version of Arcue runs at http://localhost:4530 and can't share reviews with this app. Stop it or update this app, then open Arcue again.",
      buttons: ["Open in browser", "Quit"],
      open: "http://localhost:4530",
    });
  });

  it("asks to quit another version that names no address and can't share reviews", () => {
    expect(alreadyRunningNotice({ info: { pid: 42 }, reason: "unshared", older: true })).toEqual({
      message: "Arcue is already running",
      detail:
        "Another version of Arcue runs (process 42) and can't share reviews with this app. Quit it, then open Arcue again.",
      buttons: ["Quit"],
      open: null,
    });
  });

  it("only quits beside another Arcue app", () => {
    expect(alreadyRunningNotice({ info: { pid: 42 }, reason: "same", older: false })).toEqual({
      message: "Arcue is already running",
      detail: "Only one Arcue app can run at a time.",
      buttons: ["Quit"],
      open: null,
    });
  });

  it("never offers to open an address beside another Arcue app", () => {
    expect(
      alreadyRunningNotice({ info: { pid: 42, url: "http://localhost:4530" }, reason: "same", older: false }),
    ).toEqual(alreadyRunningNotice({ info: { pid: 42 }, reason: "same", older: false }));
  });

  it("never hands the browser an address that is not a web page", () => {
    for (const url of NOT_WEB_PAGES) {
      expect(alreadyRunningNotice({ info: { pid: 42, url }, reason: "unshared", older: true })).toEqual(
        alreadyRunningNotice({ info: { pid: 42 }, reason: "unshared", older: true }),
      );
      expect(alreadyRunningNotice({ info: { pid: 42, url }, reason: "same", older: false })).toEqual(
        alreadyRunningNotice({ info: { pid: 42 }, reason: "same", older: false }),
      );
    }
  });

  it("logs which core it quits beside", () => {
    expect(
      alreadyRunningLogLine({ info: { pid: 42, url: "http://localhost:4530" }, reason: "unshared", older: true }),
    ).toBe(
      "Another Arcue runs (process 42 at http://localhost:4530) and can't share reviews with this one, so this one quits",
    );
    expect(alreadyRunningLogLine({ info: { pid: 42 }, reason: "same", older: false })).toBe(
      "Another Arcue runs (process 42) and can't share reviews with this one, so this one quits",
    );
  });
});
