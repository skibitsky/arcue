import type { ConnectionState, CoordinateConvention } from "@arcue/protocol";
import { DropdownMenu } from "radix-ui";
import { useMemo } from "react";
import { formatClock, formatCount, formatHeight, plural, sceneStats } from "../format";
import type { AssetSession } from "../store/asset-session";
import { useSelect } from "../store/observable";
import type { WorkspaceStore } from "../store/workspace-store";
import { Tip } from "./controls";
import { Icon } from "./Icon";

type WatchState = { tone: "live" | "idle" | "alert"; text: string; tip: string };

function watchState(
  connection: ConnectionState,
  status: string,
  version: string | null,
  exportedAt: string | null,
  error: string | null,
): WatchState {
  if (connection === "reconnecting") {
    return { tone: "idle", text: "Reconnecting", tip: "The core restarted. Your comments are saved." };
  }
  if (connection === "closed")
    return { tone: "alert", text: "Disconnected", tip: "The connection to the core is gone." };
  if (status === "loading") {
    return { tone: "idle", text: version ? "Reloading" : "Loading", tip: "Reading the latest export." };
  }
  if (status === "failed") {
    return {
      tone: "alert",
      text: version ? "Reload failed" : "Could not open",
      tip: version
        ? `${error ?? "The new export could not be read."} The previous version stays on screen.`
        : (error ?? ""),
    };
  }
  const when = exportedAt ? `Exported ${formatClock(new Date(exportedAt))}` : "Ready";
  return { tone: "live", text: when, tip: `Version ${version ?? "unknown"}. Reloads when the file changes.` };
}

const conventions: { value: CoordinateConvention; short: string; long: string }[] = [
  { value: "y-up", short: "Y up", long: "Y up, meters, right-handed" },
  { value: "z-up-blender", short: "Z up", long: "Z up, as Blender shows it" },
];

function CoordinatesMenu({ store }: { store: WorkspaceStore }) {
  const settings = useSelect(store.state, (state) => state.settings);
  if (!settings) return null;
  const current = conventions.find((option) => option.value === settings.coordinates) ?? conventions[0];
  return (
    <DropdownMenu.Root modal={false}>
      <Tip label="Coordinates in copied prompts">
        <DropdownMenu.Trigger asChild>
          <button type="button" className="sb-menu" aria-label={`Prompt coordinates: ${current?.long ?? ""}`}>
            {current?.short}
            <Icon name="chevronDown" />
          </button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" side="top" align="end" sideOffset={6}>
          <DropdownMenu.Label className="menu-label">Coordinates in prompts</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={settings.coordinates}
            onValueChange={(value) => {
              const option = conventions.find((candidate) => candidate.value === value);
              if (option) void store.setCoordinates(option.value);
            }}
          >
            {conventions.map((option) => (
              <DropdownMenu.RadioItem key={option.value} className="menu-item" value={option.value}>
                <span className="mi-check">
                  <DropdownMenu.ItemIndicator>
                    <Icon name="check" />
                  </DropdownMenu.ItemIndicator>
                </span>
                <span className="mi-label">{option.long}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function StatusBar({
  store,
  session,
  connection,
}: {
  store: WorkspaceStore;
  session: AssetSession;
  connection: ConnectionState;
}) {
  const summary = useSelect(session.state, (state) => state.summary);
  const review = useSelect(session.state, (state) => state.review);
  const scene = useSelect(session.state, (state) => state.scene);
  const parts = useSelect(session.state, (state) => state.parts);
  const exportedAt = review?.versions.find((version) => version.id === summary.version)?.fileModifiedAt ?? null;
  const watch = watchState(connection, summary.status, summary.version, exportedAt, summary.error);
  const stats = useMemo(() => (scene ? sceneStats(scene, parts) : null), [scene, parts]);
  const usual = useMemo(() => (scene ? sceneStats(scene) : null), [scene]);
  const changed = (value: number, key: "triangles" | "height") =>
    usual !== null && Math.abs(usual[key] - value) > 1e-9 ? "is-changed" : undefined;
  return (
    <footer className="statusbar">
      <Tip label={watch.tip}>
        <span className={`sb-live is-${watch.tone}`} role="status">
          <i />
          {watch.text}
        </span>
      </Tip>
      <span className="grow" />
      <CoordinatesMenu store={store} />
      {stats ? (
        <span className="sb-stats">
          {stats.triangles > 0 ? (
            <span className={changed(stats.triangles, "triangles")}>{formatCount(stats.triangles)} tris</span>
          ) : null}
          {stats.bones > 0 ? <span>{plural(stats.bones, "bone")}</span> : null}
          {stats.clips > 0 ? <span className="sb-clips">{plural(stats.clips, "clip")}</span> : null}
          {stats.height > 0 ? (
            <span className={changed(stats.height, "height")}>{formatHeight(stats.height)}</span>
          ) : null}
        </span>
      ) : null}
    </footer>
  );
}
