import type { Readable } from "@arcue/ui";
import { Icon, Tip, useSelect } from "@arcue/ui";
import type { UpdateAction, UpdateState } from "../shared/ipc";

/**
 * The title bar's offer of an update, shown only while there is one: restart into it, which reopens every window as
 * it is, or download it from its release page where this app cannot install it.
 */
export function UpdateButton({
  update,
  onAction,
}: {
  update: Readable<{ state: UpdateState }>;
  onAction: (action: UpdateAction) => void;
}) {
  const state = useSelect(update, (value) => value.state);
  switch (state.status) {
    case "none":
      return null;
    case "ready":
      return (
        <Tip label={`Arcue ${state.version} · Your tabs and comments reopen`} side="bottom">
          <button type="button" className="btn update-button" onClick={() => onAction("restart")}>
            <Icon name="restart" />
            Restart to update
          </button>
        </Tip>
      );
    case "manual":
      return (
        <Tip label={`Arcue ${state.version} is out`} side="bottom">
          <button type="button" className="btn update-button" onClick={() => onAction("download")}>
            <Icon name="download" />
            Download update
          </button>
        </Tip>
      );
    case "installing":
      return (
        <button type="button" className="btn update-button" disabled>
          <Icon name="restart" />
          Restarting…
        </button>
      );
  }
}
