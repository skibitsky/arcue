import type { CompositionFile, ReviewFile, RoundData } from "@arcue/protocol";
import type { Importer } from "@arcue/scene";
import { describe, expect, it, vi } from "vitest";
import type { ArcueCore } from "./core";
import { emptyReview, serializeReview } from "./review-store";
import type { FakeAssetSpec, FakeWindow, SecondCore, TestCore } from "./test-support";
import {
  fakeAsset,
  fakeImporter,
  flush,
  gatedImporter,
  HERO,
  HERO_REVIEW,
  HERO_VERSION,
  heroFiles,
  heroSpec,
  looseComment,
  openAsset,
  pinComment,
  pinContext,
  png,
  readJson,
  startSecondCore,
  startTestCore,
  unlockedWrites,
} from "./test-support";

const REVIEW_JSON = `${HERO_REVIEW}/review.json`;
const COMPOSITION = `${HERO_REVIEW}/composition.json`;
const ART = "/work/game/Assets/Art";
const STRIKER = `${ART}/Striker.fbx`;
const STRIKER_REVIEW = "/work/game/.arcue/reviews/Assets/Art/Striker.fbx";
const SETTINGS = "/app-data/settings.json";

const animation = (clip: string): string => fakeAsset({ meshes: [], clips: [{ name: clip, frames: 11 }] });
const animated = (): Record<string, string> => ({
  ...heroFiles(),
  [`${ART}/Wave.fbx`]: animation("Wave"),
  [`${ART}/Jump.fbx`]: animation("Jump"),
});

/** The hero with more vertices, which moves a pin onto other vertex numbers. */
const finer = fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 5 }] });
/** The hero with fewer vertices than `finer`, and longer text, so its size differs from both other versions. */
const coarser = fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4, size: 2 }] });
/** The importer of a build that cannot read the file "Prop.fbx". */
const cannotReadProp: Importer = {
  ...fakeImporter,
  import: (request) =>
    request.fileName === "Prop.fbx"
      ? Promise.reject(new Error("This build cannot read the file."))
      : fakeImporter.import(request),
};

interface Side {
  core: ArcueCore;
  window: FakeWindow;
  errors: unknown[];
}

interface TwoCores {
  a: TestCore;
  b: SecondCore;
  key: string;
}

async function twoCores(
  files: Record<string, string | Uint8Array> = heroFiles(),
  options: { importers?: readonly Importer[] } = {},
): Promise<TwoCores> {
  const a = await startTestCore(files);
  const b = await startSecondCore(a, options);
  return { a, b, key: a.platform.lockKey("/work/game", "reviews") };
}

async function openIn(side: Side, path = HERO): Promise<string> {
  const { assetId } = await side.window.client.execute("asset.open", { path });
  await side.core.idle();
  return assetId;
}

async function idle(cores: TwoCores): Promise<void> {
  await flush();
  await cores.a.core.idle();
  await cores.b.core.idle();
  await flush();
}

/** Lets file changes settle through both cores' stability checks, including the wait for a missing model. */
async function settle(cores: TwoCores): Promise<void> {
  for (let check = 0; check < 60; check++) {
    await idle(cores);
    if (cores.a.clock.pendingTimers === 0) return;
    cores.a.clock.advance(300);
  }
  throw new Error("The stability checks never settled.");
}

/** Lets core A's stability checks run while core B may be held back, so B's work is never waited for. */
async function settleA(cores: TwoCores): Promise<void> {
  for (let check = 0; check < 12; check++) {
    await flush();
    await cores.a.core.idle();
    cores.a.clock.advance(300);
  }
  await flush();
  await cores.a.core.idle();
}

/** Lets both cores work for a while without running their stability checks. */
async function workAWhile(cores: TwoCores): Promise<void> {
  for (let turn = 0; turn < 20; turn++) await idle(cores);
}

const saved = async (test: TestCore, path = REVIEW_JSON) => (await readJson(test.platform, path)) as ReviewFile;
const versionOf = async (side: Side, assetId: string) =>
  (await side.core.client.query("scene.get", { assetId })).version;
const writesBy = (test: TestCore, actor: string, path = REVIEW_JSON) =>
  test.platform.log.filter((entry) => entry.actor === actor && entry.path === path && entry.op === "writeAtomic");

/** Records what each core writes to review.json from now on, in order, for the returned function to read. */
function recordReviewWrites(test: TestCore): () => Promise<{ actor: string | null; review: ReviewFile }[]> {
  const writers: (string | null)[] = [];
  const reviews: ReviewFile[] = [];
  test.platform.beforeWrite = async (path, op, actor) => {
    if (path !== REVIEW_JSON || op !== "writeAtomic") return;
    if (writers.length > 0) reviews.push(await saved(test));
    writers.push(actor);
  };
  return async () => {
    test.platform.beforeWrite = null;
    if (writers.length > reviews.length) reviews.push(await saved(test));
    return writers.flatMap((actor, index) => {
      const review = reviews[index];
      return review ? [{ actor, review }] : [];
    });
  };
}

/** Counts the cores' changes of review.json from now on, and fails every one after the tenth, so a loop ends. */
function countReviewWrites(test: TestCore): () => number {
  let writes = 0;
  test.platform.beforeWrite = (path, _op, actor) => {
    if (path !== REVIEW_JSON || actor === null) return;
    writes++;
    if (writes > 10) throw new Error("The cores keep rewriting review.json.");
  };
  return () => writes;
}

/** Holds back the actor's first change of a path that `matches` until `release`; `reached` resolves once it waits. */
function holdWrite(
  test: TestCore,
  actor: string,
  matches: (path: string) => boolean,
): { reached: Promise<void>; release(): void } {
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let held = false;
  test.platform.beforeWrite = async (path, _op, writer) => {
    if (held || writer !== actor || !matches(path)) return;
    held = true;
    reached.resolve();
    await released.promise;
  };
  return { reached: reached.promise, release: () => released.resolve() };
}

describe("two cores saving one review", () => {
  it("lets the second save wait for the first, so both comments land", async () => {
    const cores = await twoCores();
    const { a, b, key } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    const before = (await saved(a)).revision;
    const gate = holdWrite(a, "core-1", (path) => path === REVIEW_JSON);
    const first = a.core.client.execute("comment.create", looseComment(assetA, "From A."));
    await gate.reached;
    let secondDone = false;
    const second = b.core.client.execute("comment.create", looseComment(assetB, "From B.")).then((result) => {
      secondDone = true;
      return result;
    });
    await vi.waitFor(() => expect(a.platform.lockWaiters(key)).toBe(1));
    await flush();
    expect(secondDone).toBe(false);

    gate.release();
    await Promise.all([first, second]);
    const review = await saved(a);
    expect(review.comments.map((comment) => comment.text)).toEqual(["From A.", "From B."]);
    expect(review.revision).toBe(before + 2);
  });

  it("keeps every comment of two bursts and raises the revision by one per save", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    const revisions: number[] = [];
    a.platform.beforeWrite = async (path, _op, actor) => {
      if (path === REVIEW_JSON && actor !== null) revisions.push((await saved(a)).revision);
    };
    const creates = Array.from({ length: 50 }, (_, index) => [
      a.core.client.execute("comment.create", looseComment(assetA, `A ${index}`)),
      b.core.client.execute("comment.create", looseComment(assetB, `B ${index}`)),
    ]).flat();
    await Promise.all(creates);
    await idle(cores);
    const review = await saved(a);
    expect(review.comments).toHaveLength(100);
    revisions.push(review.revision);
    expect(revisions).toEqual(revisions.map((_, index) => (revisions[0] ?? 0) + index));
    const fromA = await a.core.client.query("review.get", { assetId: assetA });
    const fromB = await b.core.client.query("review.get", { assetId: assetB });
    expect(fromB).toEqual(fromA);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
  });

  it("deletes a draft in one core so the other core's update finds nothing to recreate", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    const { commentId } = await a.core.client.execute("comment.create", looseComment(assetA));
    await idle(cores);
    await b.core.client.execute("comment.delete", { assetId: assetB, commentId });
    await expect(
      a.core.client.execute("comment.update", { assetId: assetA, commentId, text: "Still here?" }),
    ).rejects.toMatchObject({ code: "not-found" });
    expect((await saved(a)).comments).toEqual([]);
  });

  it("records a version both cores load once, and keeps the first core's undo", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const assetA = await openIn(a);
    await a.core.client.execute("comment.create", looseComment(assetA));
    await openIn(b);
    await idle(cores);
    expect(writesBy(a, "core-2")).toEqual([]);
    expect(writesBy(a, "core-1")).toHaveLength(2);
    await expect(a.core.client.execute("review.undo", { assetId: assetA })).resolves.toEqual({ changed: true });
    expect((await saved(a)).comments).toEqual([]);
  });
});

describe("two cores and screenshots", () => {
  it("gives two updates of one screenshot their own files, keeps the last and removes only a failed one's", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    const { commentId } = await a.core.client.execute("comment.create", pinComment(assetA));
    await idle(cores);
    await Promise.all([
      a.core.client.execute("comment.update", { assetId: assetA, commentId, screenshot: Uint8Array.of(1) }),
      b.core.client.execute("comment.update", { assetId: assetB, commentId, screenshot: Uint8Array.of(2) }),
    ]);
    const shots = `${HERO_REVIEW}/screenshots`;
    await expect(a.platform.readFile(`${shots}/${commentId}-2.png`)).resolves.toEqual(Uint8Array.of(1));
    await expect(a.platform.readFile(`${shots}/${commentId}-3.png`)).resolves.toEqual(Uint8Array.of(2));
    expect((await saved(a)).comments[0]?.context.screenshot).toBe(`screenshots/${commentId}-3.png`);

    a.platform.fail = (operation, path, actor) => operation === "write" && path === REVIEW_JSON && actor === "core-2";
    await Promise.all([
      a.core.client.execute("comment.update", { assetId: assetA, commentId, screenshot: Uint8Array.of(3) }),
      expect(
        b.core.client.execute("comment.update", { assetId: assetB, commentId, screenshot: Uint8Array.of(4) }),
      ).rejects.toThrow(/refused/),
    ]);
    const files = (await a.platform.list(shots)).map((entry) => entry.name);
    expect(files).toEqual([`${commentId}-2.png`, `${commentId}-3.png`, `${commentId}-4.png`, `${commentId}.png`]);
    await expect(a.platform.readFile(`${shots}/${commentId}-4.png`)).resolves.toEqual(Uint8Array.of(3));
    expect((await saved(a)).comments[0]?.context.screenshot).toBe(`screenshots/${commentId}-4.png`);
  });

  it("never lets a round's cleanup remove a screenshot another core is saving", async () => {
    const cores = await twoCores();
    const { a, b, key } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await a.core.client.execute("comment.create", looseComment(assetA));
    await idle(cores);
    const gate = holdWrite(a, "core-2", (path) => path.startsWith(`${HERO_REVIEW}/screenshots/`));
    const created = b.core.client.execute("comment.create", pinComment(assetB));
    await gate.reached;
    const round = a.core.client.execute("round.copy", { assetId: assetA });
    await vi.waitFor(() => expect(a.platform.lockWaiters(key)).toBe(1));

    gate.release();
    const { commentId } = await created;
    await expect(round).resolves.toMatchObject({ round: 1 });
    const review = await saved(a);
    expect(review.comments.find((comment) => comment.id === commentId)?.context.screenshot).toBe(
      `rounds/round-1/${commentId}.png`,
    );
    for (const comment of review.comments) {
      if (comment.context.screenshot === null) continue;
      await expect(a.platform.exists(`${HERO_REVIEW}/${comment.context.screenshot}`)).resolves.toBe(true);
    }
  });

  it("removes a screenshot only once nothing another core can undo refers to it", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await a.core.client.execute("comment.create", looseComment(assetA, "First round."));
    await idle(cores);
    a.platform.log.length = 0;
    const gate = holdWrite(a, "core-1", (path) => path.startsWith(`${HERO_REVIEW}/rounds/`));
    const firstRound = a.core.client.execute("round.copy", { assetId: assetA });
    await gate.reached;
    const created = b.core.client.execute("comment.create", pinComment(assetB, "X"));
    await vi.waitFor(() => expect(a.platform.lockWaiters(cores.key)).toBe(1));
    gate.release();
    await firstRound;
    const { commentId } = await created;
    const locks = a.platform.log.filter((entry) => entry.op === "lock" || entry.op === "unlock");
    expect(locks.map((entry) => `${entry.actor} ${entry.op}`)).toEqual([
      "core-1 lock",
      "core-1 unlock",
      "core-2 lock",
      "core-2 unlock",
    ]);
    await b.core.client.execute("comment.delete", { assetId: assetB, commentId });

    const screenshot = `${HERO_REVIEW}/screenshots/${commentId}.png`;
    await a.core.client.execute("comment.create", looseComment(assetA, "Second round."));
    await a.core.client.execute("round.copy", { assetId: assetA });
    await expect(a.platform.exists(screenshot)).resolves.toBe(false);
    await expect(b.core.client.execute("review.undo", { assetId: assetB })).resolves.toEqual({ changed: false });
    for (const comment of (await saved(a)).comments) {
      if (comment.context.screenshot === null) continue;
      await expect(a.platform.exists(`${HERO_REVIEW}/${comment.context.screenshot}`)).resolves.toBe(true);
    }
  });

  it("lets a core undo a delete with its screenshot while no round has cleaned up since", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    await openIn(a);
    const assetB = await openIn(b);
    const { commentId } = await b.core.client.execute("comment.create", pinComment(assetB, "X"));
    await b.core.client.execute("comment.delete", { assetId: assetB, commentId });
    await expect(b.core.client.execute("review.undo", { assetId: assetB })).resolves.toEqual({ changed: true });
    const comment = (await saved(a)).comments.find((entry) => entry.id === commentId);
    expect(comment?.context.screenshot).toBe(`screenshots/${commentId}.png`);
    await expect(a.platform.exists(`${HERO_REVIEW}/screenshots/${commentId}.png`)).resolves.toBe(true);
  });
});

describe("two cores copying rounds", () => {
  it("copies one queue once, and rolls back only the round folder of the core that failed", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await a.core.client.execute("comment.create", looseComment(assetA));
    await idle(cores);
    const results = await Promise.allSettled([
      a.core.client.execute("round.copy", { assetId: assetA }),
      b.core.client.execute("round.copy", { assetId: assetB }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(results[1]).toMatchObject({ reason: { code: "conflict", message: "The queue has no comments to copy." } });
    expect((await saved(a)).rounds.map((round) => round.number)).toEqual([1]);

    await a.core.client.execute("comment.create", looseComment(assetA, "Second."));
    await idle(cores);
    const prompt = `${HERO_REVIEW}/rounds/round-2/prompt.md`;
    a.platform.fail = (operation, path, actor) => operation === "write" && path === prompt && actor === "core-1";
    const [failed, copied] = await Promise.allSettled([
      a.core.client.execute("round.copy", { assetId: assetA }),
      b.core.client.execute("round.copy", { assetId: assetB }),
    ]);
    expect(failed).toMatchObject({ status: "rejected" });
    expect(copied).toMatchObject({ status: "fulfilled", value: { round: 2 } });
    await expect(a.platform.exists(prompt)).resolves.toBe(true);
    expect((await saved(a)).rounds.map((round) => round.number)).toEqual([1, 2]);
  });

  it("states positions in the convention another core saved, without waiting for its watcher", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const assetA = await openIn(a);
    await a.core.client.execute("comment.create", pinComment(assetA));
    let refusing = false;
    let refused = 0;
    a.platform.beforeWrite = (path, _op, actor) => {
      if (path === SETTINGS && actor === "core-2") refusing = true;
    };
    a.platform.beforeRead = (path) => {
      if (!refusing || path !== SETTINGS) return;
      refused++;
      throw new Error("The watchers read settings.json too early.");
    };
    await b.core.client.execute("settings.set", { coordinates: "z-up-blender" });
    await vi.waitFor(() => expect(refused).toBe(2));
    await expect(a.core.client.query("settings.get", {})).resolves.toEqual({ coordinates: "y-up" });

    refusing = false;
    const { prompt } = await a.core.client.execute("round.copy", { assetId: assetA });
    expect(prompt).toContain("Meters, right-handed, Z up as in Blender.");
  });
});

describe("two cores editing one composition", () => {
  it("keeps both cores' additions and reloads both", async () => {
    const cores = await twoCores(animated());
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await Promise.all([
      a.core.client.execute("composition.addFile", { assetId: assetA, file: "Wave.fbx", role: "animation" }),
      b.core.client.execute("composition.addFile", { assetId: assetB, file: "Jump.fbx", role: "animation" }),
    ]);
    await settle(cores);
    const written = (await readJson(a.platform, COMPOSITION)) as CompositionFile;
    expect([...(written.animations ?? [])].sort()).toEqual(["Jump.fbx", "Wave.fbx"]);
    for (const [side, assetId] of [
      [a, assetA],
      [b, assetB],
    ] as const) {
      await expect(side.core.client.query("asset.list", {})).resolves.toMatchObject({
        assets: [{ assetId, status: "ready" }],
      });
      const { scene } = await side.core.client.query("scene.get", { assetId });
      expect(scene.clips.map((clip) => clip.name).sort()).toEqual([
        "Armature|Charge",
        "Armature|Run",
        "Jump.fbx//Jump",
        "Wave.fbx//Wave",
      ]);
    }
  });

  it("refuses an undo of a composition edit once the other core changed the file, and keeps both edits", async () => {
    const gate = gatedImporter();
    const cores = await twoCores(animated(), { importers: [gate.importer] });
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await a.core.client.execute("composition.addFile", { assetId: assetA, file: "Wave.fbx", role: "animation" });
    gate.hold("Jump.fbx");
    const added = b.core.client.execute("composition.addFile", {
      assetId: assetB,
      file: "Jump.fbx",
      role: "animation",
    });
    await vi.waitFor(async () =>
      expect(((await readJson(a.platform, COMPOSITION)) as CompositionFile).animations).toHaveLength(2),
    );
    await expect(a.core.client.execute("review.undo", { assetId: assetA })).rejects.toMatchObject({
      code: "conflict",
      message: "composition.json changed since then, so it was left as it is.",
    });
    expect(((await readJson(a.platform, COMPOSITION)) as CompositionFile).animations).toEqual(["Wave.fbx", "Jump.fbx"]);
    await expect(a.core.client.execute("review.undo", { assetId: assetA })).resolves.toEqual({ changed: false });
    gate.release("Jump.fbx");
    await added;
    await settle(cores);
  });

  it("never lets a failed relink of a lost file put back text from before the other core's edit", async () => {
    const run = `${ART}/Anim/Run.fbx`;
    const files = {
      ...animated(),
      [run]: animation("Run"),
      [COMPOSITION]: JSON.stringify({ version: 1, animations: ["Anim/Run.fbx"] }),
    };
    const cores = await twoCores(files);
    const { a, b, key } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await a.platform.rename(run, `${ART}/Anim/Running.fbx`);
    const gate = holdWrite(a, "core-1", (path) => path === COMPOSITION);
    let relinking = false;
    void gate.reached.then(() => {
      relinking = true;
    });
    a.platform.fail = (operation, path, actor) => {
      if (!relinking || operation !== "write" || path !== REVIEW_JSON || actor !== "core-1") return false;
      relinking = false;
      return true;
    };
    const reload = a.core.client.execute("asset.reload", { assetId: assetA }).catch((error: unknown) => error);
    await gate.reached;
    const added = b.core.client.execute("composition.addFile", {
      assetId: assetB,
      file: "Wave.fbx",
      role: "animation",
    });
    await vi.waitFor(() => expect(a.platform.lockWaiters(key)).toBe(1));
    gate.release();
    await reload;
    await added;
    a.platform.fail = null;
    await idle(cores);
    const written = (await readJson(a.platform, COMPOSITION)) as CompositionFile;
    expect(written.animations).toContain("Wave.fbx");
    expect(a.errors).toHaveLength(1);
  });
});

describe("two cores and the settings", () => {
  it("keeps both cores' settings and tells both windows", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const heard: { window: string; settings: unknown }[] = [];
    for (const side of [a, b]) {
      side.window.client.subscribe("settings.changed", ({ settings }) =>
        heard.push({ window: side.window.connection, settings }),
      );
    }
    await Promise.all([
      a.core.client.execute("settings.set", { authorName: "Ana" }),
      b.core.client.execute("settings.set", { coordinates: "z-up-blender" }),
    ]);
    const both = { authorName: "Ana", coordinates: "z-up-blender" };
    await expect(readJson(a.platform, SETTINGS)).resolves.toEqual(both);
    await vi.waitFor(async () => {
      await expect(a.core.client.query("settings.get", {})).resolves.toEqual(both);
      await expect(b.core.client.query("settings.get", {})).resolves.toEqual(both);
      expect(heard.filter((entry) => entry.window === "window-1").at(-1)?.settings).toEqual(both);
      expect(heard.filter((entry) => entry.window === "window-2").at(-1)?.settings).toEqual(both);
    });
  });
});

describe("two cores and a renamed model", () => {
  async function reviewed(cores: TwoCores, path = HERO): Promise<string> {
    const assetId = await openIn(cores.a, path);
    const { commentId } = await cores.a.core.client.execute("comment.create", pinComment(assetId));
    await cores.a.core.client.execute("asset.close", { assetId });
    return commentId;
  }

  it("follows one rename in both cores into one review folder", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    const { commentId } = await a.core.client.execute("comment.create", pinComment(assetA));
    await a.platform.rename(HERO, STRIKER);
    await settle(cores);
    await expect(a.platform.exists(HERO_REVIEW)).resolves.toBe(false);
    expect((await saved(a, `${STRIKER_REVIEW}/review.json`)).comments.map((comment) => comment.id)).toEqual([
      commentId,
    ]);
    for (const [side, assetId] of [
      [a, assetA],
      [b, assetB],
    ] as const) {
      await expect(side.core.client.query("asset.list", {})).resolves.toMatchObject({
        assets: [{ assetId, path: STRIKER, status: "ready" }],
      });
    }
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
  });

  it("refuses a save of a review another core relinked away", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    await reviewed(cores);
    const assetB = await openIn(b);
    await a.platform.remove(HERO);
    await a.platform.writeFile(STRIKER, coarser);
    await settle(cores);
    await expect(b.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId: assetB, error: "Model not found: Hero.fbx" }],
    });
    const assetA = await openIn(a, STRIKER);
    const changes: ReviewFile[] = [];
    a.core.client.subscribe("review.changed", ({ review }) => changes.push(review));
    await a.core.client.execute("review.relink", { assetId: assetA, from: HERO });
    await a.core.idle();
    expect(changes.length).toBeGreaterThan(0);
    for (const review of changes) {
      const recorded = new Set(review.versions.map((version) => version.id));
      expect(review.comments.filter((comment) => !recorded.has(comment.anchorVersion))).toEqual([]);
    }
    await expect(b.core.client.execute("comment.create", pinComment(assetB))).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("Hero.fbx and its review are gone from disk"),
    });
    await expect(a.platform.exists(HERO_REVIEW)).resolves.toBe(false);
  });

  it("refuses a save of a review another core took for a renamed model it opened", async () => {
    const cores = await twoCores({ ...heroFiles(), [STRIKER]: heroFiles()[HERO] ?? "" });
    const { a, b } = cores;
    await reviewed(cores);
    const assetB = await openIn(b);
    await a.platform.remove(HERO);
    await settle(cores);
    await expect(b.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId: assetB, error: "Model not found: Hero.fbx" }],
    });
    const relinked: unknown[] = [];
    a.core.client.subscribe("review.relinked", (payload) => relinked.push(payload));
    await openIn(a, STRIKER);
    expect(relinked).toHaveLength(1);
    await expect(b.core.client.execute("comment.create", looseComment(assetB))).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("Hero.fbx and its review are gone from disk"),
    });
    await expect(a.platform.exists(HERO_REVIEW)).resolves.toBe(false);
  });

  it("moves the earlier review once when both cores open the renamed model at once", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    const commentId = await reviewed(cores);
    await a.platform.rename(HERO, STRIKER);
    const relinked: unknown[] = [];
    for (const side of [a, b]) side.core.client.subscribe("review.relinked", (payload) => relinked.push(payload));
    const [opened, other] = await Promise.all([
      a.window.client.execute("asset.open", { path: STRIKER }),
      b.window.client.execute("asset.open", { path: STRIKER }),
    ]);
    await idle(cores);
    expect(relinked).toHaveLength(1);
    await expect(a.platform.exists(HERO_REVIEW)).resolves.toBe(false);
    for (const [side, assetId] of [
      [a, opened.assetId],
      [b, other.assetId],
    ] as const) {
      const review = await side.core.client.query("review.get", { assetId });
      expect(review.comments.map((comment) => comment.id)).toEqual([commentId]);
    }
  });

  it("never deletes a comment another core adds to the review a relink replaces", async () => {
    const cores = await twoCores();
    const { a, b } = cores;
    await reviewed(cores);
    await a.platform.remove(HERO);
    await a.platform.writeFile(STRIKER, coarser);
    const assetA = await openIn(a, STRIKER);
    const assetB = await openIn(b, STRIKER);
    const gate = holdWrite(a, "core-2", (path) => path === `${STRIKER_REVIEW}/review.json`);
    const version = await versionOf(b, assetB);
    const created = b.core.client.execute("comment.create", looseComment(assetB, "Mine.", version));
    await gate.reached;
    const relink = a.core.client.execute("review.relink", { assetId: assetA, from: HERO });
    await vi.waitFor(() => expect(a.platform.lockWaiters(cores.key)).toBe(1));
    gate.release();
    const { commentId } = await created;
    await expect(relink).rejects.toMatchObject({ code: "conflict" });
    await idle(cores);
    const review = await saved(a, `${STRIKER_REVIEW}/review.json`);
    expect(review.comments.map((comment) => comment.id)).toEqual([commentId]);
  });

  it("follows a rename in one core while the other relinks a review in the same repository", async () => {
    const crate = `${ART}/Crate.fbx`;
    const oldCrate = `${ART}/OldCrate.fbx`;
    const cores = await twoCores({ ...heroFiles(), [oldCrate]: finer });
    const { a, b } = cores;
    const assetA = await openIn(a);
    const oldAsset = await openIn(b, oldCrate);
    await b.core.client.execute("comment.create", looseComment(oldAsset, "Crate.", await versionOf(b, oldAsset)));
    await b.core.client.execute("asset.close", { assetId: oldAsset });
    await a.platform.remove(oldCrate);
    await a.platform.writeFile(crate, coarser);
    const assetB = await openIn(b, crate);
    await a.platform.rename(HERO, STRIKER);
    const relink = b.core.client.execute("review.relink", { assetId: assetB, from: oldCrate });
    await settle(cores);
    await relink;
    await expect(a.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId: assetA, path: STRIKER, status: "ready" }],
    });
    expect((await b.core.client.query("review.get", { assetId: assetB })).comments).toHaveLength(1);
    expect(a.platform.heldLocks()).toEqual([]);
  });

  it("refuses a save in a core whose load failed once another core moved the review away", async () => {
    const failing: Importer = {
      ...fakeImporter,
      import: async () => {
        throw new Error("This build cannot read the file.");
      },
    };
    const cores = await twoCores(heroFiles(), { importers: [failing] });
    const { a, b } = cores;
    const assetB = await openIn(b);
    await expect(b.core.client.query("asset.list", {})).resolves.toMatchObject({ assets: [{ status: "failed" }] });
    const assetA = await openIn(a);
    await a.core.client.execute("comment.create", looseComment(assetA));
    await a.platform.rename(HERO, STRIKER);
    await settle(cores);
    await expect(a.core.client.query("asset.list", {})).resolves.toMatchObject({ assets: [{ path: STRIKER }] });
    await expect(b.core.client.execute("comment.create", looseComment(assetB))).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("Hero.fbx and its review are gone from disk"),
    });
    await expect(a.platform.exists(HERO_REVIEW)).resolves.toBe(false);
  });

  it("never follows a rename with a review another core moved to a copy of the model", async () => {
    const copy = "/work/game/Assets/Other/Copy.fbx";
    const copyReview = "/work/game/.arcue/reviews/Assets/Other/Copy.fbx/review.json";
    const cores = await twoCores();
    const { a, b } = cores;
    const commentId = await reviewed(cores);
    const assetB = await openIn(b);
    await a.platform.rename(HERO, STRIKER);
    await a.platform.writeFile(copy, heroFiles()[HERO] ?? "");
    await openIn(a, copy);
    await settle(cores);
    expect((await saved(a, copyReview)).comments.map((comment) => comment.id)).toEqual([commentId]);
    await expect(b.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId: assetB, path: HERO, error: "Model not found: Hero.fbx" }],
    });
    await expect(b.core.client.execute("asset.relink", { assetId: assetB, path: STRIKER })).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("Another Arcue may have moved it to another model."),
    });
    await expect(a.platform.exists(STRIKER_REVIEW)).resolves.toBe(false);
    expect(b.errors).toEqual([]);
  });
});

describe("two cores loading versions", () => {
  it("never re-anchors comments back onto a version whose file changed while it was parsed", async () => {
    const gate = gatedImporter();
    const cores = await twoCores(heroFiles(), { importers: [gate.importer] });
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await a.core.client.execute("comment.create", pinComment(assetA));
    await idle(cores);
    gate.hold("Hero.fbx");
    await a.platform.writeFile(HERO, finer);
    await settleA(cores);
    await a.platform.writeFile(HERO, coarser);
    await settleA(cores);
    const latest = await versionOf(a, assetA);
    expect((await saved(a)).comments[0]?.anchorVersion).toBe(latest);
    const writes = writesBy(a, "core-2").length;

    gate.release("Hero.fbx");
    await settle(cores);
    expect(writesBy(a, "core-2")).toHaveLength(writes);
    expect(await versionOf(b, assetB)).toBe(latest);
    expect((await saved(a)).comments[0]?.anchorVersion).toBe(latest);
  });

  it("never re-anchors comments back onto a version whose composition file changed while it was parsed", async () => {
    const prop = `${ART}/Prop.fbx`;
    const plate = (grid: number) => fakeAsset({ meshes: [{ name: "Plate", grid }] });
    const gate = gatedImporter();
    const cores = await twoCores(
      {
        ...heroFiles(),
        [prop]: plate(3),
        [COMPOSITION]: JSON.stringify({ version: 1, attach: [{ file: "Prop.fbx" }] }),
      },
      { importers: [gate.importer] },
    );
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await a.core.client.execute("comment.create", {
      ...pinComment(assetA, "On the plate.", await versionOf(a, assetA)),
      target: { kind: "surface", mesh: "Prop.fbx//Hero/Plate", vertices: [0, 1, 3], weights: [0.5, 0.25, 0.25] },
    });
    await idle(cores);
    gate.hold("Prop.fbx");
    await a.platform.writeFile(prop, plate(4));
    await settleA(cores);
    await a.platform.writeFile(prop, plate(5));
    await settleA(cores);
    const latest = await versionOf(a, assetA);
    expect((await saved(a)).comments[0]?.anchorVersion).toBe(latest);
    const written = recordReviewWrites(a);

    gate.release("Prop.fbx");
    await settle(cores);
    expect(await versionOf(b, assetB)).toBe(latest);
    const anchors = (await written()).map(({ review }) => review.comments[0]?.anchorVersion);
    expect(anchors.filter((anchor) => anchor !== latest)).toEqual([]);
    expect((await saved(a)).comments[0]?.anchorVersion).toBe(latest);
  });

  it("fails a load whose file changes on every read, and loads it once it settles", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    const variants = [coarser, finer];
    let reads = 0;
    test.platform.beforeRead = async (path) => {
      if (path !== HERO || reads >= 3) return;
      await test.platform.writeFile(HERO, variants[reads++ % 2] ?? finer);
    };
    const message = "Hero.fbx keeps changing on disk; Arcue loads it once it settles.";
    await expect(test.core.client.execute("asset.reload", { assetId })).rejects.toMatchObject({
      code: "conflict",
      message,
    });
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ status: "failed", error: message }],
    });
    for (let check = 0; check < 5; check++) {
      await flush();
      await test.core.idle();
      test.clock.advance(300);
    }
    await test.core.idle();
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ status: "ready", error: null }],
    });
    expect(await versionOf(test, assetId)).not.toBe(HERO_VERSION);
  });

  it("re-anchors a comment another core saved on an older version onto the version on screen", async () => {
    const gate = gatedImporter();
    const cores = await twoCores(heroFiles(), { importers: [gate.importer] });
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    gate.hold("Hero.fbx");
    await a.platform.writeFile(HERO, finer);
    await settleA(cores);
    const latest = await versionOf(a, assetA);
    expect(await versionOf(b, assetB)).toBe(HERO_VERSION);
    const before = writesBy(a, "core-1").length;

    const { commentId } = await b.core.client.execute("comment.create", pinComment(assetB));
    await vi.waitFor(async () => expect((await saved(a)).comments[0]?.anchorVersion).toBe(latest));
    await a.core.idle();
    expect(writesBy(a, "core-1")).toHaveLength(before + 1);
    await b.core.client.execute("asset.close", { assetId: assetB });
    gate.release("Hero.fbx");
    await idle(cores);

    const comment = (await a.core.client.query("review.get", { assetId: assetA })).comments[0];
    expect(comment).toMatchObject({ id: commentId, anchorVersion: latest, anchorState: "moved" });
    await a.core.client.execute("round.copy", { assetId: assetA });
    const data = (await readJson(a.platform, `${HERO_REVIEW}/rounds/round-1/round.json`)) as RoundData;
    expect(data.comments[0]).toMatchObject({ id: commentId, anchorVersion: latest, anchorState: "moved" });
  });

  it("re-anchors a comment another core saved on a later version once a composition's file went back to earlier bytes", async () => {
    const prop = `${ART}/Prop.fbx`;
    const plate = (grid: number) => fakeAsset({ meshes: [{ name: "Plate", grid }] });
    const gate = gatedImporter();
    const cores = await twoCores(
      {
        ...heroFiles(),
        [prop]: plate(3),
        [COMPOSITION]: JSON.stringify({ version: 1, attach: [{ file: "Prop.fbx" }] }),
      },
      { importers: [gate.importer] },
    );
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    const first = await versionOf(a, assetA);
    await a.platform.writeFile(prop, plate(5));
    await settle(cores);
    const later = await versionOf(a, assetA);
    expect(await versionOf(b, assetB)).toBe(later);
    gate.hold("Prop.fbx");
    await a.platform.writeFile(prop, plate(3));
    await settleA(cores);
    expect(await versionOf(a, assetA)).toBe(first);
    expect(await versionOf(b, assetB)).toBe(later);

    const { commentId } = await b.core.client.execute("comment.create", {
      ...pinComment(assetB, "On the plate.", later),
      target: { kind: "surface", mesh: "Prop.fbx//Hero/Plate", vertices: [18, 19, 23], weights: [0.5, 0.25, 0.25] },
    });
    await vi.waitFor(async () => expect((await saved(a)).comments[0]?.anchorVersion).toBe(first));
    await b.core.client.execute("asset.close", { assetId: assetB });
    gate.release("Prop.fbx");
    await idle(cores);

    const comment = (await a.core.client.query("review.get", { assetId: assetA })).comments[0];
    expect(comment).toMatchObject({ id: commentId, anchorVersion: first, anchorState: "moved" });
    await a.core.client.execute("round.copy", { assetId: assetA });
    const data = (await readJson(a.platform, `${HERO_REVIEW}/rounds/round-1/round.json`)) as RoundData;
    const target = data.comments[0]?.target;
    expect(target).toMatchObject({ kind: "point", meshPath: "Prop.fbx//Hero/Plate" });
    expect(Math.max(...(target?.kind === "point" ? target.vertices : [Infinity]))).toBeLessThan(9);
  });

  it("re-anchors a comment another core saved on a later version with moved vertices once the model went back", async () => {
    const moved = fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 3, size: 4 }] });
    const gate = gatedImporter();
    const cores = await twoCores(heroFiles(), { importers: [gate.importer] });
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    await a.platform.writeFile(HERO, moved);
    await settle(cores);
    const later = await versionOf(a, assetA);
    expect(later).not.toBe(HERO_VERSION);
    expect(await versionOf(b, assetB)).toBe(later);
    gate.hold("Hero.fbx");
    a.clock.advance(10);
    await a.platform.writeFile(HERO, fakeAsset(heroSpec));
    await settleA(cores);
    expect(await versionOf(a, assetA)).toBe(HERO_VERSION);
    expect(await versionOf(b, assetB)).toBe(later);

    const { commentId } = await b.core.client.execute("comment.create", {
      ...pinComment(assetB, "On the body.", later),
      context: { ...pinContext, centroid: null },
    });
    await vi.waitFor(async () => expect((await saved(a)).comments[0]?.anchorVersion).toBe(HERO_VERSION));
    await b.core.client.execute("asset.close", { assetId: assetB });
    gate.release("Hero.fbx");
    await idle(cores);

    expect((await saved(a)).comments[0]).toMatchObject({ id: commentId, anchorVersion: HERO_VERSION });
    await a.core.client.execute("round.copy", { assetId: assetA });
    const data = (await readJson(a.platform, `${HERO_REVIEW}/rounds/round-1/round.json`)) as RoundData;
    expect(data.comments[0]).toMatchObject({ id: commentId, anchorVersion: HERO_VERSION });
  });

  it("re-anchors a comment another core saved on an older version once the model, rewritten as it was, settles", async () => {
    const gate = gatedImporter();
    const cores = await twoCores(heroFiles(), { importers: [gate.importer] });
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    gate.hold("Hero.fbx");
    await a.platform.writeFile(HERO, finer);
    await settleA(cores);
    const latest = await versionOf(a, assetA);
    a.clock.advance(10);
    await a.platform.writeFile(HERO, finer);

    const { commentId } = await b.core.client.execute("comment.create", pinComment(assetB));
    await flush();
    await a.core.idle();
    expect((await saved(a)).comments[0]?.anchorVersion).toBe(HERO_VERSION);
    await settleA(cores);
    await b.core.client.execute("asset.close", { assetId: assetB });
    gate.release("Hero.fbx");
    await idle(cores);
    expect((await saved(a)).comments[0]).toMatchObject({ id: commentId, anchorVersion: latest });
    const comment = (await a.core.client.query("review.get", { assetId: assetA })).comments[0];
    expect(comment).toMatchObject({ id: commentId, anchorVersion: latest, anchorState: "moved" });
  });

  it("leaves comments on the version another core read after a texture changed, so neither moves them back", async () => {
    const skin = `${ART}/skin.png`;
    const cores = await twoCores({ ...heroFiles({ ...heroSpec, textures: ["skin.png"] }), [skin]: png });
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    const first = await versionOf(a, assetA);
    await a.core.client.execute("comment.create", pinComment(assetA, "On the skin.", first));
    await idle(cores);
    const writes = countReviewWrites(a);
    await a.platform.writeFile(skin, Uint8Array.of(9, 9));
    const { version: latest } = await a.core.client.execute("asset.reload", { assetId: assetA });
    expect(latest).not.toBe(first);
    await idle(cores);
    expect(writes()).toBe(1);
    expect((await saved(a)).comments[0]?.anchorVersion).toBe(latest);

    await settle(cores);
    expect(await versionOf(b, assetB)).toBe(latest);
    expect(writes()).toBe(1);
    expect((await saved(a)).comments[0]?.anchorVersion).toBe(latest);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
  });

  it("leaves a comment on the version another build read the same model into, so neither core moves it back", async () => {
    const otherBuild: Importer = {
      ...fakeImporter,
      import: (request) => {
        const spec = JSON.parse(new TextDecoder().decode(request.bytes)) as FakeAssetSpec;
        const read = { ...spec, meshes: [{ name: "Body", grid: 4 }], textures: ["Hero.png"] };
        return fakeImporter.import({ ...request, bytes: new TextEncoder().encode(fakeAsset(read)) });
      },
    };
    const cores = await twoCores({ ...heroFiles(), [`${ART}/Hero.png`]: png }, { importers: [otherBuild] });
    const { a, b } = cores;
    await openIn(a);
    const assetB = await openIn(b);
    const other = await versionOf(b, assetB);
    expect(other).not.toBe(HERO_VERSION);

    const writes = countReviewWrites(a);
    const { commentId } = await b.core.client.execute("comment.create", pinComment(assetB, "On the body.", other));
    await workAWhile(cores);
    await settle(cores);
    expect(writes()).toBe(1);
    expect((await saved(a)).comments).toMatchObject([{ id: commentId, anchorVersion: other }]);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
  });

  it("leaves a comment on the version of a core that cannot parse a file of the composition, so neither moves it back", async () => {
    const cores = await twoCores(
      {
        ...heroFiles(),
        [`${ART}/Prop.fbx`]: fakeAsset({ meshes: [{ name: "Plate", grid: 3 }], textures: ["plate.png"] }),
        [`${ART}/plate.png`]: png,
        [COMPOSITION]: JSON.stringify({ version: 1, attach: [{ file: "Prop.fbx" }] }),
      },
      { importers: [cannotReadProp] },
    );
    const { a, b } = cores;
    const assetA = await openIn(a);
    const assetB = await openIn(b);
    const other = await versionOf(b, assetB);
    expect(other).not.toBe(await versionOf(a, assetA));

    const writes = countReviewWrites(a);
    const { commentId } = await b.core.client.execute("comment.create", pinComment(assetB, "On the body.", other));
    await workAWhile(cores);
    await settle(cores);
    expect(writes()).toBe(1);
    expect((await saved(a)).comments).toMatchObject([{ id: commentId, anchorVersion: other }]);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
  });

  it("leaves a comment on a version read with a texture of the composition this core has not read again yet", async () => {
    const skin = `${ART}/skin.png`;
    const cores = await twoCores(
      {
        ...heroFiles({ ...heroSpec, materials: ["Skin"] }),
        [`${ART}/Prop.fbx`]: fakeAsset({ meshes: [{ name: "Plate", grid: 3 }] }),
        [skin]: png,
        [COMPOSITION]: JSON.stringify({
          version: 1,
          attach: [{ file: "Prop.fbx" }],
          materials: { Skin: { baseColor: "skin.png" } },
        }),
      },
      { importers: [cannotReadProp] },
    );
    const { a, b } = cores;
    const assetA = await openIn(a);
    await a.platform.writeFile(skin, Uint8Array.of(9, 9));
    const assetB = await openIn(b);
    const other = await versionOf(b, assetB);
    const shown = await versionOf(a, assetA);
    expect(other).not.toBe(shown);

    const writes = countReviewWrites(a);
    const { commentId } = await b.core.client.execute("comment.create", pinComment(assetB, "On the body.", other));
    await workAWhile(cores);
    expect(writes()).toBe(1);
    expect((await saved(a)).comments).toMatchObject([{ id: commentId, anchorVersion: other }]);
    expect(await versionOf(a, assetA)).toBe(shown);
    await settle(cores);
    await workAWhile(cores);
    expect(await versionOf(a, assetA)).toBe(other);
    expect(writes()).toBeLessThan(3);
    expect((await saved(a)).comments).toMatchObject([{ id: commentId, anchorVersion: other }]);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
  });

  it("does not re-anchor a detached comment again on every change another program saves", async () => {
    const cores = await twoCores();
    const { a } = cores;
    const assetA = await openIn(a);
    await a.core.client.execute("comment.create", pinComment(assetA));
    await a.platform.writeFile(
      HERO,
      fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4, offset: [0, 0, 1] }] }),
    );
    await a.core.client.execute("asset.reload", { assetId: assetA });
    expect((await saved(a)).comments[0]).toMatchObject({ anchorState: "detached", anchorVersion: HERO_VERSION });
    const before = writesBy(a, "core-1").length;
    for (const text of ["Edited once.", "Edited twice."]) {
      const review = await saved(a);
      const [comment] = review.comments;
      if (comment) comment.text = text;
      await a.platform.writeFile(REVIEW_JSON, JSON.stringify(review, null, 2));
      await idle(cores);
    }
    expect(writesBy(a, "core-1")).toHaveLength(before);
    expect((await a.core.client.query("review.get", { assetId: assetA })).comments[0]?.text).toBe("Edited twice.");
  });

  it("loads ten models of one repository whose version records each keep the lock for two seconds", async () => {
    const models = Array.from({ length: 10 }, (_, index) => `${ART}/Model${index}.fbx`);
    const files = Object.fromEntries([
      ["/work/game/.git/HEAD", "ref: refs/heads/main"],
      ...models.map((path) => [path, fakeAsset(heroSpec)]),
    ]);
    const test = await startTestCore(files, { lockTimeoutMs: 15_000 });
    test.platform.beforeWrite = async (path, _op, actor) => {
      if (actor === null || !path.endsWith("/review.json")) return;
      await new Promise<void>((resolve) => test.clock.setTimer(2000, resolve));
    };
    const loads = new Map<string, number>();
    test.core.client.subscribe("asset.updated", ({ asset }) => {
      if (asset.status === "loading") loads.set(asset.assetId, (loads.get(asset.assetId) ?? 0) + 1);
    });
    for (const path of models) await test.window.client.execute("asset.open", { path });
    for (let step = 0; step < 400; step++) {
      await flush();
      const { assets } = await test.core.client.query("asset.list", {});
      if (assets.every((asset) => asset.status === "ready")) break;
      test.clock.advance(100);
    }
    await test.core.idle();
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets.map((asset) => asset.status)).toEqual(models.map(() => "ready"));
    expect(assets.map((asset) => loads.get(asset.assetId))).toEqual(models.map(() => 1));
  });
});

describe("the comments a review another Arcue saved moves onto the version on screen", () => {
  /** Lets the core's checks of changed files run, so it shows the latest version and has saved its re-anchor. */
  async function settleOne(test: TestCore): Promise<void> {
    for (let check = 0; check < 10; check++) {
      await flush();
      await test.core.idle();
      test.clock.advance(300);
    }
  }

  /** Saves the review as another Arcue would, and lets the core adopt it. */
  async function saveElsewhere(test: TestCore, review: ReviewFile): Promise<void> {
    const revision = (await saved(test)).revision + 1;
    await test.platform.writeFile(REVIEW_JSON, serializeReview({ ...review, revision }));
    await settleOne(test);
  }

  /** Another comment id of the same form. */
  const otherId = (id: string) => `${id.slice(0, -1)}${id.endsWith("0") ? "1" : "0"}`;

  it("moves a pin saved on an older version with the same mesh bytes, as after a texture changed", async () => {
    const skin = `${ART}/skin.png`;
    const test = await startTestCore({ ...heroFiles({ ...heroSpec, textures: ["skin.png"] }), [skin]: png });
    const assetId = await openAsset(test);
    const first = await versionOf(test, assetId);
    await test.core.client.execute("comment.create", pinComment(assetId, "On the skin.", first));
    const [onFirst] = (await saved(test)).comments;
    if (!onFirst) throw new Error("The comment was not saved.");
    await test.platform.writeFile(skin, Uint8Array.of(9, 9));
    await settleOne(test);
    const latest = await versionOf(test, assetId);
    expect(latest).not.toBe(first);
    const review = await saved(test);
    expect(review.comments[0]?.anchorVersion).toBe(latest);
    const writes = writesBy(test, "core-1").length;

    await saveElsewhere(test, { ...review, comments: [onFirst] });

    expect((await saved(test)).comments).toMatchObject([{ id: onFirst.id, anchorVersion: latest }]);
    expect(writesBy(test, "core-1")).toHaveLength(writes + 1);
    expect(test.errors).toEqual([]);
  });

  it("moves only the pins that should move, and leaves one on a later version with the same mesh bytes", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    const [onOlder] = (await saved(test)).comments;
    if (!onOlder) throw new Error("The comment was not saved.");
    await test.platform.writeFile(HERO, finer);
    await settleOne(test);
    const shown = await versionOf(test, assetId);
    const review = await saved(test);
    const [moved] = review.comments;
    const record = review.versions.find((version) => version.id === shown);
    if (!moved || !record) throw new Error("The version on screen was not recorded.");
    const later = { ...record, id: "0123456789abcdef" };
    const onLater = {
      ...moved,
      id: otherId(moved.id),
      text: "On the later version.",
      anchorVersion: later.id,
      context: { ...moved.context, screenshot: null },
    };

    await saveElsewhere(test, {
      ...review,
      versions: [...review.versions, later],
      comments: [onOlder, onLater],
      queue: [onOlder.id, onLater.id],
    });

    const comments = (await saved(test)).comments;
    expect(comments[0]).toMatchObject({ id: onOlder.id, anchorVersion: shown });
    expect(comments[1]).toEqual(onLater);
    expect(test.errors).toEqual([]);
  });

  it("leaves a pin on a later version whose only other file this core's version does not record", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    const review = await saved(test);
    const [comment] = review.comments;
    const record = review.versions.find((version) => version.id === HERO_VERSION);
    if (!comment || !record) throw new Error("The version on screen was not recorded.");
    const prop = { file: "Prop.fbx", id: "1234567", hash: "0123456789abcdef", size: 42 };
    const later = { ...record, id: "fedcba9876543210", files: [...(record.files ?? []), prop] };
    const onLater = { ...comment, anchorVersion: later.id };
    const writes = writesBy(test, "core-1").length;

    await saveElsewhere(test, { ...review, versions: [...review.versions, later], comments: [onLater] });

    expect((await saved(test)).comments).toEqual([onLater]);
    expect(writesBy(test, "core-1")).toHaveLength(writes);
    expect(test.errors).toEqual([]);
  });

  it("starts no re-anchor for a comment without a pin saved on an older version", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", looseComment(assetId));
    const [onOlder] = (await saved(test)).comments;
    if (!onOlder) throw new Error("The comment was not saved.");
    await test.platform.writeFile(HERO, finer);
    await settleOne(test);
    const review = await saved(test);
    const loose = { ...onOlder, id: otherId(onOlder.id), text: "Another one.", anchorVersion: HERO_VERSION };
    const locks = () => test.platform.log.filter((entry) => entry.actor === "core-1" && entry.op === "lock").length;
    const before = locks();

    await saveElsewhere(test, {
      ...review,
      comments: [...review.comments, loose],
      queue: [...review.queue, loose.id],
    });

    expect((await saved(test)).comments.at(-1)).toEqual(loose);
    expect(locks()).toBe(before);
    expect(test.errors).toEqual([]);
  });
});

describe("a reviews lock another holder keeps", () => {
  it("leaves a version record waiting to try again, longer each time, and records it once the lock is free", async () => {
    const test = await startTestCore(heroFiles(), { lockTimeoutMs: 15_000 });
    const key = test.platform.lockKey("/work/game", "reviews");
    const waiting = () => test.platform.lockWaiters(key);
    const timeOut = async () => {
      await vi.waitFor(() => expect(waiting()).toBe(1));
      test.clock.advance(15_000);
      await flush();
      await test.core.idle();
      expect(waiting()).toBe(0);
    };
    const retriesAfter = async (ms: number) => {
      test.clock.advance(ms - 1);
      await flush();
      expect(waiting()).toBe(0);
      test.clock.advance(1);
      await vi.waitFor(() => expect(waiting()).toBe(1));
    };
    let unlock = await test.platform.lock("/work/game", "reviews");
    const { assetId } = await test.window.client.execute("asset.open", { path: HERO });
    await timeOut();
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, status: "loading", error: null }],
    });
    expect(test.clock.pendingTimers).toBe(1);
    await retriesAfter(1000);
    await timeOut();
    await retriesAfter(2000);

    await unlock();
    await flush();
    await test.core.idle();
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, status: "ready", version: HERO_VERSION }],
    });
    expect(test.clock.pendingTimers).toBe(0);

    unlock = await test.platform.lock("/work/game", "reviews");
    await test.platform.writeFile(HERO, finer);
    for (let check = 0; check < 10 && waiting() === 0; check++) {
      await flush();
      test.clock.advance(300);
    }
    await timeOut();
    await retriesAfter(1000);
    await timeOut();
    expect(test.clock.pendingTimers).toBe(1);
    await test.core.client.execute("asset.close", { assetId });
    expect(test.clock.pendingTimers).toBe(0);
    await unlock();
  });

  it("re-anchors a comment another Arcue saved on an older version once the lock it timed out on is free", async () => {
    const test = await startTestCore(heroFiles(), { lockTimeoutMs: 15_000 });
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    const [onOlder] = (await saved(test)).comments;
    await test.platform.writeFile(HERO, finer);
    for (let check = 0; check < 10; check++) {
      await flush();
      await test.core.idle();
      test.clock.advance(300);
    }
    const latest = await versionOf(test, assetId);
    expect(latest).not.toBe(HERO_VERSION);
    const review = await saved(test);
    expect(review.comments[0]?.anchorVersion).toBe(latest);
    if (!onOlder) throw new Error("The comment was not saved.");

    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    const writes = writesBy(test, "core-1").length;
    await test.platform.writeFile(
      REVIEW_JSON,
      serializeReview({ ...review, revision: review.revision + 1, comments: [onOlder] }),
    );
    await vi.waitFor(() => expect(test.platform.lockWaiters(key)).toBe(1));
    test.clock.advance(15_000);
    await flush();
    await test.core.idle();
    await unlock();
    for (let check = 0; check < 5; check++) {
      test.clock.advance(1000);
      await flush();
      await test.core.idle();
    }

    expect((await saved(test)).comments[0]).toMatchObject({ id: onOlder.id, anchorVersion: latest });
    expect(writesBy(test, "core-1")).toHaveLength(writes + 1);
    expect(test.errors).toEqual([]);
  });

  it("fails a load whose parse times out instead of trying it again", async () => {
    const gate = gatedImporter();
    gate.hold("Hero.fbx");
    const test = await startTestCore(heroFiles());
    const other = await startSecondCore(test, { importers: [gate.importer], core: { importTimeoutMs: 1000 } });
    const { assetId } = await other.window.client.execute("asset.open", { path: HERO });
    await vi.waitFor(() => expect(test.clock.pendingTimers).toBe(1));
    test.clock.advance(1000);
    await flush();
    await other.core.idle();
    await expect(other.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, status: "failed", error: '"import.run" got no response within 1000 ms.' }],
    });
    expect(test.clock.pendingTimers).toBe(0);
    gate.release("Hero.fbx");
  });

  it("follows a renamed model later instead of reporting it not found", async () => {
    const test = await startTestCore(heroFiles(), { lockTimeoutMs: 15_000 });
    const assetId = await openAsset(test);
    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    await test.platform.rename(HERO, STRIKER);
    for (let check = 0; check < 20 && test.platform.lockWaiters(key) === 0; check++) {
      await flush();
      test.clock.advance(300);
    }
    expect(test.platform.lockWaiters(key)).toBe(1);
    test.clock.advance(15_000);
    await flush();
    await test.core.idle();
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: HERO, error: null }],
    });

    await unlock();
    test.clock.advance(1000);
    for (let check = 0; check < 5; check++) {
      await flush();
      await test.core.idle();
    }
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: STRIKER, status: "ready", error: null }],
    });
    await expect(test.platform.exists(`${STRIKER_REVIEW}/review.json`)).resolves.toBe(true);
  });
});

describe("a model renamed while a version is parsed", () => {
  it("follows the model to its new name when it was renamed during the first parse", async () => {
    const gate = gatedImporter();
    const cores = await twoCores(heroFiles(), { importers: [gate.importer] });
    const { a, b } = cores;
    gate.hold("Hero.fbx");
    const { assetId } = await b.window.client.execute("asset.open", { path: HERO });
    await vi.waitFor(() => expect(a.platform.parsed).toEqual(["Hero.fbx"]));
    await a.platform.rename(HERO, STRIKER);
    gate.release("Hero.fbx");
    await settle(cores);

    await expect(b.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: STRIKER, status: "ready", version: HERO_VERSION, error: null }],
    });
    await expect(a.platform.exists(`${STRIKER_REVIEW}/review.json`)).resolves.toBe(true);
    await expect(a.platform.exists(HERO_REVIEW)).resolves.toBe(false);
    expect(b.errors).toEqual([]);
  });

  it("follows the model to its new name when it was renamed while a later version was parsed", async () => {
    const gate = gatedImporter();
    const cores = await twoCores(heroFiles(), { importers: [gate.importer] });
    const { a, b } = cores;
    const assetId = await openIn(b);
    const { commentId } = await b.core.client.execute("comment.create", pinComment(assetId));
    gate.hold("Hero.fbx");
    await a.platform.writeFile(HERO, finer);
    for (let check = 0; check < 20 && a.platform.parsed.length < 2; check++) {
      await flush();
      a.clock.advance(300);
    }
    expect(a.platform.parsed).toEqual(["Hero.fbx", "Hero.fbx"]);
    await a.platform.rename(HERO, STRIKER);
    gate.release("Hero.fbx");
    await settle(cores);

    await expect(b.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: STRIKER, status: "ready", error: null }],
    });
    const version = await versionOf(b, assetId);
    expect(version).not.toBe(HERO_VERSION);
    const review = await saved(a, `${STRIKER_REVIEW}/review.json`);
    expect(review.comments).toMatchObject([{ id: commentId, anchorVersion: version }]);
    await expect(a.platform.exists(HERO_REVIEW)).resolves.toBe(false);
    expect(b.errors).toEqual([]);
  });
});

describe("a reviews lock another holder keeps while a file is opened or relinked", () => {
  it("offers the earlier review of a renamed model instead of taking it, and leaves it where it is", async () => {
    const test = await startTestCore(heroFiles(), { lockTimeoutMs: 15_000 });
    const first = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(first));
    await test.core.client.execute("asset.close", { assetId: first });
    await test.platform.rename(HERO, STRIKER);
    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    const opening = test.window.client.execute("asset.open", { path: STRIKER });
    await vi.waitFor(() => expect(test.platform.lockWaiters(key)).toBe(1));
    test.clock.advance(15_000);
    const { assetId } = await opening;
    await unlock();
    await flush();
    await test.core.idle();
    await expect(test.core.client.query("review.candidates", { assetId })).resolves.toMatchObject({
      candidates: [{ path: HERO }],
    });
    await expect(test.platform.exists(REVIEW_JSON)).resolves.toBe(true);
    expect(test.errors).toEqual([]);
  });

  it("opens a renamed model with the review another core gave it while the open waited for the lock", async () => {
    const test = await startTestCore(heroFiles());
    const first = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(first));
    await test.core.client.execute("asset.close", { assetId: first });
    await test.platform.rename(HERO, STRIKER);
    const offered: unknown[] = [];
    test.core.client.subscribe("review.offered", (payload) => offered.push(payload));
    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    const opening = test.window.client.execute("asset.open", { path: STRIKER });
    await vi.waitFor(() => expect(test.platform.lockWaiters(key)).toBe(1));
    await test.platform.writeFile(
      `${STRIKER_REVIEW}/review.json`,
      serializeReview({ ...emptyReview("Assets/Art/Striker.fbx"), revision: 7 }),
    );
    await unlock();
    const { assetId } = await opening;
    await test.core.idle();
    expect(offered).toEqual([]);
    await expect(test.core.client.query("review.candidates", { assetId })).resolves.toEqual({ candidates: [] });
    expect((await saved(test)).comments).toHaveLength(1);
    const review = await test.core.client.query("review.get", { assetId });
    expect(review).toMatchObject({ comments: [], revision: 8 });
    expect(test.errors).toEqual([]);
  });

  it("opens a renamed model without an error or offer when the earlier review goes to a third model meanwhile", async () => {
    const third = `${ART}/Third.fbx`;
    const thirdReview = "/work/game/.arcue/reviews/Assets/Art/Third.fbx";
    const test = await startTestCore(heroFiles());
    const first = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(first));
    await test.core.client.execute("asset.close", { assetId: first });
    const hero = await test.platform.readText(HERO);
    await test.platform.rename(HERO, STRIKER);
    const offered: unknown[] = [];
    test.core.client.subscribe("review.offered", (payload) => offered.push(payload));
    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    const opening = test.window.client.execute("asset.open", { path: STRIKER });
    await vi.waitFor(() => expect(test.platform.lockWaiters(key)).toBe(1));
    await test.platform.writeFile(third, hero);
    await test.platform.rename(HERO_REVIEW, thirdReview);
    await unlock();
    const { assetId } = await opening;
    await test.core.idle();

    expect(test.errors).toEqual([]);
    expect(offered).toEqual([]);
    await expect(test.core.client.query("review.candidates", { assetId })).resolves.toEqual({ candidates: [] });
    await expect(test.core.client.query("review.get", { assetId })).resolves.toMatchObject({ comments: [] });
    expect((await saved(test, `${thirdReview}/review.json`)).comments).toHaveLength(1);
  });

  it("keeps the earlier review where it is when its model comes back while a relink waits for the lock", async () => {
    const test = await startTestCore(heroFiles());
    const first = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(first));
    await test.core.client.execute("asset.close", { assetId: first });
    const hero = await test.platform.readText(HERO);
    await test.platform.remove(HERO);
    await test.platform.writeFile(STRIKER, coarser);
    const assetId = await openAsset(test, STRIKER);
    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    const relink = test.core.client.execute("review.relink", { assetId, from: HERO }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(test.platform.lockWaiters(key)).toBe(1));
    await test.platform.writeFile(HERO, hero);
    await unlock();
    await expect(relink).resolves.toMatchObject({
      code: "conflict",
      message: "Hero.fbx still exists, so its review stays with it.",
    });
    expect((await saved(test)).comments).toHaveLength(1);
    await expect(test.platform.exists(`${STRIKER_REVIEW}/review.json`)).resolves.toBe(true);
  });

  it("keeps the earlier review where it is when its model comes back while an open waits for the lock", async () => {
    const test = await startTestCore(heroFiles());
    const first = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(first));
    await test.core.client.execute("asset.close", { assetId: first });
    const hero = await test.platform.readText(HERO);
    await test.platform.rename(HERO, STRIKER);
    const relinked: unknown[] = [];
    test.core.client.subscribe("review.relinked", (payload) => relinked.push(payload));
    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    const opening = test.window.client.execute("asset.open", { path: STRIKER });
    await vi.waitFor(() => expect(test.platform.lockWaiters(key)).toBe(1));
    await test.platform.writeFile(HERO, hero);
    await unlock();
    const { assetId } = await opening;
    await test.core.idle();

    expect(relinked).toEqual([]);
    expect((await saved(test)).comments).toHaveLength(1);
    await expect(test.core.client.query("review.get", { assetId })).resolves.toMatchObject({ comments: [] });
    expect((await saved(test, `${STRIKER_REVIEW}/review.json`)).comments).toEqual([]);
    expect(test.errors).toEqual([]);
  });

  it("looks for a lost file of the composition again once the lock is free", async () => {
    const run = `${ART}/Anim/Run.fbx`;
    const test = await startTestCore(
      {
        ...heroFiles(),
        [run]: animation("Run"),
        [COMPOSITION]: JSON.stringify({ version: 1, animations: ["Anim/Run.fbx"] }),
      },
      { lockTimeoutMs: 15_000 },
    );
    const assetId = await openAsset(test);
    await test.platform.rename(run, `${ART}/Anim/Running.fbx`);
    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    const reload = test.core.client.execute("asset.reload", { assetId }).catch((error: unknown) => error);
    for (let waiter = 0; waiter < 2; waiter++) {
      await vi.waitFor(() => expect(test.platform.lockWaiters(key)).toBe(1));
      test.clock.advance(15_000);
    }
    await expect(reload).resolves.toMatchObject({ code: "timeout" });
    await expect(readJson(test.platform, COMPOSITION)).resolves.toEqual({ version: 1, animations: ["Anim/Run.fbx"] });

    await unlock();
    for (let check = 0; check < 5; check++) {
      test.clock.advance(1000);
      await flush();
      await test.core.idle();
    }
    await expect(readJson(test.platform, COMPOSITION)).resolves.toEqual({
      version: 1,
      animations: ["Anim/Running.fbx"],
    });
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, status: "ready" }],
    });
    expect(test.errors).toEqual([]);
  });
});

/** A small generator of numbers in [0, 1) from a seed, so a failing run can be repeated. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const variants: readonly string[] = [
  fakeAsset(heroSpec),
  finer,
  fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 3, offset: [0, 0, 0.01] }] }),
];

/** What the commands of a run answered, each numbered in the order the answers came. */
interface Acknowledged {
  creates: { id: string; side: number; answered: number }[];
  deletes: Set<string>;
  /**
   * The comments gone after each undo that changed something, of those there before it or answered while it ran, which
   * that undo may have removed.
   */
  undone: { id: string; side: number }[];
}

/** One run of random commands from both cores, with random pauses in their writes, then a check of every invariant. */
async function fuzzRun(seed: number): Promise<void> {
  const random = seeded(seed);
  const chance = (share: number) => random() < share;
  const pick = <Item>(items: readonly Item[]): Item => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error("Nothing to pick from.");
    return item;
  };
  const cores = await twoCores(animated());
  const { a, b } = cores;
  const assetA = await openIn(a);
  const sides = [
    { ...a, assetId: assetA },
    { ...b, assetId: await openIn(b) },
  ];
  const revisions: number[] = [];
  let pausing = true;
  a.platform.beforeWrite = async (path, _op, actor) => {
    if (actor === null) return;
    if (path === REVIEW_JSON && (await a.platform.exists(path))) revisions.push((await saved(a)).revision);
    if (pausing && chance(0.3)) for (let turn = Math.floor(random() * 25); turn > 0; turn--) await Promise.resolve();
  };
  const acknowledged: Acknowledged = { creates: [], deletes: new Set(), undone: [] };
  let answers = 0;
  const commentIds = async (side: Side, assetId: string): Promise<string[]> =>
    (await side.core.client.query("review.get", { assetId })).comments.map((comment) => comment.id);
  const anyComment = async (side: Side, assetId: string): Promise<string> => {
    const ids = await commentIds(side, assetId);
    return pick(ids.length > 0 ? ids : ["c0"]);
  };
  const failures: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  for (const [index, side] of sides.entries()) {
    for (const text of ["Seeded pin.", "Seeded note."]) {
      const input = text === "Seeded pin." ? pinComment(side.assetId, text) : looseComment(side.assetId, text);
      const { commentId } = await side.core.client.execute("comment.create", input);
      acknowledged.creates.push({ id: commentId, side: index, answered: ++answers });
    }
  }

  for (let at = 0; at < 30; at++) {
    const index = chance(0.5) ? 0 : 1;
    const side = sides[index];
    if (!side) throw new Error("No such core.");
    const { assetId } = side;
    const client = side.core.client;
    const operation = pick([
      "create",
      "create",
      "update",
      "delete",
      "undo",
      "redo",
      "compose",
      "round",
      "settings",
      "rewrite",
      "tick",
    ] as const);
    const step = async (): Promise<void> => {
      switch (operation) {
        case "create": {
          const { version } = await client.query("scene.get", { assetId });
          const input = chance(0.5)
            ? pinComment(assetId, `Pin ${at}`, version)
            : looseComment(assetId, `Loose ${at}`, version);
          const { commentId } = await client.execute("comment.create", input);
          acknowledged.creates.push({ id: commentId, side: index, answered: ++answers });
          return;
        }
        case "update": {
          const commentId = await anyComment(side, assetId);
          await client.execute(
            "comment.update",
            chance(0.5) ? { assetId, commentId, text: `Update ${at}` } : { assetId, commentId, screenshot: png },
          );
          return;
        }
        case "delete": {
          const commentId = await anyComment(side, assetId);
          await client.execute("comment.delete", { assetId, commentId });
          acknowledged.deletes.add(commentId);
          return;
        }
        case "undo": {
          const before = await commentIds(side, assetId);
          const answered = acknowledged.creates.length;
          const { changed } = await client.execute("review.undo", { assetId });
          if (!changed) return;
          const after = new Set(await commentIds(side, assetId));
          const meanwhile = acknowledged.creates.slice(answered).map((create) => create.id);
          for (const id of [...before, ...meanwhile]) if (!after.has(id)) acknowledged.undone.push({ id, side: index });
          return;
        }
        case "redo":
          await client.execute("review.redo", { assetId });
          return;
        case "compose":
          await client.execute("composition.addFile", {
            assetId,
            file: pick(["Wave.fbx", "Jump.fbx"]),
            role: "animation",
          });
          return;
        case "round":
          await client.execute("round.copy", { assetId });
          return;
        case "settings":
          await client.execute(
            "settings.set",
            chance(0.5) ? { coordinates: pick(["y-up", "z-up-blender"] as const) } : { authorName: `Author ${at}` },
          );
          return;
        case "rewrite":
          await a.platform.writeFile(HERO, pick(variants));
          return;
        case "tick":
          a.clock.advance(300);
          return;
      }
    };
    pending.push(step().catch((error: unknown) => failures.push(error)));
    if (chance(0.5)) for (let turn = Math.floor(random() * 10); turn > 0; turn--) await Promise.resolve();
    if (chance(0.2)) await flush();
  }
  await Promise.all(pending);
  pausing = false;
  await settle(cores);

  const review = await saved(a);
  const ids = new Set(review.comments.map((comment) => comment.id));
  for (const create of acknowledged.creates) {
    const undone = acknowledged.undone.some((undo) => undo.side === create.side && undo.id === create.id);
    if (!ids.has(create.id) && !acknowledged.deletes.has(create.id) && !undone) {
      throw new Error(`Comment ${create.id}, the answer of command ${create.answered}, is gone.`);
    }
  }
  revisions.push(review.revision);
  expect(revisions).toEqual(revisions.map((_, index) => (revisions[0] ?? 0) + index));
  for (const comment of review.comments) {
    if (comment.context.screenshot === null) continue;
    await expect(a.platform.exists(`${HERO_REVIEW}/${comment.context.screenshot}`)).resolves.toBe(true);
  }
  const shown = await Promise.all(sides.map((side) => side.core.client.query("asset.list", {})));
  for (const { assets } of shown) expect(assets.map((asset) => asset.status)).toEqual(["ready"]);
  const [versionA, versionB] = await Promise.all(sides.map((side) => versionOf(side, side.assetId)));
  expect(versionB).toBe(versionA);
  const { version: onDisk } = await a.core.client.execute("asset.reload", { assetId: assetA });
  expect(onDisk).toBe(versionA);
  for (const comment of review.comments) {
    if (comment.target !== null) expect(comment.anchorVersion).toBe(onDisk);
  }
  for (const failure of failures) {
    expect(failure).toMatchObject({ code: expect.stringMatching(/^(conflict|not-found|unavailable)$/) });
    expect(failure).not.toMatchObject({ message: "review.json keeps changing on disk; try again." });
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  expect(unlockedWrites(a.platform)).toEqual([]);
  expect(a.platform.heldLocks()).toEqual([]);
}

describe("two cores under random interleavings", () => {
  it("keep every comment, revision, screenshot, anchor and lock right in seeded runs", async () => {
    for (let run = 0; run < 50; run++) {
      const seed = 0x51ed + run * 7919;
      try {
        await fuzzRun(seed);
      } catch (error) {
        throw new Error(`The run with seed ${seed} failed: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
    }
  }, 120_000);
});
