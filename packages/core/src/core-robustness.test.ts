import type { ReviewFile, RoundData } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import type { TestCore } from "./test-support";
import {
  FakeWindow,
  fakeAsset,
  flush,
  HERO,
  HERO_REVIEW,
  heroFiles,
  heroSpec,
  looseComment,
  openAsset,
  pinComment,
  png,
  readJson,
  startTestCore,
} from "./test-support";

const REVIEW_JSON = `${HERO_REVIEW}/review.json`;

async function setup(): Promise<TestCore & { assetId: string }> {
  const test = await startTestCore(heroFiles(), { clipboard: true });
  const assetId = await openAsset(test);
  return { ...test, assetId };
}

describe("round.copy failures", () => {
  it("treats screenshot cleanup as best effort, after the clipboard and the event", async () => {
    const test = await setup();
    const order: string[] = [];
    test.core.client.subscribe("round.copied", () => order.push("event"));
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await test.core.client.execute("comment.update", { assetId: test.assetId, commentId: "c1", screenshot: png });
    test.platform.fail = (operation) => {
      if (operation === "remove") order.push("cleanup");
      return operation === "remove";
    };
    const result = await test.core.client.execute("round.copy", { assetId: test.assetId });
    expect(result).toMatchObject({ round: 1, copiedToClipboard: true });
    expect(order).toEqual(["event", "cleanup"]);
    expect(test.errors).toHaveLength(1);
    await expect(test.core.client.query("review.get", { assetId: test.assetId })).resolves.toMatchObject({
      queue: [],
      rounds: [{ number: 1 }],
    });
  });

  it("removes a partly written round folder, so the next round reuses its number", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    for (const failing of [`${HERO_REVIEW}/rounds/round-1/prompt.md`, REVIEW_JSON]) {
      test.platform.fail = (operation, path) => operation === "write" && path === failing;
      await expect(test.core.client.execute("round.copy", { assetId: test.assetId })).rejects.toThrow(/refused/);
      await expect(test.platform.exists(`${HERO_REVIEW}/rounds/round-1`)).resolves.toBe(false);
      await expect(test.core.client.query("review.get", { assetId: test.assetId })).resolves.toMatchObject({
        queue: ["c1"],
        rounds: [],
      });
    }
    test.platform.fail = null;
    await expect(test.core.client.execute("round.copy", { assetId: test.assetId })).resolves.toMatchObject({
      round: 1,
    });
  });

  it("removes a new screenshot when the review cannot be saved", async () => {
    const test = await setup();
    test.platform.fail = (operation, path) => operation === "write" && path === REVIEW_JSON;
    await expect(test.core.client.execute("comment.create", pinComment(test.assetId))).rejects.toThrow(/refused/);
    await expect(test.platform.exists(`${HERO_REVIEW}/screenshots/c1.png`)).resolves.toBe(false);
  });
});

describe("deleting a reopened draft", () => {
  it("drops only the pending follow-up and restores the status it was reopened from", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("comment.create", looseComment(assetId));
    await test.core.client.execute("round.copy", { assetId });
    await test.core.client.execute("comment.resolve", { assetId, commentId: "c2" });
    await test.core.client.execute("comment.reopen", { assetId, commentId: "c1", text: "Still bent." });
    await test.core.client.execute("comment.reopen", { assetId, commentId: "c2", text: "Washed out again." });

    await test.core.client.execute("comment.delete", { assetId, commentId: "c1" });
    await test.core.client.execute("comment.delete", { assetId, commentId: "c2" });
    const review = (await readJson(test.platform, REVIEW_JSON)) as ReviewFile;
    expect(review.queue).toEqual([]);
    expect(
      review.comments.map(({ id, status, followUps, reopenedFrom, rounds }) => ({
        id,
        status,
        followUps,
        reopenedFrom,
        rounds,
      })),
    ).toEqual([
      { id: "c1", status: "sent", followUps: [], reopenedFrom: null, rounds: [1] },
      { id: "c2", status: "resolved", followUps: [], reopenedFrom: null, rounds: [1] },
    ]);

    await test.core.client.execute("review.undo", { assetId });
    await expect(test.core.client.query("review.get", { assetId })).resolves.toMatchObject({
      queue: ["c2"],
      comments: [{ status: "sent" }, { status: "draft", reopenedFrom: "resolved" }],
    });
  });
});

describe("review.json changed by another program", () => {
  async function editOnDisk(test: TestCore, edit: (review: ReviewFile) => void): Promise<void> {
    const review = (await readJson(test.platform, REVIEW_JSON)) as ReviewFile;
    edit(review);
    await test.platform.writeFile(REVIEW_JSON, JSON.stringify(review, null, 2));
  }

  it("takes in the change, announces it and drops the undo history", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.core.client.execute("comment.create", pinComment(assetId));
    const changes: ReviewFile[] = [];
    test.core.client.subscribe("review.changed", ({ review }) => changes.push(review));
    await editOnDisk(test, (review) => {
      const [comment] = review.comments;
      if (comment) comment.text = "Edited in a text editor.";
    });
    await flush();
    await test.core.idle();
    expect(changes.map((review) => review.comments[0]?.text)).toEqual(["Edited in a text editor."]);
    await expect(test.core.client.query("review.get", { assetId })).resolves.toMatchObject({
      comments: [{ text: "Edited in a text editor." }],
    });
    await expect(test.core.client.execute("review.undo", { assetId })).resolves.toEqual({ changed: false });
  });

  it("applies a command to the file on disk, not to the state it last saved", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.core.client.execute("comment.create", pinComment(assetId));
    const edited = editOnDisk(test, (review) => {
      const [comment] = review.comments;
      if (comment) comment.text = "Edited in a text editor.";
    });
    await test.core.client.execute("comment.update", {
      assetId,
      commentId: "c1",
      camera: { position: [5, 5, 5], target: [0, 0, 0], up: [0, 1, 0], fov: 40 },
    });
    await edited;
    await flush();
    await test.core.idle();
    const review = (await readJson(test.platform, REVIEW_JSON)) as ReviewFile;
    expect(review.comments[0]).toMatchObject({ text: "Edited in a text editor.", camera: { fov: 40 } });
  });

  it("refuses to overwrite a review.json another program broke", async () => {
    const test = await setup();
    test.errors.length = 0;
    await test.platform.writeFile(REVIEW_JSON, "{ half written");
    await flush();
    await test.core.idle();
    expect(test.errors).toHaveLength(1);
    await expect(test.core.client.execute("comment.create", pinComment(test.assetId))).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(test.platform.readText(REVIEW_JSON)).resolves.toBe("{ half written");
  });

  it("does not announce its own saves twice", async () => {
    const test = await setup();
    const changes: unknown[] = [];
    test.core.client.subscribe("review.changed", (payload) => changes.push(payload));
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await flush();
    await test.core.idle();
    expect(changes).toHaveLength(1);
  });
});

describe("asset.close", () => {
  it("waits for the edits in flight, then refuses new ones", async () => {
    const test = await setup();
    const { assetId } = test;
    const created = test.core.client.execute("comment.create", pinComment(assetId));
    const closed = test.core.client.execute("asset.close", { assetId });
    await expect(created).resolves.toEqual({ commentId: "c1" });
    await closed;
    await expect(readJson(test.platform, REVIEW_JSON)).resolves.toMatchObject({ queue: ["c1"] });
    await expect(test.core.client.execute("comment.create", pinComment(assetId))).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("asset.open and an unresponsive window", () => {
  it("fails as unavailable after the timeout, without blocking later opens", async () => {
    const test = await startTestCore(heroFiles());
    test.window.respond = () => new Promise(() => undefined);
    const opening = test.window.client.execute("asset.open", { path: HERO });
    await flush();
    await test.core.idle();
    test.clock.advance(10_000);
    await expect(opening).rejects.toMatchObject({ code: "unavailable" });
    await expect(test.core.client.query("asset.list", {})).resolves.toEqual({ assets: [] });

    test.window.respond = () => undefined;
    await expect(openAsset(test)).resolves.toBe("a2");
  });
});

describe("rounds and re-anchoring", () => {
  it("tells the agent that a detached comment's vertex numbers refer to an older version", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.core.client.execute("comment.create", pinComment(assetId));
    const { version: first } = await test.core.client.query("scene.get", { assetId });
    await test.platform.writeFile(
      HERO,
      fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4, offset: [0, 0, 1] }] }),
    );
    await test.core.client.execute("asset.reload", { assetId });
    const { prompt } = await test.core.client.execute("round.copy", { assetId });
    expect(prompt.split("\n\n")[1]?.split("\n")[0]).toBe(
      `1. Clip "Charge", frame 34 · point on "Body", near bone "Head" · detached: its vertex numbers refer to version ${first}, so match it by its rest positions`,
    );
    const data = (await readJson(test.platform, `${HERO_REVIEW}/rounds/round-1/round.json`)) as RoundData;
    expect(data.comments[0]).toMatchObject({ anchorState: "detached", anchorVersion: first });
  });

  it("places a pin without a computed centroid at its barycentric point, with no posed position", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", {
      ...pinComment(test.assetId),
      context: { vertexCount: 3, bones: [], centroid: null, joints: [], viewLabel: "front" },
    });
    await test.core.client.execute("round.copy", { assetId: test.assetId });
    const data = (await readJson(test.platform, `${HERO_REVIEW}/rounds/round-1/round.json`)) as RoundData;
    expect(data.comments[0]?.target).toMatchObject({ position: { rest: [1.25, 1.25, 0], posed: null } });
  });
});

describe("the review folder", () => {
  it("refuses to open an asset whose review folder goes through a symbolic link", async () => {
    const test = await startTestCore({ ...heroFiles(), "/elsewhere/keep.txt": "" });
    await test.platform.symlink("/work/game/.arcue", "/elsewhere");
    await expect(test.window.client.execute("asset.open", { path: HERO })).rejects.toMatchObject({ code: "conflict" });
  });

  it("opens again in a new window once the first one closed", async () => {
    const test = await setup();
    test.window.close();
    await flush();
    const second = new FakeWindow(test.core, "window-2");
    await expect(second.client.execute("asset.open", { path: HERO })).resolves.toEqual({ assetId: test.assetId });
  });
});

describe("keeping a repository's .arcue folder out of git", () => {
  const ARCUE = "/work/game/.arcue";
  const writesIn = (test: TestCore, folder: string) =>
    test.platform.writes.filter((write) => write.path.startsWith(`${folder}/`)).map((write) => write.path);

  it("writes .arcue/.gitignore with * before anything else when it creates the folder, never the repository's own", async () => {
    const test = await startTestCore({ ...heroFiles(), "/work/game/.gitignore": "Library/\n" });
    await openAsset(test);
    await expect(test.platform.readText(`${ARCUE}/.gitignore`)).resolves.toBe("*\n");
    expect(writesIn(test, ARCUE)[0]).toBe(`${ARCUE}/.gitignore`);
    await expect(test.platform.readText("/work/game/.gitignore")).resolves.toBe("Library/\n");
    expect(test.platform.writes.some((write) => write.path === "/work/game/.gitignore")).toBe(false);
  });

  it("never adds .gitignore to an .arcue folder that exists, as when someone deleted it to share reviews", async () => {
    const test = await startTestCore({
      ...heroFiles(),
      [`${ARCUE}/reviews/Assets/Art/Crate.fbx/review.json`]: "{}",
    });
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("round.copy", { assetId });
    await expect(test.platform.exists(`${ARCUE}/.gitignore`)).resolves.toBe(false);
  });

  it("writes .gitignore into an empty .arcue folder that a failed first write left behind", async () => {
    const test = await startTestCore(heroFiles());
    await test.platform.mkdir(ARCUE);
    await openAsset(test);
    await expect(test.platform.readText(`${ARCUE}/.gitignore`)).resolves.toBe("*\n");
  });

  it("writes .gitignore first when a comment's screenshot recreates a deleted .arcue folder", async () => {
    const test = await setup();
    await test.platform.remove(ARCUE);
    await test.core.idle();
    const writes = test.platform.writes.length;
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    expect(test.platform.writes.slice(writes).map((write) => write.path)).toEqual([
      `${ARCUE}/.gitignore`,
      `${HERO_REVIEW}/screenshots/c1.png`,
      REVIEW_JSON,
    ]);
  });

  it("writes no .gitignore outside a repository", async () => {
    const test = await startTestCore({ "/art/Hero.fbx": fakeAsset(heroSpec) });
    const assetId = await openAsset(test, "/art/Hero.fbx");
    await test.core.client.execute("comment.create", pinComment(assetId));
    expect(test.platform.writes.filter((write) => write.path.endsWith("/.gitignore"))).toEqual([]);
  });
});
