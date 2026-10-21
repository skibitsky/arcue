import type { SavedTab, WindowTabs } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import { describe, expect, it, vi } from "vitest";
import { STONE_RESONATOR_PATH } from "../../dev/sample-data";
import { setup } from "../test-helpers";
import { TabRestore } from "./tab-restore";

const STONE = STONE_RESONATOR_PATH;
const CRATE = "/work/Crate.fbx";
const GOLEM = "/work/Golem.fbx";

function saved(paths: readonly string[], active: number | null): WindowTabs {
  return { tabs: paths.map((path) => ({ path, view: null })), active };
}

/** A window's store on the fake core, with a TabRestore that reopens tabs through asset.open. */
function restoring() {
  const context = setup();
  const { client, store } = context;
  const restore = new TabRestore(store, client);
  const open = async (tab: SavedTab) => {
    await client.execute("asset.open", { path: tab.path });
  };
  const pathOf = (id: string | null) => (id === null ? null : (store.session(id)?.state.get().summary.path ?? null));
  const paths = () => store.state.get().tabs.map((tab) => pathOf(tab.id));
  const activePath = () => pathOf(store.state.get().active);
  const savedPaths = () => restore.tabs().tabs.map((tab) => tab.path);
  return { ...context, restore, open, paths, activePath, savedPaths };
}

describe("TabRestore", () => {
  it("reopens the saved tabs in order and activates the saved active tab, which wins while tabs still open", async () => {
    const { restore, store, open, paths, activePath, savedPaths } = restoring();
    restore.pending(saved([STONE, CRATE, GOLEM], 1));
    expect(restore.tabs()).toEqual(saved([STONE, CRATE, GOLEM], 1));

    const generation = restore.detach();
    let whileOpening: WindowTabs | null = null;
    await restore.reopen(generation, {
      open: async (tab) => {
        if (tab.path === GOLEM) whileOpening = restore.tabs();
        await open(tab);
      },
    });
    expect(whileOpening).toMatchObject({ tabs: [{ path: STONE }, { path: CRATE }, { path: GOLEM }], active: 1 });
    expect(paths()).toEqual([STONE, CRATE, GOLEM]);
    expect(activePath()).toBe(CRATE);
    expect(savedPaths()).toEqual([STONE, CRATE, GOLEM]);
    expect(restore.tabs().active).toBe(1);

    const [first] = store.state.get().tabs;
    store.moveTab(first?.id ?? "", 2);
    store.activate(first?.id ?? "");
    const next = restore.detach();
    expect(store.state.get().tabs).toEqual([]);
    expect(restore.tabs()).toMatchObject({ tabs: [{ path: CRATE }, { path: GOLEM }, { path: STONE }], active: 2 });
    await restore.reopen(next, { open });
    expect(paths()).toEqual([CRATE, GOLEM, STONE]);
    expect(activePath()).toBe(STONE);
  });

  it("keeps the tabs not open yet when the generation changes during an open that fails or succeeds, or the connection drops", async () => {
    const { client, restore, store, open, paths, activePath, savedPaths } = restoring();
    const notify = vi.spyOn(store, "notify");
    restore.pending(saved([STONE, CRATE, GOLEM], 2));
    const first = restore.detach();
    let second: number | null = null;
    await restore.reopen(first, {
      open: async (tab) => {
        if (tab.path === CRATE) {
          second = restore.detach();
          throw new ArcueError("unavailable", "The connection to the core is gone.");
        }
        await open(tab);
      },
    });
    expect(second).toBe(restore.generation);
    expect(paths()).toEqual([]);
    expect(savedPaths()).toEqual([STONE, CRATE, GOLEM]);
    expect(restore.tabs().active).toBe(2);

    let third: number | null = null;
    await restore.reopen(second ?? 0, {
      open: async (tab) => {
        if (tab.path === CRATE) {
          third = restore.detach();
          return;
        }
        await open(tab);
      },
    });
    expect(third).toBe(restore.generation);
    expect(paths()).toEqual([]);
    expect(savedPaths()).toEqual([STONE, CRATE, GOLEM]);
    expect(restore.tabs().active).toBe(2);

    await restore.reopen(third ?? 0, {
      open: async (tab) => {
        if (tab.path === GOLEM) {
          client.setConnectionState("reconnecting");
          throw new ArcueError("unavailable", "The connection to the core is gone.");
        }
        await open(tab);
      },
    });
    expect(paths()).toEqual([STONE, CRATE]);
    expect(savedPaths()).toEqual([STONE, CRATE, GOLEM]);
    expect(restore.tabs().active).toBe(2);

    client.setConnectionState("connected");
    await restore.reopen(restore.detach(), { open });
    expect(paths()).toEqual([STONE, CRATE, GOLEM]);
    expect(activePath()).toBe(GOLEM);
    expect(notify).not.toHaveBeenCalled();
  });

  it("activates the saved active tab after adopting the other assets the core holds, and keeps it when adopting stops", async () => {
    const { client, restore, open, paths, activePath } = restoring();
    restore.pending(saved([STONE, CRATE], 0));
    let whileAdopting: WindowTabs | null = null;
    await restore.reopen(restore.detach(), {
      open,
      adopt: async () => {
        await client.execute("asset.open", { path: GOLEM });
        whileAdopting = restore.tabs();
      },
    });
    expect(whileAdopting).toMatchObject({ tabs: [{ path: STONE }, { path: CRATE }, { path: GOLEM }], active: 0 });
    expect(paths()).toEqual([STONE, CRATE, GOLEM]);
    expect(activePath()).toBe(STONE);

    let next: number | null = null;
    await restore.reopen(restore.detach(), {
      open,
      adopt: async () => {
        next = restore.detach();
      },
    });
    expect(paths()).toEqual([]);
    expect(restore.tabs()).toMatchObject({ tabs: [{ path: STONE }, { path: CRATE }, { path: GOLEM }], active: 0 });
    await restore.reopen(next ?? 0, { open });
    expect(paths()).toEqual([STONE, CRATE, GOLEM]);
    expect(activePath()).toBe(STONE);
  });

  it("drops quiet errors without a toast and alerts the others, dropping both tabs", async () => {
    const { restore, store, open, paths, activePath, savedPaths } = restoring();
    const notify = vi.spyOn(store, "notify");
    restore.pending(saved([CRATE, STONE, GOLEM], 0));
    await restore.reopen(restore.detach(), {
      open: async (tab) => {
        if (tab.path === CRATE) throw new ArcueError("conflict", "Crate.fbx is open in another session's view.");
        if (tab.path === GOLEM) throw new ArcueError("not-found", `${GOLEM} does not exist.`);
        await open(tab);
      },
      quiet: (error) => error instanceof ArcueError && error.code === "conflict",
    });
    expect(notify.mock.calls).toEqual([[{ message: `${GOLEM} does not exist.`, kind: "alert" }]]);
    expect(paths()).toEqual([STONE]);
    expect(activePath()).toBe(STONE);
    expect(savedPaths()).toEqual([STONE]);
    expect(restore.tabs().active).toBe(0);

    notify.mockClear();
    restore.pending(saved([CRATE], 0));
    await restore.reopen(restore.generation, {
      open: async () => {
        throw new ArcueError("conflict", "Crate.fbx is open in another session's view.");
      },
    });
    expect(notify.mock.calls).toEqual([[{ message: "Crate.fbx is open in another session's view.", kind: "alert" }]]);
  });
});
