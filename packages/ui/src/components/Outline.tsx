import type { SceneDescription, ScenePart } from "@arcue/scene";
import { partShown, splitMemberPath } from "@arcue/scene";
import { DropdownMenu } from "radix-ui";
import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isMacPlatform } from "../format";
import type { AssetSession } from "../store/asset-session";
import { useSelect } from "../store/observable";
import type { OutlineFile, OutlineItem, OutlineRow } from "../store/outline";
import {
  dropRowKey,
  dropTarget,
  fileRowKey,
  hasOutline,
  isTreeKey,
  outlineRows,
  outlineSize,
  outlineTree,
  treeKey,
} from "../store/outline";
import type { WorkspaceStore } from "../store/workspace-store";
import { IconButton, Tip } from "./controls";
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

interface Bone {
  node: number;
  name: string;
}

function iconOf(item: OutlineItem): IconName {
  if (item.kind === "bone") return "bone";
  if (item.kind === "part") return "mesh";
  if (item.kind === "file" && item.bone !== null) return "link";
  return "cube";
}

/** The DOM id of an asset's outline button, which takes the focus when the drawer closes around it. */
export function outlineButtonDomId(assetId: string): string {
  return `arcue-outline-${assetId.replace(/[^\w-]/g, "-")}`;
}

/** Focuses the outline button, or the toolbar's first button when the model no longer has an outline. */
function focusToolbar(assetId: string): void {
  const button = document.getElementById(outlineButtonDomId(assetId));
  if (button) {
    button.focus();
    return;
  }
  const panel = document.querySelector(".ws:not([hidden]) .toolbar button:not(:disabled)");
  if (panel instanceof HTMLElement) panel.focus();
}

/** The model's own bones, which an added file can attach to. */
function modelBones(scene: SceneDescription): Bone[] {
  return scene.nodes.flatMap((node, index) =>
    node.kind === "bone" && splitMemberPath(node.path).file === null ? [{ node: index, name: node.name }] : [],
  );
}

/** The row that keeps the focus when a file row and the rows under it leave: the next row after them, else the one above. */
function rowAfterRemoving(rows: readonly OutlineRow[], key: string): string | null {
  const at = rows.findIndex((row) => row.item.key === key);
  const row = rows[at];
  if (!row) return null;
  const after = rows.slice(at + 1).find((candidate) => candidate.depth <= row.depth);
  return after?.item.key ?? rows[at - 1]?.item.key ?? null;
}

/** The outline drawer: the model's files, the bones they hang on and their parts, docked left of the 3D view. */
export function OutlineDrawer({ store, session }: { store: WorkspaceStore; session: AssetSession }) {
  const scene = useSelect(session.state, (state) => state.scene);
  const open = useSelect(session.state, (state) => state.outlineOpen);
  const modelName = useSelect(session.state, (state) => state.summary.name);
  const skeleton = useSelect(session.state, (state) => state.skeleton);
  const view = useSelect(session.state, (state) => state.parts);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<string | null>(null);
  const focusInside = useRef(false);
  const treeRef = useRef<HTMLDivElement>(null);

  const visible = scene !== null && open && hasOutline(scene);
  const name = modelName || "Model";
  const filtering = filter.trim() !== "";
  const tree = useMemo(
    () => (scene && visible ? outlineTree(scene, name, skeleton || filtering ? "all" : "attached") : []),
    [scene, visible, name, skeleton, filtering],
  );
  const showFilter = useMemo(
    () => scene !== null && visible && outlineSize(outlineTree(scene, name, "all")) > FILTER_ROWS,
    [scene, visible, name],
  );
  const shownParts = useMemo(
    () => new Set(scene?.parts.flatMap((part) => (partShown(scene.parts, view, part) ? [part.id] : [])) ?? []),
    [scene, view],
  );
  const bones = useMemo(() => (scene && visible ? modelBones(scene) : []), [scene, visible]);
  const rows = useMemo(() => outlineRows(tree, { filter, collapsed }), [tree, filter, collapsed]);
  const focusKey = rows.some((row) => row.item.key === focused) ? focused : (rows[0]?.item.key ?? null);
  const dropKey = drag && drag.target !== undefined ? dropRowKey(rows, drag.target) : null;

  useEffect(() => {
    const key = pendingFocus.current;
    const element = key === null ? undefined : rowElements.current.get(key);
    if (!element) return;
    pendingFocus.current = null;
    const active = document.activeElement;
    const ours = active === null || active === document.body || active.closest(".outline, [role=menu]") !== null;
    if (ours) element.focus();
  });

  useEffect(() => {
    if (visible || !focusInside.current) return;
    focusInside.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body) focusToolbar(session.assetId);
  }, [visible, session.assetId]);

  if (!scene || !visible) return null;

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
    else session.setPartVisible(part.id, !shownParts.has(part.id));
  };
  const remove = (file: OutlineFile, keepFocus: boolean) => {
    const next = keepFocus ? rowAfterRemoving(rows, file.key) : null;
    if (next !== null) moveFocus(next);
    void store.removeFileFromView(session.assetId, file.file);
  };
  const attach = (file: OutlineFile, bone: number | null) => {
    moveFocus(fileRowKey(file.file, bone));
    void session.attachFile(file, bone);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
    const row = rows.find((candidate) => candidate.item.key === focusKey);
    if (isTreeKey(event.key) && !event.altKey) {
      event.preventDefault();
      const action = treeKey(rows, focusKey, event.key);
      if (action && "toggle" in action) toggleRow(action.toggle);
      else if (action) moveFocus(action.focus);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      if (row?.item.kind === "file") {
        event.preventDefault();
        remove(row.item, true);
      }
    } else if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat && row?.item.kind === "part") toggleEye(row.item.part, event.altKey);
    } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      if (row?.item.kind === "file") {
        event.preventDefault();
        setMenuFor(row.item.key);
      }
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
    <aside
      className="outline"
      aria-label="Outline"
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(event) => {
        const aside = event.currentTarget;
        const next = event.relatedTarget;
        if (next instanceof Node) {
          if (!aside.contains(next)) focusInside.current = false;
          return;
        }
        setTimeout(() => {
          if (aside.isConnected && !aside.contains(document.activeElement)) focusInside.current = false;
        }, 0);
      }}
    >
      {showFilter || store.canAddFiles ? (
        <div className="dr-head">
          {showFilter ? (
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
          ) : (
            <span className="grow" />
          )}
          {store.canAddFiles ? (
            <IconButton
              small
              icon="plus"
              label="Add file"
              tipSide="bottom"
              onClick={() => void store.addFileToView(session.assetId)}
            />
          ) : null}
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
            shown={row.item.kind === "part" ? shownParts.has(row.item.part.id) : true}
            isolated={row.item.kind === "part" && view.isolated === row.item.part.id}
            register={(element) => {
              if (element) rowElements.current.set(row.item.key, element);
              else rowElements.current.delete(row.item.key);
            }}
            onFocus={() => setFocused(row.item.key)}
            onToggle={() => toggleRow(row.item.key)}
            onEye={toggleEye}
            onRemove={(file) => remove(file, treeRef.current?.contains(document.activeElement) ?? false)}
            onMenu={(file) => {
              setFocused(file.key);
              setMenuFor(file.key);
            }}
            onDragStart={(event, item) => {
              event.dataTransfer.setData(OUTLINE_DRAG_TYPE, item.key);
              event.dataTransfer.effectAllowed = "move";
              setDrag({ item, target: undefined });
            }}
            onDragEnd={() => setDrag(null)}
            onDragOver={(event) => over(event, row.item.key)}
            onDrop={(event) => drop(event, row.item.key)}
          >
            {row.item.kind === "file" ? (
              <FileMenu
                open={menuFor === row.item.key}
                file={row.item}
                bones={bones}
                onAttach={(bone) => attach(row.item as OutlineFile, bone)}
                onRemove={() => remove(row.item as OutlineFile, true)}
                onClose={() => setMenuFor(null)}
                onFocusBack={() => {
                  if (pendingFocus.current === null) rowElements.current.get(row.item.key)?.focus();
                }}
              />
            ) : null}
          </TreeRow>
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
  onRemove: (file: OutlineFile) => void;
  onMenu: (file: OutlineFile) => void;
  onDragStart: (event: DragEvent, item: OutlineFile) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  children?: ReactNode;
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
      aria-haspopup={file ? "menu" : undefined}
      tabIndex={props.focusable ? 0 : -1}
      className={classes}
      style={{ paddingLeft: 4 + row.depth * INDENT }}
      draggable={file !== null}
      onFocus={(event) => {
        if (event.target === event.currentTarget) props.onFocus();
      }}
      onContextMenu={
        file
          ? (event) => {
              event.preventDefault();
              props.onMenu(file);
            }
          : undefined
      }
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
      {file ? (
        <Tip label="Remove from view" side="right">
          <button
            type="button"
            className="tr-eye tr-remove"
            tabIndex={-1}
            aria-label={`Remove ${file.name} from view`}
            onMouseDown={(event: MouseEvent) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              props.onRemove(file);
            }}
          >
            <Icon name="trash" />
          </button>
        </Tip>
      ) : null}
      {props.children}
    </div>
  );
}

/**
 * A file row's menu, opened by a right-click, the Menu key or Shift+F10: attach the file to a bone of the model,
 * detach it, or remove it from the view. It stays mounted while closed, so it sees the key that opens it and then
 * focuses its first item, as menus opened from the keyboard do.
 */
function FileMenu({
  open,
  file,
  bones,
  onAttach,
  onRemove,
  onClose,
  onFocusBack,
}: {
  open: boolean;
  file: OutlineFile;
  bones: readonly Bone[];
  onAttach: (bone: number | null) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Returns the focus to the row, unless the menu closed because of a click or focus outside it. */
  onFocusBack: () => void;
}) {
  const targets = bones.filter((bone) => bone.node !== file.bone);
  const outside = useRef(false);
  return (
    <DropdownMenu.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())} modal={false}>
      <DropdownMenu.Trigger asChild>
        <span className="tr-menu-anchor" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu menu-file"
          side="bottom"
          align="end"
          sideOffset={2}
          collisionPadding={8}
          aria-label={file.name}
          aria-labelledby={undefined}
          onInteractOutside={() => {
            outside.current = true;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!outside.current) onFocusBack();
            outside.current = false;
          }}
        >
          {targets.length > 0 ? (
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="menu-item">
                <Icon name="link" className="mi-icon" />
                <span className="mi-label">Attach to bone</span>
                <Icon name="chevronRight" className="mi-icon" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="menu menu-bones" sideOffset={4} collisionPadding={8}>
                  {targets.map((bone) => (
                    <DropdownMenu.Item key={bone.node} className="menu-item" onSelect={() => onAttach(bone.node)}>
                      <Icon name="bone" className="mi-icon" />
                      <span className="mi-label">{bone.name}</span>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ) : null}
          {file.bone !== null ? (
            <DropdownMenu.Item className="menu-item" onSelect={() => onAttach(null)}>
              <Icon name="cube" className="mi-icon" />
              <span className="mi-label">Detach</span>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item className="menu-item" onSelect={onRemove}>
            <Icon name="trash" className="mi-icon" />
            <span className="mi-label">Remove from view</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
