import type { ConnectionState } from "@arcue/protocol";
import type { CreateViewport } from "@arcue/viewport";
import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { handleShortcut } from "../shortcuts";
import type { AssetSession } from "../store/asset-session";
import { useSelect } from "../store/observable";
import type { WorkspaceStore } from "../store/workspace-store";
import { CommentsPanel } from "./CommentsPanel";
import type { SampleAsset } from "./EmptyState";
import { EmptyState } from "./EmptyState";
import { CopySheet, ToastView } from "./Overlays";
import { Stage } from "./Stage";
import { StatusBar } from "./StatusBar";
import { Timeline } from "./Timeline";
import type { TabDragHandlers } from "./TitleBar";
import { panelDomId, TitleBar, tabDomId } from "./TitleBar";

export interface WorkspaceProps extends TabDragHandlers {
  store: WorkspaceStore;
  /** Creates the 3D view for an asset tab. */
  createViewport: CreateViewport;
  /** Sample assets the empty state offers. */
  samples?: readonly SampleAsset[];
  /** Shows the host's file picker. Without it the empty state has no Open button. */
  onOpenFile?: () => void;
  /** Files dropped on the empty state. */
  onDropFiles?: (files: File[]) => void;
  /** Replaces opening a sample by its path, as when the host must fetch the file first. */
  onOpenSample?: (sample: SampleAsset) => void;
  /** The empty state's headline, "Drop an FBX or Blender file" unless given. */
  emptyTitle?: string;
  /** The line under the empty state's headline. */
  dropHint?: string;
  /** Why the host can't open dropped files, for a host without `onDropFiles`. A drop on the empty state shows it. */
  dropRefusal?: string;
  /** Replaces the "+" button's default, which adds an empty tab. */
  onNewTab?: () => void;
  /** Drawn at the left of the title bar, such as window buttons or the space macOS keeps for its own. */
  windowControls?: ReactNode;
  /** The clock for relative times in History. */
  now?: () => Date;
  /**
   * Whether the undo and redo keys run review.undo and review.redo for the visible tab. The default is true; a host
   * whose native Edit menu takes those keys turns it off, so one key press never undoes twice.
   */
  historyKeys?: boolean;
}

const systemNow = () => new Date();

/** The Workspace window: tab strip, and for the active asset the toolbar, 3D view, timeline, comments and status. */
export function Workspace(props: WorkspaceProps) {
  const {
    store,
    createViewport,
    samples = [],
    onOpenFile,
    onDropFiles,
    windowControls,
    now = systemNow,
    historyKeys = true,
  } = props;
  const tabs = useSelect(store.state, (state) => state.tabs);
  const active = useSelect(store.state, (state) => state.active);
  const connection = useSelect(store.state, (state) => state.connection);
  const activeTab = tabs.find((tab) => tab.id === active);

  useEffect(() => store.start(), [store]);

  useEffect(() => {
    const onFocus = () => store.reportFocus();
    window.addEventListener("focus", onFocus);
    if (document.hasFocus()) store.reportFocus();
    return () => window.removeEventListener("focus", onFocus);
  }, [store]);

  return (
    <Tooltip.Provider delayDuration={420} skipDelayDuration={500}>
      <div className="arcue-window">
        <TitleBar
          store={store}
          windowControls={windowControls}
          onNewTab={props.onNewTab ?? (() => store.openNewTab())}
          drag={props}
        />
        {tabs.map((tab) => {
          const session = tab.kind === "asset" ? store.session(tab.id) : null;
          return session ? (
            <AssetView
              key={tab.id}
              store={store}
              session={session}
              active={tab.id === active}
              connection={connection}
              createViewport={createViewport}
              now={now}
              historyKeys={historyKeys}
            />
          ) : null;
        })}
        {activeTab?.kind !== "asset" ? (
          <EmptyState
            store={store}
            samples={samples}
            onOpenFile={onOpenFile}
            onDropFiles={onDropFiles}
            onOpenSample={props.onOpenSample}
            title={props.emptyTitle}
            dropHint={props.dropHint}
            dropRefusal={props.dropRefusal}
            tabId={activeTab?.id ?? null}
          />
        ) : null}
        <ToastView store={store} />
        <CopySheet store={store} />
      </div>
    </Tooltip.Provider>
  );
}

function AssetView({
  store,
  session,
  active,
  connection,
  createViewport,
  now,
  historyKeys,
}: {
  store: WorkspaceStore;
  session: AssetSession;
  active: boolean;
  connection: ConnectionState;
  createViewport: CreateViewport;
  now: () => Date;
  historyKeys: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    let spaceUsed = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!rootRef.current || rootRef.current.closest("[hidden]")) return;
      if (handleShortcut(event, session, { history: historyKeys })) {
        event.preventDefault();
        spaceUsed = event.key === " ";
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " " && spaceUsed) {
        event.preventDefault();
        spaceUsed = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [active, session, historyKeys]);

  return (
    <main
      className="ws"
      ref={rootRef}
      hidden={!active}
      id={panelDomId(session.assetId)}
      role="tabpanel"
      aria-labelledby={tabDomId(session.assetId)}
    >
      <Stage store={store} session={session} active={active} createViewport={createViewport} />
      <Timeline store={store} session={session} />
      <CommentsPanel session={session} now={now} />
      <StatusBar store={store} session={session} connection={connection} />
    </main>
  );
}
