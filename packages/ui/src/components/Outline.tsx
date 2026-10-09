import type { ScenePart } from "@arcue/scene";
import { partShown } from "@arcue/scene";
import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isMacPlatform } from "../format";
import type { AssetSession } from "../store/asset-session";
import { useSelect } from "../store/observable";
import type { OutlineFile, OutlineItem, OutlineRow } from "../store/outline";
import {
  dropRowKey,
  dropTarget,
  hasOutline,
  isTreeKey,
  outlineRows,
  outlineSize,
  outlineTree,
  treeKey,
} from "../store/outline";
import { Tip } from "./controls";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

/** A tree this long gets a filter. */
const FILTER_ROWS = 12;
const INDENT = 14;
const OUTLINE_DRAG_TYPE = "application/x-arcue-outline-file";

interface Drag {
  item: OutlineFile;
  /** Where a drop would send the file: a bone's node index, null to detach, undefined for nowhere. */
  target: number | null | undefined;
}

function iconOf(item: OutlineItem): IconName {
  if (item.kind === "bone") return "bone";
  if (item.kind === "part") return "mesh";
  if (item.kind === "file" && item.bone !== null) return "link";
  return "cube";
}

/** The outline drawer: the model's files, the bones they hang on and their parts, docked left of the 3D view. */
export function OutlineDrawer({ session }: { session: AssetSession }) {
  const scene = useSelect(session.state, (state) => state.scene);
  const open = useSelect(session.state, (state) => state.outlineOpen);
  const modelName = useSelect(session.state, (state) => state.summary.name);
  const skeleton = useSelect(session.state, (state) => state.skeleton);
  const view = useSelect(session.state, (state) => state.parts);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const available = scene !== null && hasOutline(scene);
  const name = modelName || "Model";
  const filtering = filter.trim() !== "";
  const tree = useMemo(
    () => (scene && available ? outlineTree(scene, name, skeleton || filtering ? "all" : "attached") : []),
    [scene, available, name, skeleton, filtering],
  );
  const showFilter = useMemo(
    () => scene !== null && available && outlineSize(outlineTree(scene, name, "all")) > FILTER_ROWS,
    [scene, available, name],
  );
  const rows = useMemo(() => outlineRows(tree, { filter, collapsed }), [tree, filter, collapsed]);
  const focusKey = rows.some((row) => row.item.key === focused) ? focused : (rows[0]?.item.key ?? null);
  const dropKey = drag && drag.target !== undefined ? dropRowKey(rows, drag.target) : null;

  useEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    rowElements.current.get(key)?.focus();
  });

  if (!scene || !available) return null;

  const moveFocus = (key: string) => {
    setFocused(key);
    pendingFocus.current = key;
  };
  const toggleRow = (key: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const toggleEye = (part: ScenePart, alt: boolean) => {
    if (alt) session.isolatePart(view.isolated === part.id ? null : part.id);
    else session.setPartVisible(part.id, !partShown(scene.parts, view, part));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
    if (isTreeKey(event.key) && !event.altKey) {
      event.preventDefault();
      const action = treeKey(rows, focusKey, event.key);
      if (action && "toggle" in action) toggleRow(action.toggle);
      else if (action) moveFocus(action.focus);
    } else if (event.key === " ") {
      event.preventDefault();
      const row = rows.find((candidate) => candidate.item.key === focusKey);
      if (!event.repeat && row?.item.kind === "part") toggleEye(row.item.part, event.altKey);
    }
  };

  const over = (event: DragEvent, key: string | null) => {
    if (!drag) return;
    event.stopPropagation();
    const target = dropTarget(rows, drag.item, key);
    if (target !== undefined) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
    if (target !== drag.target) setDrag({ ...drag, target });
  };
  const drop = (event: DragEvent, key: string | null) => {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const target = dropTarget(rows, drag.item, key);
    setDrag(null);
    if (target !== undefined) void session.attachFile(drag.item, target);
  };

  return (
    <aside className="outline" aria-label="Outline" hidden={!open}>
      {showFilter ? (
        <div className="dr-head">
          <label className="dr-filter">
            <Icon name="search" />
            <input
              type="text"
              value={filter}
              placeholder="Filter"
              aria-label="Filter"
              spellCheck={false}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (filter !== "") setFilter("");
                  else event.currentTarget.blur();
                } else if (event.key === "ArrowDown" && rows[0]) {
                  event.preventDefault();
                  moveFocus(rows[0].item.key);
                }
              }}
            />
          </label>
        </div>
      ) : null}
      <div
        ref={treeRef}
        className="tree"
        role="tree"
        aria-label="Files, bones and parts"
        onKeyDown={onKeyDown}
        onDragOver={(event) => over(event, null)}
        onDrop={(event) => drop(event, null)}
        onDragLeave={(event) => {
          const next = event.relatedTarget;
          if (drag && !(next instanceof Node && treeRef.current?.contains(next)))
            setDrag({ ...drag, target: undefined });
        }}
      >
        {rows.map((row) => (
          <TreeRow
            key={row.item.key}
            row={row}
            focusable={row.item.key === focusKey}
            dropping={row.item.key === dropKey}
            dragging={drag?.item.key === row.item.key}
            shown={row.item.kind === "part" ? partShown(scene.parts, view, row.item.part) : true}
            isolated={row.item.kind === "part" && view.isolated === row.item.part.id}
            register={(element) => {
              if (element) rowElements.current.set(row.item.key, element);
              else rowElements.current.delete(row.item.key);
            }}
            onFocus={() => setFocused(row.item.key)}
            onToggle={() => toggleRow(row.item.key)}
            onEye={toggleEye}
            onDragStart={(event, item) => {
              event.dataTransfer.setData(OUTLINE_DRAG_TYPE, item.key);
              event.dataTransfer.effectAllowed = "move";
              setDrag({ item, target: undefined });
            }}
            onDragEnd={() => setDrag(null)}
            onDragOver={(event) => over(event, row.item.key)}
            onDrop={(event) => drop(event, row.item.key)}
          />
        ))}
      </div>
    </aside>
  );
}

interface TreeRowProps {
  row: OutlineRow;
  focusable: boolean;
  dropping: boolean;
  dragging: boolean;
  shown: boolean;
  isolated: boolean;
  register: (element: HTMLDivElement | null) => void;
  onFocus: () => void;
  onToggle: () => void;
  onEye: (part: ScenePart, alt: boolean) => void;
  onDragStart: (event: DragEvent, item: OutlineFile) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

function TreeRow(props: TreeRowProps) {
  const { row, shown, isolated } = props;
  const { item } = row;
  const classes = [
    "tr",
    `is-${item.kind}`,
    item.kind === "part" && !shown ? "is-off" : "",
    props.dropping ? "is-drop" : "",
    props.dragging ? "is-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const file = item.kind === "file" ? item : null;
  return (
    <div
      ref={props.register}
      role="treeitem"
      aria-label={item.name}
      aria-level={row.depth + 1}
      aria-expanded={row.expandable ? row.expanded : undefined}
      aria-selected={props.focusable}
      tabIndex={props.focusable ? 0 : -1}
      className={classes}
      style={{ paddingLeft: 4 + row.depth * INDENT }}
      draggable={file !== null}
      onFocus={(event) => {
        if (event.target === event.currentTarget) props.onFocus();
      }}
      onDragStart={file ? (event) => props.onDragStart(event, file) : undefined}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
    >
      {row.expandable ? (
        <span
          className={row.expanded ? "tr-chev" : "tr-chev is-closed"}
          aria-hidden="true"
          onClick={(event) => {
            event.stopPropagation();
            props.onToggle();
          }}
        >
          <Icon name="chevronDown" />
        </span>
      ) : (
        <span className="tr-chev" aria-hidden="true" />
      )}
      <Icon name={iconOf(item)} className="tr-kind" />
      <span className="tr-name">{item.name}</span>
      {item.kind === "part" ? (
        <EyeButton part={item.part} shown={shown} isolated={isolated} onEye={props.onEye} />
      ) : null}
    </div>
  );
}

function EyeButton({
  part,
  shown,
  isolated,
  onEye,
}: {
  part: ScenePart;
  shown: boolean;
  isolated: boolean;
  onEye: (part: ScenePart, alt: boolean) => void;
}) {
  const alt = isMacPlatform() ? "⌥" : "Alt";
  return (
    <Tip label={shown ? "Hide" : "Show"} shortcut={`${alt}-click ${isolated ? "shows all" : "isolates"}`} side="right">
      <button
        type="button"
        className={isolated ? "tr-eye is-isolated" : "tr-eye"}
        tabIndex={-1}
        aria-label={`${shown ? "Hide" : "Show"} ${part.name}`}
        onMouseDown={(event: MouseEvent) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onEye(part, event.altKey);
        }}
      >
        <Icon name={shown ? "eye" : "eyeOff"} />
      </button>
    </Tip>
  );
}
