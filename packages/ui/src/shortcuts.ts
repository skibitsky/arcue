import { isMacPlatform } from "./format";
import type { AssetSession } from "./store/asset-session";

const TEXT_FIELDS =
  "input:not([type='range'], [type='checkbox'], [type='radio'], [type='button'], [type='submit']), textarea, select, [contenteditable='true']";
const WIDGETS_WITH_KEYS = "[role='menu'], [role='dialog'], [role='slider'], input[type='range']";
const ACTIVATED_BY_SPACE = "button, a[href], summary, [role='button'], [role='tab'], [role='menuitem']";
const BRUSH_STEP = 4;

/** Cmd+Z and Shift+Cmd+Z on macOS; Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y elsewhere. */
function historyKey(event: KeyboardEvent): "undo" | "redo" | null {
  const mac = isMacPlatform();
  if (event.altKey || !(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return key === "y" && !mac && !event.shiftKey ? "redo" : null;
}

/** Whether an element is or sits in a text field, which keeps its own undo and most keys. */
export function inTextField(element: Element | null): boolean {
  return element !== null && element.closest(TEXT_FIELDS) !== null;
}

export interface ShortcutOptions {
  /** Whether the undo and redo keys run review.undo and review.redo; off where a native menu takes those keys. */
  history: boolean;
}

/** Runs the spec's shortcuts for the visible tab. Returns true when the key was used. */
export function handleShortcut(
  event: KeyboardEvent,
  session: AssetSession,
  options: ShortcutOptions = { history: true },
): boolean {
  const target = event.target instanceof Element ? event.target : null;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key;
  if (mod && event.shiftKey && key.toLowerCase() === "c") {
    void session.copyPrompt();
    return true;
  }
  if (event.defaultPrevented || inTextField(target)) return false;
  const history = options.history ? historyKey(event) : null;
  if (history === "undo") void session.undo();
  if (history === "redo") void session.redo();
  if (history) return true;
  if (target?.closest(WIDGETS_WITH_KEYS)) return false;
  const selection = session.state.get().selection;
  if (
    (key === "Delete" || (mod && key === "Backspace")) &&
    selection &&
    session.comment(selection)?.status === "draft"
  ) {
    void session.deleteDraft(selection);
    return true;
  }
  if (mod || event.altKey) return false;
  switch (key) {
    case " ":
      if (target?.closest(ACTIVATED_BY_SPACE)) return false;
      if (!event.repeat) session.togglePlaying();
      return true;
    case "v":
    case "V":
      session.setTool("view");
      return true;
    case "c":
    case "C":
      session.setTool("comment");
      return true;
    case "ArrowLeft":
      session.step(event.shiftKey ? -10 : -1);
      return true;
    case "ArrowRight":
      session.step(event.shiftKey ? 10 : 1);
      return true;
    case ",":
      session.jumpToKey(-1);
      return true;
    case ".":
      session.jumpToKey(1);
      return true;
    case "[":
      session.setBrushSize(session.state.get().brushSize - BRUSH_STEP);
      return true;
    case "]":
      session.setBrushSize(session.state.get().brushSize + BRUSH_STEP);
      return true;
    case "f":
    case "F":
      session.frameSelection();
      return true;
    case "o":
    case "O":
      if (!session.outlineAvailable()) return false;
      session.setOutlineOpen(!session.state.get().outlineOpen);
      return true;
    case "Escape":
      session.escape();
      return true;
    default:
      return false;
  }
}
