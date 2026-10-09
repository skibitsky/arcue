import type { DisplayMode } from "@arcue/protocol";
import type { MaterialSlot, MaterialSlots, SceneDescription, Texture } from "@arcue/scene";
import { fileNameOf, materialSlots } from "@arcue/scene";
import { Popover } from "radix-ui";
import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { formatCount, formatHeight, plural, sceneStats } from "../format";
import type { AssetSession } from "../store/asset-session";
import { BRUSH_MAX, BRUSH_MIN } from "../store/asset-session";
import { useSelect } from "../store/observable";
import { hasOutline, lodOptions, lodShown, visibilityChanged } from "../store/outline";
import { slotLabel } from "../store/view-files";
import type { WorkspaceStore } from "../store/workspace-store";
import { IconButton, Tip } from "./controls";
import { Icon } from "./Icon";

const displayModes: { mode: DisplayMode; label: string; icon: "lit" | "clay" | "wireframe" }[] = [
  { mode: "lit", label: "Lit", icon: "lit" },
  { mode: "clay", label: "Clay", icon: "clay" },
  { mode: "wireframe", label: "Wireframe", icon: "wireframe" },
];

export function Toolbar({ store, session }: { store: WorkspaceStore; session: AssetSession }) {
  const tool = useSelect(session.state, (state) => state.tool);
  const displayMode = useSelect(session.state, (state) => state.displayMode);
  const skeleton = useSelect(session.state, (state) => state.skeleton);
  const ready = useSelect(session.state, (state) => state.viewportReady);
  return (
    <div className="toolbar">
      <OutlineButton session={session} />
      <fieldset className="seg" aria-label="Tool">
        <IconButton
          icon="view"
          label="View"
          shortcut="V"
          tipSide="bottom"
          pressed={tool === "view"}
          onClick={() => session.setTool("view")}
        />
        <IconButton
          icon="comment"
          label="Comment"
          shortcut="C"
          tipSide="bottom"
          pressed={tool === "comment"}
          onClick={() => session.setTool("comment")}
        />
      </fieldset>
      {tool === "comment" ? <BrushSize session={session} /> : null}
      <span className="grow" />
      <fieldset className="seg" aria-label="Display mode">
        {displayModes.map(({ mode, label, icon }) => (
          <IconButton
            key={mode}
            icon={icon}
            label={label}
            tipSide="bottom"
            pressed={displayMode === mode}
            onClick={() => session.setDisplayMode(mode)}
          />
        ))}
      </fieldset>
      <IconButton
        icon="skeleton"
        label="Skeleton"
        tipSide="bottom"
        pressed={skeleton}
        onClick={() => session.setSkeleton(!skeleton)}
      />
      <LodSwitch session={session} />
      <span className="tb-sep" />
      <IconButton
        icon="frame"
        label="Frame selection"
        shortcut="F"
        tipSide="bottom"
        disabled={!ready}
        onClick={() => session.frameSelection()}
      />
      <AssetInfo store={store} session={session} />
    </div>
  );
}

/** The outline drawer's toggle, for models with parts or added files. A dot marks a view that hides or isolates. */
function OutlineButton({ session }: { session: AssetSession }) {
  const available = useSelect(session.state, (state) => state.scene !== null && hasOutline(state.scene));
  const open = useSelect(session.state, (state) => state.outlineOpen);
  const changed = useSelect(session.state, (state) => visibilityChanged(state.parts));
  if (!available) return null;
  return (
    <>
      <IconButton
        icon="outline"
        label="Outline"
        shortcut="O"
        tipSide="bottom"
        pressed={open}
        className={changed ? "has-dot" : undefined}
        onClick={() => session.setOutlineOpen(!open)}
      />
      <span className="tb-sep" />
    </>
  );
}

/** LOD0 first; each level's tooltip gives the triangles on screen at that level. */
function LodSwitch({ session }: { session: AssetSession }) {
  const scene = useSelect(session.state, (state) => state.scene);
  const parts = useSelect(session.state, (state) => state.parts);
  const options = useMemo(() => (scene ? lodOptions(scene, parts) : []), [scene, parts]);
  if (options.length === 0) return null;
  const shown = lodShown(options, parts.lod);
  return (
    <fieldset className="seg lod" aria-label="LOD">
      <span className="lod-label" aria-hidden="true">
        LOD
      </span>
      {options.map(({ level, triangles }) => (
        <Tip key={level} label={`LOD${level} · ${formatCount(triangles)} tris`} side="bottom">
          <button
            type="button"
            className="ibtn lod-level"
            aria-label={`LOD${level}`}
            aria-pressed={level === shown}
            onClick={() => session.setLod(level)}
          >
            {level}
          </button>
        </Tip>
      ))}
    </fieldset>
  );
}

function BrushSize({ session }: { session: AssetSession }) {
  const size = useSelect(session.state, (state) => state.brushSize);
  const dot = Math.max(4, Math.min(18, size * 0.5));
  return (
    <Tip label="Brush size" shortcut="[ ]" side="bottom">
      <label className="brush-ctl">
        <span className="brush-dot">
          <i style={{ width: dot, height: dot }} />
        </span>
        <input
          type="range"
          min={BRUSH_MIN}
          max={BRUSH_MAX}
          value={size}
          aria-label="Brush size"
          onChange={(event) => session.setBrushSize(Number(event.target.value))}
        />
      </label>
    </Tip>
  );
}

function AssetInfo({ store, session }: { store: WorkspaceStore; session: AssetSession }) {
  const summary = useSelect(session.state, (state) => state.summary);
  const scene = useSelect(session.state, (state) => state.scene);
  const review = useSelect(session.state, (state) => state.review);
  const version = review?.versions.find((candidate) => candidate.id === summary.version) ?? null;
  const materials = useMemo(() => (scene ? materialSlots(scene) : []), [scene]);
  return (
    <Popover.Root>
      <Tip label="Asset info" side="bottom">
        <Popover.Trigger asChild>
          <button type="button" className="ibtn" aria-label="Asset info">
            <Icon name="info" />
          </button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content
          className="popover info-pop"
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          <div className="info-top">
            <div className="info-head">
              <strong>{summary.name || "Asset"}</strong>
              <span className="info-path">{summary.path}</span>
            </div>
            {store.canAddFiles ? (
              <IconButton
                icon="plus"
                label="Add file"
                small
                tipSide="bottom"
                onClick={() => void store.addFileToView(session.assetId)}
              />
            ) : null}
          </div>
          <dl className="info-grid">
            <dt>Version</dt>
            <dd className="mono">{summary.version ?? "–"}</dd>
            <dt>Exporter</dt>
            <dd>{version?.exporter ?? exporterOf(scene) ?? "Unknown"}</dd>
            {scene ? <SceneFacts scene={scene} /> : null}
          </dl>
          {summary.error ? (
            <p className="info-error">
              <Icon name="alert" />
              <span>{summary.error}</span>
            </p>
          ) : null}
          {scene
            ? materials.map((entry) => (
                <MaterialSection
                  key={entry.material}
                  store={store}
                  assetId={session.assetId}
                  scene={scene}
                  entry={entry}
                />
              ))
            : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function exporterOf(scene: SceneDescription | null): string | null {
  const exporter = scene?.source.exporter;
  if (!exporter) return null;
  return exporter.version ? `${exporter.name} ${exporter.version}` : exporter.name;
}

function SceneFacts({ scene }: { scene: SceneDescription }) {
  const stats = sceneStats(scene);
  const fps = scene.source.fps;
  return (
    <>
      <dt>Triangles</dt>
      <dd className="mono">{formatCount(stats.triangles)}</dd>
      <dt>Bones</dt>
      <dd className="mono">{formatCount(stats.bones)}</dd>
      <dt>Clips</dt>
      <dd className="mono">{plural(stats.clips, "clip")}</dd>
      <dt>Frame rate</dt>
      <dd className="mono">{fps} fps</dd>
      <dt>Size</dt>
      <dd className="mono">{formatHeight(stats.height)}</dd>
    </>
  );
}

function MaterialSection({
  store,
  assetId,
  scene,
  entry,
}: {
  store: WorkspaceStore;
  assetId: string;
  scene: SceneDescription;
  entry: MaterialSlots;
}) {
  return (
    <section className="mat" aria-label={`Material ${entry.material}`}>
      <span className="mat-name" title={entry.material}>
        {entry.material}
      </span>
      {entry.slots.map((slot) => (
        <TextureSlotRow
          key={slot.slot}
          store={store}
          assetId={assetId}
          material={entry.material}
          slot={slot}
          texture={slot.texture === null ? null : (scene.textures[slot.texture] ?? null)}
        />
      ))}
    </section>
  );
}

function TextureSlotRow({
  store,
  assetId,
  material,
  slot,
  texture,
}: {
  store: WorkspaceStore;
  assetId: string;
  material: string;
  slot: MaterialSlot;
  texture: Texture | null;
}) {
  const [over, setOver] = useState(false);
  const label = slotLabel(slot.slot);
  const name = slot.path === null ? null : fileNameOf(slot.path);
  const canPick = store.canAddFiles;
  const takesDrop = (event: DragEvent) => canPick && event.dataTransfer.types.includes("Files");
  const value =
    slot.state === "empty" ? (
      <Icon name="plus" className="slot-add" />
    ) : slot.state === "missing" ? (
      <>
        <Icon name="alert" />
        <span className="nm is-path">
          <bdi>{slot.path}</bdi>
        </span>
      </>
    ) : (
      <>
        <TextureThumb texture={texture} />
        <span className="nm">{name}</span>
      </>
    );
  const pickLabel =
    name === null
      ? `Choose ${label.toLowerCase()} texture`
      : `${label}: ${name}${slot.state === "missing" ? ", not found" : ""}`;
  return (
    <div className="slot">
      <span className="slot-k">{label}</span>
      <div className={["slot-v", `is-${slot.state}`, over ? "is-over" : ""].filter(Boolean).join(" ")}>
        {canPick ? (
          <Tip label={slot.path ?? "Choose texture"} side="left">
            <button
              type="button"
              className="slot-pick"
              aria-label={pickLabel}
              onClick={() => void store.chooseTexture(assetId, material, slot.slot)}
              onDragOver={(event) => {
                if (!takesDrop(event)) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "copy";
                setOver(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
              }}
              onDrop={(event) => {
                if (!takesDrop(event)) return;
                event.preventDefault();
                event.stopPropagation();
                setOver(false);
                void store.dropTexture(assetId, material, slot.slot, [...event.dataTransfer.files]);
              }}
            >
              {value}
            </button>
          </Tip>
        ) : (
          <span className="slot-pick" title={slot.path ?? undefined}>
            {value}
          </span>
        )}
        {slot.overridden ? (
          <Tip label="Use the file's texture">
            <button
              type="button"
              className="chip-x"
              aria-label={`Use the file's ${label.toLowerCase()} texture`}
              onClick={() => void store.restoreTexture(assetId, material, slot.slot)}
            >
              <Icon name="trash" />
            </button>
          </Tip>
        ) : null}
      </div>
    </div>
  );
}

const PREVIEW_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);

/** A small preview of a texture the browser can show, or an image icon for one it cannot. */
function TextureThumb({ texture }: { texture: Texture | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!texture || !PREVIEW_TYPES.has(texture.mimeType) || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(new Blob([new Uint8Array(texture.bytes)], { type: texture.mimeType }));
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [texture]);
  if (!url) return <Icon name="image" />;
  return <img className="sw" src={url} alt="" />;
}
