import { separateComposition } from "@arcue/protocol";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { modShortcut } from "../format";
import type { AssetSession } from "../store/asset-session";
import { useSelect } from "../store/observable";
import type { TabEntry, WorkspaceStore } from "../store/workspace-store";
import { Tip } from "./controls";
import { Icon } from "./Icon";

/** The drag data type of a tab; its value is the asset id. */
export const TAB_DRAG_TYPE = "application/x-arcue-tab";

export interface TabDragHandlers {
  /** A tab drag started. The host can track it to tear the tab off into a new window. */
  onTabDragStart?: (assetId: string, event: DragEvent<HTMLElement>) => void;
  /** A tab drag ended. `event.dataTransfer.dropEffect` is "none" when no strip took the tab. */
  onTabDragEnd?: (assetId: string, event: DragEvent<HTMLElement>) => void;
  /** A tab from another window was dropped on this strip at `index`. */
  onTabDrop?: (assetId: string, index: number, event: DragEvent<HTMLElement>) => void;
}

export function TitleBar({
  store,
  windowControls,
  onNewTab,
  drag,
}: {
  store: WorkspaceStore;
  windowControls?: ReactNode;
  onNewTab: () => void;
  drag: TabDragHandlers;
}) {
  const tabs = useSelect(store.state, (state) => state.tabs);
  const active = useSelect(store.state, (state) => state.active);

  const dropIndex = (event: DragEvent<HTMLElement>) => {
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>("[role='tab']")];
    const index = elements.findIndex((element) => {
      const rect = element.getBoundingClientRect();
      return event.clientX < rect.left + rect.width / 2;
    });
    return index === -1 ? elements.length : index;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((tab) => tab.id === active);
    if (current === -1 || !(event.target instanceof Element) || event.target.getAttribute("role") !== "tab") return;
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? current === last
          ? 0
          : current + 1
        : event.key === "ArrowLeft"
          ? current === 0
            ? last
            : current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    const tab = next === null ? undefined : tabs[next];
    if (!tab) return;
    event.preventDefault();
    store.activate(tab.id);
    event.currentTarget.ownerDocument.getElementById(tabDomId(tab.id))?.focus();
  };

  return (
    <header className="titlebar">
      {windowControls}
      <div className="tabs">
        <div
          className="tab-list"
          role="tablist"
          aria-label="Open assets"
          onKeyDown={onKeyDown}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            const assetId = event.dataTransfer.getData(TAB_DRAG_TYPE);
            if (!assetId) return;
            event.preventDefault();
            const index = dropIndex(event);
            if (store.state.get().tabs.some((tab) => tab.id === assetId)) store.moveTab(assetId, index);
            else drag.onTabDrop?.(assetId, index, event);
          }}
        >
          {tabs.map((tab) => (
            <Tab key={tab.id} store={store} tab={tab} active={tab.id === active} drag={drag} />
          ))}
        </div>
        <Tip label="New tab" shortcut={modShortcut("T")} side="bottom">
          <button type="button" className="tab-add" aria-label="New tab" onClick={onNewTab}>
            <Icon name="plus" />
          </button>
        </Tip>
      </div>
    </header>
  );
}

/** The DOM id of a tab and of the panel it controls. */
export function tabDomId(id: string): string {
  return `arcue-tab-${id.replace(/[^\w-]/g, "-")}`;
}

export function panelDomId(id: string): string {
  return `arcue-panel-${id.replace(/[^\w-]/g, "-")}`;
}

function Tab({
  store,
  tab,
  active,
  drag,
}: {
  store: WorkspaceStore;
  tab: TabEntry;
  active: boolean;
  drag: TabDragHandlers;
}) {
  const session = tab.kind === "asset" ? store.session(tab.id) : null;
  return (
    <div className={`tab${active ? " is-active" : ""}`}>
      <button
        type="button"
        role="tab"
        id={tabDomId(tab.id)}
        className="tab-main"
        aria-selected={active}
        aria-controls={panelDomId(tab.id)}
        tabIndex={active ? 0 : -1}
        draggable={tab.kind === "asset"}
        onClick={() => store.activate(tab.id)}
        onDragStart={(event) => {
          if (tab.kind !== "asset") return;
          event.dataTransfer.setData(TAB_DRAG_TYPE, tab.id);
          event.dataTransfer.effectAllowed = "move";
          drag.onTabDragStart?.(tab.id, event);
        }}
        onDragEnd={(event) => {
          if (tab.kind === "asset") drag.onTabDragEnd?.(tab.id, event);
        }}
      >
        {session ? <AssetTabLabel session={session} /> : <EmptyTabLabel />}
      </button>
      <button
        type="button"
        className="tab-x"
        aria-label="Close tab"
        tabIndex={active ? 0 : -1}
        onClick={() => void store.closeTab(tab.id)}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

function AssetTabLabel({ session }: { session: AssetSession }) {
  const summary = useSelect(session.state, (state) => state.summary);
  const composition = separateComposition(summary);
  const name = (composition && fileName(composition)) || summary.name || fileName(summary.path) || "Loading";
  return (
    <>
      <Icon name="cube" className={`tab-ic${summary.status === "failed" ? " is-alert" : ""}`} />
      <span className="tab-name" title={composition ?? summary.path}>
        {name}
      </span>
    </>
  );
}

function EmptyTabLabel() {
  return (
    <>
      <Icon name="plus" className="tab-ic" />
      <span className="tab-name">New tab</span>
    </>
  );
}

function fileName(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? "";
}
