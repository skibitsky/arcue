import type { ReviewFile, RoundData } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { ArcueCore } from "./core";
import { screenshotFile } from "./screenshots";
import {
  FakeWindow,
  HERO,
  HERO_REVIEW,
  heroFiles,
  looseComment,
  openAsset,
  pinComment,
  png,
  readJson,
  startTestCore,
} from "./test-support";

const folder = "/work/game/.arcue/reviews/Assets/Hero.fbx";

describe("screenshotFile", () => {
  it("accepts the layouts the core writes for the comment", () => {
    expect(screenshotFile(folder, "c7", "screenshots/c7.png")).toBe(`${folder}/screenshots/c7.png`);
    expect(screenshotFile(folder, "c7", "screenshots/c7-2.png")).toBe(`${folder}/screenshots/c7-2.png`);
    expect(screenshotFile(folder, "c7", "rounds/round-12/c7.png")).toBe(`${folder}/rounds/round-12/c7.png`);
    expect(screenshotFile(folder, "c7", null)).toBeNull();
  });

  it("rejects traversal, absolute paths and drive paths", () => {
    for (const stored of [
      "../../../.ssh/id_rsa",
      "screenshots/../../../../../.ssh/id_rsa",
      "screenshots/../../c7.png",
      "rounds/round-1/../../../c7.png",
      "./screenshots/c7.png",
      "screenshots//c7.png",
      "screenshots\\c7.png",
      "/etc/passwd",
      "/work/game/.arcue/reviews/Assets/Hero.fbx/screenshots/c7.png",
      "C:/Users/me/c7.png",
      "//server/share/c7.png",
    ]) {
      expect(screenshotFile(folder, "c7", stored), stored).toBeNull();
    }
  });

  it("rejects unexpected names, including another comment's screenshot", () => {
    for (const stored of [
      "screenshots/c8.png",
      "screenshots/c70.png",
      "screenshots/c7.jpg",
      "screenshots/c7.png.txt",
      "screenshots/c7-0.png",
      "screenshots/c7-x.png",
      "screenshots/sub/c7.png",
      "rounds/round-0/c7.png",
      "rounds/round-x/c7.png",
      "rounds/c7.png",
      "review.json",
      "",
    ]) {
      expect(screenshotFile(folder, "c7", stored), stored).toBeNull();
    }
    expect(screenshotFile(folder, "c.*", "screenshots/c1.png")).toBeNull();
  });
});

describe("screenshots named by a hand-edited review.json", () => {
  async function editedReview(edit: (review: ReviewFile) => void, symlinks: Record<string, string> = {}) {
    const test = await startTestCore({
      ...heroFiles(),
      "/work/game/secret.png": "repository secret",
      "/home/me/.ssh/id_rsa": "private key",
    });
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("comment.create", { ...looseComment(assetId), screenshot: png });
    test.core.dispose();
    const path = `${HERO_REVIEW}/review.json`;
    const review = (await readJson(test.platform, path)) as ReviewFile;
    edit(review);
    await test.platform.writeFile(path, JSON.stringify(review));
    for (const [link, target] of Object.entries(symlinks)) {
      await test.platform.remove(link);
      await test.platform.symlink(link, target);
    }
    const core = await ArcueCore.start({ platform: test.platform });
    const window = new FakeWindow(core, "window-1");
    return { core, window, platform: test.platform, text: JSON.stringify(review) };
  }

  for (const screenshot of [
    "../../../../../../../home/me/.ssh/id_rsa",
    "screenshots/../../../../../../secret.png",
    "/home/me/.ssh/id_rsa",
    "screenshots/c2.png",
    "rounds/round-0/c1.png",
  ]) {
    it(`refuses to open a review whose screenshot is "${screenshot}", and leaves the file alone`, async () => {
      const { window, platform, text } = await editedReview((review) => {
        const [first] = review.comments;
        if (first) first.context.screenshot = screenshot;
      });
      await expect(window.client.execute("asset.open", { path: HERO })).rejects.toMatchObject({ code: "conflict" });
      await expect(platform.readText(`${HERO_REVIEW}/review.json`)).resolves.toBe(text);
    });
  }

  it("never reads a screenshot through a symbolic link, at the file or its folder", async () => {
    const fileLink = await editedReview(() => undefined, {
      [`${HERO_REVIEW}/screenshots/c1.png`]: "/home/me/.ssh/id_rsa",
    });
    const opened = await fileLink.window.client.execute("asset.open", { path: HERO });
    await fileLink.core.idle();
    const { assetId } = opened;
    await expect(fileLink.core.client.query("comment.screenshot", { assetId, commentId: "c1" })).resolves.toBeNull();
    await expect(fileLink.core.client.query("comment.screenshot", { assetId, commentId: "c2" })).resolves.toEqual(png);
    await fileLink.core.client.execute("round.copy", { assetId });
    const round = `${HERO_REVIEW}/rounds/round-1`;
    await expect(fileLink.platform.exists(`${round}/c1.png`)).resolves.toBe(false);
    const data = (await readJson(fileLink.platform, `${round}/round.json`)) as RoundData;
    expect(data.comments.map((comment) => comment.screenshot)).toEqual([null, "c2.png"]);
    await expect(fileLink.platform.readText("/home/me/.ssh/id_rsa")).resolves.toBe("private key");

    const folderLink = await editedReview(() => undefined, { [`${HERO_REVIEW}/screenshots`]: "/home/me/.ssh" });
    await folderLink.platform.writeFile("/home/me/.ssh/c1.png", "outside");
    const { assetId: second } = await folderLink.window.client.execute("asset.open", { path: HERO });
    await folderLink.core.idle();
    await expect(
      folderLink.core.client.query("comment.screenshot", { assetId: second, commentId: "c1" }),
    ).resolves.toBeNull();
  });

  it("cleans up only plain files named like screenshots", async () => {
    const test = await startTestCore({ ...heroFiles(), "/outside/c9.png": "outside" });
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.platform.writeFile(`${HERO_REVIEW}/screenshots/c8.png`, "orphan");
    await test.platform.writeFile(`${HERO_REVIEW}/screenshots/notes.txt`, "mine");
    await test.platform.writeFile(`${HERO_REVIEW}/screenshots/c8-0.png`, "not ours");
    await test.platform.symlink(`${HERO_REVIEW}/screenshots/c9.png`, "/outside/c9.png");
    await test.core.client.execute("round.copy", { assetId });
    await expect(test.platform.list(`${HERO_REVIEW}/screenshots`)).resolves.toEqual([
      { name: "c8-0.png", kind: "file" },
      { name: "c9.png", kind: "symlink" },
      { name: "notes.txt", kind: "file" },
    ]);
    await expect(test.platform.readText("/outside/c9.png")).resolves.toBe("outside");
  });
});
