import type { AssetSession } from "./store/asset-session";

const TEXT_FIELDS = "input, textarea, select, [contenteditable='true']";
const WIDGETS_WITH_KEYS = "[role='menu'], [role='dialog'], [role='slider'], input[type='range']";
const ACTIVATED_BY_SPACE = "button, a[href], summary, [role='button'], [role='tab'], [role='menuitem']";
const BRUSH_STEP = 4;

/** Runs the spec's shortcuts for the visible tab. Returns true when the key was used. */
export function handleShortcut(event: KeyboardEvent, session: AssetSession): boolean {
  const target = event.target instanceof Element ? event.target : null;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key;
  if (mod && event.shiftKey && key.toLowerCase() === "c") {
    void session.copyPrompt();
    return true;
  }
  if (event.defaultPrevented || target?.closest(TEXT_FIELDS) || target?.closest(WIDGETS_WITH_KEYS)) return false;
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
    case "Escape":
      session.escape();
      return true;
    default:
      return false;
  }
}
