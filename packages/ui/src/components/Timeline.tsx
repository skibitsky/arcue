import type { Clip } from "@arcue/scene";
import { lastFrame } from "@arcue/scene";
import { DropdownMenu } from "radix-ui";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatSeconds, rangeLabel } from "../format";
import type { AssetSession } from "../store/asset-session";
import { useSelect } from "../store/observable";
import type { MarkerBar, TimelineMarker } from "../store/timeline";
import {
  draftCountsByClip,
  frameAt,
  keyFrames,
  percentOf,
  rulerTicks,
  SPEEDS,
  timelineMarkers,
} from "../store/timeline";
import { IconButton, Tip } from "./controls";
import { Icon } from "./Icon";

const REST_VALUE = "";

export function Timeline({ session }: { session: AssetSession }) {
  const scene = useSelect(session.state, (state) => state.scene);
  const clipName = useSelect(session.state, (state) => state.clip);
  const loop = useSelect(session.state, (state) => state.loop);
  const range = useSelect(session.state, (state) => state.range);
  const playing = useSelect(session.time, (state) => state.playing);
  const clip = useMemo(() => scene?.clips.find((candidate) => candidate.name === clipName) ?? null, [scene, clipName]);
  if (scene && scene.clips.length === 0) return null;
  return (
    <section className="timeline" aria-label="Timeline">
      <div className="tl-bar">
        <ClipPicker session={session} clip={clip} />
        <span className="tb-sep" />
        <IconButton
          icon="stepBack"
          label="Previous frame"
          shortcut="←"
          className="tl-step"
          disabled={!clip}
          onClick={() => session.step(-1)}
        />
        <IconButton
          icon={playing ? "pause" : "play"}
          label={playing ? "Pause" : "Play"}
          shortcut="Space"
          disabled={!clip}
          onClick={() => session.togglePlaying()}
        />
        <IconButton
          icon="stepForward"
          label="Next frame"
          shortcut="→"
          className="tl-step"
          disabled={!clip}
          onClick={() => session.step(1)}
        />
        <IconButton icon="loop" label="Loop" pressed={loop} disabled={!clip} onClick={() => session.setLoop(!loop)} />
        <SpeedMenu session={session} disabled={!clip} />
        {range ? (
          <span className="chip range-chip">
            <Icon name="range" />
            <span>{rangeLabel(range)}</span>
            <Tip label="Clear range" shortcut="Esc">
              <button type="button" className="chip-x" aria-label="Clear range" onClick={() => session.setRange(null)}>
                <Icon name="trash" />
              </button>
            </Tip>
          </span>
        ) : null}
        <span className="grow" />
        <FrameCounter session={session} clip={clip} />
      </div>
      <Track session={session} clip={clip} />
    </section>
  );
}

function ClipPicker({ session, clip }: { session: AssetSession; clip: Clip | null }) {
  const scene = useSelect(session.state, (state) => state.scene);
  const review = useSelect(session.state, (state) => state.review);
  const counts = useMemo(() => draftCountsByClip(review), [review]);
  const restCount = counts.get(null) ?? 0;
  const name = clip?.displayName ?? "Rest pose";
  return (
    <DropdownMenu.Root modal={false}>
      <Tip label="Clip">
        <DropdownMenu.Trigger asChild>
          <button type="button" className="clip-btn" aria-label={`Clip: ${name}`} disabled={!scene}>
            <Icon name="film" />
            <span className="clip-name">{name}</span>
            {clip ? <span className="clip-len">{lastFrame(clip)} f</span> : null}
            <Icon name="chevronDown" />
          </button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" side="top" align="start" sideOffset={6} collisionPadding={8}>
          <DropdownMenu.RadioGroup
            value={clip?.name ?? REST_VALUE}
            onValueChange={(value) => session.setClip(value === REST_VALUE ? null : value)}
          >
            <MenuItem value={REST_VALUE} label="Rest pose" count={restCount} />
            <DropdownMenu.Separator className="menu-sep" />
            {scene?.clips.map((candidate) => (
              <MenuItem
                key={candidate.name}
                value={candidate.name}
                label={candidate.displayName}
                count={counts.get(candidate.name) ?? 0}
                detail={`${lastFrame(candidate)} f`}
              />
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({ value, label, count, detail }: { value: string; label: string; count?: number; detail?: string }) {
  return (
    <DropdownMenu.RadioItem className="menu-item" value={value}>
      <span className="mi-check">
        <DropdownMenu.ItemIndicator>
          <Icon name="check" />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="mi-label">{label}</span>
      {count ? (
        <span className="mi-count" role="img" aria-label={`${count} draft${count === 1 ? "" : "s"}`}>
          {count}
        </span>
      ) : null}
      {detail ? <span className="mi-len">{detail}</span> : null}
    </DropdownMenu.RadioItem>
  );
}

function SpeedMenu({ session, disabled }: { session: AssetSession; disabled: boolean }) {
  const speed = useSelect(session.state, (state) => state.speed);
  return (
    <DropdownMenu.Root modal={false}>
      <Tip label="Playback speed">
        <DropdownMenu.Trigger asChild>
          <button type="button" className="speed" aria-label={`Playback speed: ${speed}×`} disabled={disabled}>
            {speed}×
          </button>
        </DropdownMenu.Trigger>
      </Tip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu menu-narrow" side="top" align="start" sideOffset={6}>
          <DropdownMenu.RadioGroup value={String(speed)} onValueChange={(value) => session.setSpeed(Number(value))}>
            {SPEEDS.map((option) => (
              <MenuItem key={option} value={String(option)} label={`${option}×`} />
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FrameCounter({ session, clip }: { session: AssetSession; clip: Clip | null }) {
  const frame = useSelect(session.time, () => session.currentFrame());
  if (!clip) {
    return (
      <Tip label="Rest pose">
        <span className="counter" role="img" aria-label="Rest pose">
          <b>–</b>
          <span>/</span>
          <span>–</span>
        </span>
      </Tip>
    );
  }
  const last = lastFrame(clip);
  const tip = `${formatSeconds(frame / clip.fps)} of ${formatSeconds(last / clip.fps, 2)}`;
  return (
    <Tip label={tip}>
      <span className="counter" role="img" aria-label={`Frame ${frame} of ${last}`}>
        <b>{frame}</b>
        <span>/</span>
        <span>{last}</span>
      </span>
    </Tip>
  );
}

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function Track({ session, clip }: { session: AssetSession; clip: Clip | null }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const width = useWidth(trackRef);
  const range = useSelect(session.state, (state) => state.range);
  const last = clip ? lastFrame(clip) : 0;
  return (
    <div className={`tl-track${clip ? "" : " is-rest"}`} ref={trackRef}>
      {clip ? (
        <>
          <Ruler session={session} clip={clip} width={width} />
          <Lane session={session} clip={clip} />
          {range ? (
            <div
              className="tl-range"
              style={{ left: percentOf(range.start, last), width: percentOf(range.end - range.start, last) }}
            />
          ) : null}
          <Playhead session={session} clip={clip} />
        </>
      ) : (
        <div className="tl-rest" />
      )}
    </div>
  );
}

function stripHandler(
  clip: Clip,
  onStart: (frame: number) => (frame: number, moved: boolean) => void,
  onEnd: (start: number, moved: boolean) => void,
) {
  return (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture?.(event.pointerId);
    const last = lastFrame(clip);
    const frameFor = (clientX: number) => {
      const rect = element.getBoundingClientRect();
      return frameAt((clientX - rect.left) / Math.max(1, rect.width), last);
    };
    const start = frameFor(event.clientX);
    const startX = event.clientX;
    let moved = false;
    const onMove = onStart(start);
    const move = (moveEvent: PointerEvent) => {
      if (!moved && Math.abs(moveEvent.clientX - startX) > 3) moved = true;
      onMove(frameFor(moveEvent.clientX), moved);
    };
    const up = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      onEnd(start, moved);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
  };
}

function Ruler({ session, clip, width }: { session: AssetSession; clip: Clip; width: number }) {
  const last = lastFrame(clip);
  const ruler = useMemo(() => rulerTicks(last, width, keyFrames(clip)), [last, width, clip]);
  const wasPlaying = useRef(false);
  const onPointerDown = stripHandler(
    clip,
    (start) => {
      wasPlaying.current = session.time.get().playing;
      if (wasPlaying.current) session.setPlaying(false);
      session.setFrame(start);
      return (frame, moved) => {
        if (moved) session.setFrame(frame);
      };
    },
    (_start, moved) => {
      if (wasPlaying.current && !moved) session.setPlaying(true);
    },
  );
  const tickHeight = 7;
  const minorHeight = 3.5;
  const baseline = 24;
  return (
    <div className="tl-ruler" onPointerDown={onPointerDown}>
      <svg className="ruler-svg" width="100%" height={baseline} aria-hidden="true">
        {ruler.ticks.map((tick) => {
          const x = `${((tick.frame / last) * 100).toFixed(3)}%`;
          const height = ruler.mode === "keys" ? 5 : tick.major ? tickHeight : minorHeight;
          const kind = ruler.mode === "keys" ? "tk tk-key" : tick.major ? "tk tk-major" : "tk";
          return <line key={tick.frame} x1={x} x2={x} y1={baseline - height} y2={baseline} className={kind} />;
        })}
        {ruler.labels.map((frame) => (
          <text
            key={frame}
            x={`${((frame / last) * 100).toFixed(3)}%`}
            y={baseline - tickHeight - 3}
            className="tk-label"
            textAnchor={frame === 0 ? "start" : frame === last ? "end" : "middle"}
          >
            {frame}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Lane({ session, clip }: { session: AssetSession; clip: Clip }) {
  const review = useSelect(session.state, (state) => state.review);
  const selection = useSelect(session.state, (state) => state.selection);
  const { bars, dots } = useMemo(() => timelineMarkers(review, clip.name, selection), [review, clip.name, selection]);
  const last = lastFrame(clip);
  const onPointerDown = stripHandler(
    clip,
    (start) => (frame, moved) => {
      if (!moved) return;
      if (session.time.get().playing) session.setPlaying(false);
      session.setRange({ start: Math.min(start, frame), end: Math.max(start, frame) });
      session.setFrame(Math.min(start, frame));
    },
    (start, moved) => {
      if (moved) return;
      session.setRange(null);
      session.setFrame(start);
    },
  );
  return (
    <div className="tl-lane" onPointerDown={onPointerDown}>
      {bars.map((bar) => (
        <MarkerButton
          key={bar.id}
          session={session}
          marker={bar}
          shape="bar"
          style={{ left: percentOf(bar.start, last), width: percentOf(bar.end - bar.start, last) }}
        />
      ))}
      {dots.map(({ frame, markers }) =>
        markers.length === 1 && markers[0] ? (
          <MarkerButton
            key={markers[0].id}
            session={session}
            marker={markers[0]}
            shape="dot"
            style={{ left: percentOf(frame, last) }}
          />
        ) : (
          <span key={`group-${frame}`} className="mk mk-group" style={{ left: percentOf(frame, last) }}>
            {markers.map((marker) => (
              <MarkerButton key={marker.id} session={session} marker={marker} shape="dot" />
            ))}
          </span>
        ),
      )}
    </div>
  );
}

function MarkerButton({
  session,
  marker,
  shape,
  style,
}: {
  session: AssetSession;
  marker: TimelineMarker | MarkerBar;
  shape: "dot" | "bar";
  style?: { left: string; width?: string };
}) {
  const label = marker.status === "draft" ? marker.text : `Round ${marker.round ?? "?"}: ${marker.text}`;
  const classes = ["mk", `mk-${shape}`, `is-${marker.status}`, marker.selected ? "is-selected" : ""]
    .filter(Boolean)
    .join(" ");
  const content =
    marker.status === "draft" ? (
      shape === "bar" ? (
        <span className="mk-n">{marker.number}</span>
      ) : (
        marker.number
      )
    ) : marker.status === "resolved" ? (
      <Icon name="check" />
    ) : null;
  return (
    <Tip label={label}>
      <button
        type="button"
        className={classes}
        style={style}
        aria-label={marker.number ? `Comment ${marker.number}: ${marker.text}` : label}
        onClick={() => session.selectComment(marker.id)}
      >
        {content}
      </button>
    </Tip>
  );
}

function Playhead({ session, clip }: { session: AssetSession; clip: Clip }) {
  const frame = useSelect(session.time, () => session.currentFrame());
  const seconds = useSelect(session.time, (state) => state.seconds);
  const playing = useSelect(session.time, (state) => state.playing);
  const last = lastFrame(clip);
  const position = playing ? Math.min(last, seconds * clip.fps) : frame;
  return <div className="tl-head" style={{ left: percentOf(position, last) }} />;
}
