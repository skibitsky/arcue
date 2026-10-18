import { useState } from "react";
import type { WorkspaceStore } from "../store/workspace-store";
import { Icon } from "./Icon";
import { panelDomId, tabDomId } from "./TitleBar";

export interface SampleAsset {
  /** The name on the button, such as "StoneResonator.fbx". */
  name: string;
  /** The path `asset.open` takes. */
  path: string;
  /** One line on what the file shows, under its name. */
  description?: string;
}

export function EmptyState({
  store,
  samples,
  onOpenFile,
  onDropFiles,
  onOpenSample,
  title = "Drop an FBX or Blender file",
  dropHint,
  tabId,
}: {
  store: WorkspaceStore;
  samples: readonly SampleAsset[];
  onOpenSample?: ((sample: SampleAsset) => void) | undefined;
  title?: string | undefined;
  dropHint?: string | undefined;
  onOpenFile?: (() => void) | undefined;
  onDropFiles?: ((files: File[]) => void) | undefined;
  /** The empty tab this state belongs to, or null when no tab is open. */
  tabId: string | null;
}) {
  const [over, setOver] = useState(false);
  const detailed = samples.some((sample) => sample.description);
  return (
    <section
      className={`empty${over ? " is-over" : ""}`}
      aria-label="Open an asset"
      {...(tabId ? { id: panelDomId(tabId), role: "tabpanel", "aria-labelledby": tabDomId(tabId) } : {})}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const files = [...event.dataTransfer.files];
        if (files.length > 0) onDropFiles?.(files);
      }}
    >
      <div className="drop">
        <Icon name="upload" />
        <strong>{title}</strong>
        {dropHint ? <span>{dropHint}</span> : null}
        {onOpenFile ? (
          <button type="button" className="btn btn-open" onClick={onOpenFile}>
            <Icon name="folder" />
            Open a file
          </button>
        ) : null}
        {samples.length > 0 ? (
          <div className="samples">
            <span className="sec-label">Samples</span>
            <div className={detailed ? "sample-list" : "recent"}>
              {samples.map((sample) => (
                <button
                  key={sample.path}
                  type="button"
                  className={detailed ? "sample" : "btn"}
                  title={sample.description}
                  onClick={() => (onOpenSample ? onOpenSample(sample) : void store.openPath(sample.path))}
                >
                  {detailed ? (
                    <>
                      <span className="sample-name">{sample.name}</span>
                      {sample.description ? <span className="sample-description">{sample.description}</span> : null}
                    </>
                  ) : (
                    sample.name
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
