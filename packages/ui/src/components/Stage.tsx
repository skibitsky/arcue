import { fileNameOf } from "@arcue/scene";
import type { CreateViewport } from "@arcue/viewport";
import { DropdownMenu } from "radix-ui";
import type { DragEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AssetSession } from "../store/asset-session";
import { useSelect } from "../store/observable";
import type { WorkspaceStore } from "../store/workspace-store";
import { CommentBoxLayer } from "./CommentBox";
import { IconButton } from "./controls";
import { Icon } from "./Icon";
import { OutlineDrawer } from "./Outline";
import { Toolbar } from "./Toolbar";

export function Stage({
  store,
  session,
  active,
  createViewport,
}: {
  store: WorkspaceStore;
  session: AssetSession;
  active: boolean;
  createViewport: CreateViewport;
}) {
  const [over, setOver] = useState(false);
  const takesFiles = store.canAddFiles;
  const hasFiles = (event: DragEvent) => takesFiles && event.dataTransfer.types.includes("Files");
  return (
    <section className="stage">
      <Toolbar store={store} session={session} />
      <div className="stage-row">
        <OutlineDrawer store={store} session={session} />
        <section
          className={`viewport-area${over ? " is-drop" : ""}`}
          aria-label="3D view"
          onDragOver={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setOver(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            setOver(false);
            const files = [...event.dataTransfer.files];
            const rect = event.currentTarget.getBoundingClientRect();
            const at = {
              x: Math.min(Math.max(0, event.clientX - rect.left), rect.width),
              y: Math.min(Math.max(0, event.clientY - rect.top), rect.height),
            };
            if (files.length > 0) void store.dropOnView(session.assetId, files, at);
          }}
        >
          <ViewportHost session={session} active={active} createViewport={createViewport} />
          <ViewportStatus session={session} />
          <RelinkOffer session={session} />
          <CommentBoxLayer session={session} />
          <DropMenu store={store} assetId={session.assetId} />
        </section>
      </div>
    </section>
  );
}

/** The core's offer to continue the review of an earlier file, which stays until it is taken or dismissed. */
function RelinkOffer({ session }: { session: AssetSession }) {
  const offer = useSelect(session.state, (state) => state.offer);
  if (!offer) return null;
  return (
    <div className="offer" role="status">
      <span className="offer-text">Looks like {fileNameOf(offer.path)}, renamed.</span>
      <button type="button" className="btn" onClick={() => void session.continueReview()}>
        Continue
      </button>
      <IconButton small icon="x" label="Dismiss" onClick={() => session.dismissOffer()} />
    </div>
  );
}

/** "New tab" or "Add to view" at the point where a model was dropped on a tab that shows a model. */
function DropMenu({ store, assetId }: { store: WorkspaceStore; assetId: string }) {
  const prompt = useSelect(store.state, (state) => (state.dropPrompt?.assetId === assetId ? state.dropPrompt : null));
  if (!prompt) return null;
  return (
    <DropdownMenu.Root open onOpenChange={(open) => (open ? undefined : store.dismissDrop())} modal={false}>
      <DropdownMenu.Trigger asChild>
        <span className="drop-anchor" style={{ left: prompt.x, top: prompt.y }} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu menu-drop"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          aria-label="Dropped file"
        >
          <DropdownMenu.Item className="menu-item" onSelect={() => void store.answerDrop("tab")}>
            <Icon name="tab" className="mi-icon" />
            <span className="mi-label">New tab</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="menu-item" onSelect={() => void store.answerDrop("view")}>
            <Icon name="layers" className="mi-icon" />
            <span className="mi-label">Add to view</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Mounts the asset's 3D view and connects it to the session. */
export function ViewportHost({
  session,
  active,
  createViewport,
}: {
  session: AssetSession;
  active: boolean;
  createViewport: CreateViewport;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const factoryRef = useRef(createViewport);
  factoryRef.current = createViewport;
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewport = factoryRef.current({ container });
    viewport.setActive(activeRef.current);
    const detach = session.attachViewport(viewport, container);
    return () => {
      detach();
      viewport.dispose();
    };
  }, [session]);
  useLayoutEffect(() => {
    session.viewport?.setActive(active);
  }, [active, session]);
  return <div className="viewport" ref={containerRef} data-testid="viewport" />;
}

function ViewportStatus({ session }: { session: AssetSession }) {
  const summary = useSelect(session.state, (state) => state.summary);
  const hasScene = useSelect(session.state, (state) => state.scene !== null);
  const ready = useSelect(session.state, (state) => state.viewportReady);
  const sceneError = useSelect(session.state, (state) => state.sceneError);
  if (sceneError && !ready) {
    return (
      <div className="vp-status is-alert" role="alert">
        <Icon name="alert" />
        <span>The 3D view could not start: {sceneError}</span>
      </div>
    );
  }
  if (summary.status === "failed" && !hasScene) {
    return (
      <div className="vp-status is-alert" role="alert">
        <Icon name="alert" />
        <span>
          {summary.name || "The file"} could not be opened{summary.error ? `: ${summary.error}` : "."}
        </span>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="vp-status" role="status">
        <span>Loading model</span>
        <span className="vp-bar">
          <i />
        </span>
      </div>
    );
  }
  return null;
}
