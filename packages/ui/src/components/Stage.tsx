import type { CreateViewport } from "@arcue/viewport";
import { useEffect, useRef } from "react";
import type { AssetSession } from "../store/asset-session";
import { useSelect } from "../store/observable";
import { CommentBoxLayer } from "./CommentBox";
import { Icon } from "./Icon";
import { OutlineDrawer } from "./Outline";
import { Toolbar } from "./Toolbar";

export function Stage({ session, createViewport }: { session: AssetSession; createViewport: CreateViewport }) {
  return (
    <section className="stage">
      <Toolbar session={session} />
      <div className="stage-row">
        <OutlineDrawer session={session} />
        <div className="viewport-area">
          <ViewportHost session={session} createViewport={createViewport} />
          <ViewportStatus session={session} />
          <CommentBoxLayer session={session} />
        </div>
      </div>
    </section>
  );
}

/** Mounts the asset's 3D view and connects it to the session. */
export function ViewportHost({ session, createViewport }: { session: AssetSession; createViewport: CreateViewport }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const factoryRef = useRef(createViewport);
  factoryRef.current = createViewport;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewport = factoryRef.current({ container });
    const detach = session.attachViewport(viewport, container);
    return () => {
      detach();
      viewport.dispose();
    };
  }, [session]);
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
