import { Dialog } from "radix-ui";
import { useEffect, useRef } from "react";
import { isMacPlatform } from "../format";
import { useSelect } from "../store/observable";
import type { WorkspaceStore } from "../store/workspace-store";
import { Icon } from "./Icon";

const toastIcons = { copied: "check", info: "info", alert: "alert" } as const;

export function ToastView({ store }: { store: WorkspaceStore }) {
  const toast = useSelect(store.state, (state) => state.toast);
  return (
    <div className={`toast${toast ? " is-on" : ""}`} role="status" aria-live="polite" data-kind={toast?.kind}>
      {toast ? (
        <>
          <Icon name={toastIcons[toast.kind]} />
          <span>{toast.message}</span>
        </>
      ) : null}
    </div>
  );
}

/** Shows the prompt with its text selected when the clipboard is blocked. */
export function CopySheet({ store }: { store: WorkspaceStore }) {
  const sheet = useSelect(store.state, (state) => state.copySheet);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!sheet) return;
    const frame = requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [sheet]);
  return (
    <Dialog.Root open={sheet !== null} onOpenChange={(open) => (open ? undefined : store.closeCopySheet())}>
      <Dialog.Portal>
        <Dialog.Overlay className="copy-sheet" />
        <Dialog.Content className="copy-card" aria-describedby="copy-hint">
          <div className="copy-head">
            <Dialog.Title className="copy-title">Copy the prompt</Dialog.Title>
            <span id="copy-hint">
              The clipboard is blocked here. The text is selected; press {isMacPlatform() ? "⌘C" : "Ctrl+C"}.
            </span>
          </div>
          <textarea ref={textRef} readOnly spellCheck={false} value={sheet?.prompt ?? ""} aria-label="Prompt" />
          <div className="copy-foot">
            <Dialog.Close asChild>
              <button type="button" className="btn">
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
