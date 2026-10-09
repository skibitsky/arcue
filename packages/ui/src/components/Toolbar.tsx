import type { DisplayMode } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { Popover } from "radix-ui";
import { formatCount, formatHeight, plural, sceneStats } from "../format";
import type { AssetSession } from "../store/asset-session";
import { BRUSH_MAX, BRUSH_MIN } from "../store/asset-session";
import { useSelect } from "../store/observable";
import { IconButton, Tip } from "./controls";
import { Icon } from "./Icon";

const displayModes: { mode: DisplayMode; label: string; icon: "lit" | "clay" | "wireframe" }[] = [
  { mode: "lit", label: "Lit", icon: "lit" },
  { mode: "clay", label: "Clay", icon: "clay" },
  { mode: "wireframe", label: "Wireframe", icon: "wireframe" },
];

export function Toolbar({ session }: { session: AssetSession }) {
  const tool = useSelect(session.state, (state) => state.tool);
  const displayMode = useSelect(session.state, (state) => state.displayMode);
  const skeleton = useSelect(session.state, (state) => state.skeleton);
  const ready = useSelect(session.state, (state) => state.viewportReady);
  return (
    <div className="toolbar">
      <fieldset className="seg" aria-label="Tool">
        <IconButton
          icon="view"
          label="View: drag to orbit"
          shortcut="V"
          tipSide="bottom"
          pressed={tool === "view"}
          onClick={() => session.setTool("view")}
        />
        <IconButton
          icon="comment"
          label="Comment: click to pin, drag to paint"
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
      <span className="tb-sep" />
      <IconButton
        icon="frame"
        label="Frame selection"
        shortcut="F"
        tipSide="bottom"
        disabled={!ready}
        onClick={() => session.frameSelection()}
      />
      <AssetInfo session={session} />
    </div>
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

function AssetInfo({ session }: { session: AssetSession }) {
  const summary = useSelect(session.state, (state) => state.summary);
  const scene = useSelect(session.state, (state) => state.scene);
  const review = useSelect(session.state, (state) => state.review);
  const version = review?.versions.find((candidate) => candidate.id === summary.version) ?? null;
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
        <Popover.Content className="popover info-pop" side="bottom" align="end" sideOffset={6} collisionPadding={8}>
          <div className="info-head">
            <strong>{summary.name || "Asset"}</strong>
            <span className="info-path">{summary.path}</span>
          </div>
          <dl className="info-grid">
            <dt>Version</dt>
            <dd className="mono">{summary.version ?? "–"}</dd>
            <dt>Exporter</dt>
            <dd>{version?.exporter ?? exporterOf(scene) ?? "Unknown"}</dd>
            {scene ? <SceneFacts scene={scene} /> : null}
          </dl>
          {scene && scene.source.warnings.length > 0 ? (
            <ul className="info-warnings" aria-label="Import warnings">
              {scene.source.warnings.map((warning) => (
                <li key={`${warning.code}:${warning.subject ?? ""}:${warning.message}`}>
                  <Icon name="alert" />
                  <span>{warning.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {summary.error ? (
            <p className="info-error">
              <Icon name="alert" />
              <span>{summary.error}</span>
            </p>
          ) : null}
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
