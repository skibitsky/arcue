import type { AssetWarning, ReviewFile, WarningFix } from "@arcue/protocol";
import { Popover } from "radix-ui";
import { useEffect, useMemo, useState } from "react";
import type { AssetSession } from "../store/asset-session";
import { listedWarnings } from "../store/asset-session";
import { useSelect } from "../store/observable";
import { removableFromView } from "../store/view-files";
import type { WorkspaceStore } from "../store/workspace-store";
import { IconButton, Tip } from "./controls";
import { Icon } from "./Icon";

const kindNames = { texture: "Texture", material: "Material", node: "Node", clip: "Clip", file: "File" } as const;
const fixLabels: Record<WarningFix["kind"], string> = {
  "show-clip": "Show clip",
  retry: "Retry",
  "use-as-base-color": "Use as base color",
  "choose-texture": "Choose texture",
};

/** The status bar's import warnings: the first message and a count, opening the list above. Absent without any. */
export function WarningsStatus({ store, session }: { store: WorkspaceStore; session: AssetSession }) {
  const all = useSelect(session.state, (state) => state.warnings);
  const review = useSelect(session.state, (state) => state.review);
  const modelName = useSelect(session.state, (state) => state.summary.name);
  const warnings = useMemo(() => listedWarnings({ warnings: all }), [all]);
  const [open, setOpen] = useState(false);
  const first = warnings[0];
  useEffect(() => {
    if (first === undefined) setOpen(false);
  }, [first]);
  if (!first) return null;
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) session.highlightSubject(null);
  };
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button type="button" className="sb-warn">
          <Icon name="alert" />
          <span className="sb-warn-text">{first.message}</span>
          {warnings.length > 1 ? <span className="sb-warn-more">+{warnings.length - 1}</span> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="popover warn-pop"
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          aria-label="Import warnings"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
          }}
        >
          <div className="warn-head">
            <span className="warn-title">Warnings</span>
            <IconButton small icon="copy" label="Copy as prompt" onClick={() => void session.copyWarnings()} />
            <IconButton small icon="trash" label="Dismiss all" onClick={() => void session.dismissAllWarnings()} />
          </div>
          <ul className="warn-list">
            {warnings.map((warning) => (
              <WarningRow
                key={warning.id}
                store={store}
                session={session}
                warning={warning}
                review={review}
                modelName={modelName}
              />
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function draftNumber(review: ReviewFile | null, commentId: string | null): number | null {
  if (!review || commentId === null) return null;
  const index = review.queue.indexOf(commentId);
  return index === -1 ? null : index + 1;
}

function subjectText(warning: AssetWarning): string {
  const subject = `${kindNames[warning.subject.kind]} · ${warning.subject.name}`;
  return warning.file !== undefined && warning.file !== warning.subject.name ? `${subject} · ${warning.file}` : subject;
}

/** The member file a warning is about, when removing it takes it out of the view. */
function removableMember(warning: AssetWarning, modelName: string): string | null {
  const { file } = warning;
  if (file === undefined || warning.subject.kind !== "file" || warning.code === "composition-not-loaded") return null;
  return removableFromView(file, modelName) ? file : null;
}

function WarningRow({
  store,
  session,
  warning,
  review,
  modelName,
}: {
  store: WorkspaceStore;
  session: AssetSession;
  warning: AssetWarning;
  review: ReviewFile | null;
  modelName: string;
}) {
  const number = draftNumber(review, warning.commentId);
  const fix = warning.fix?.kind === "choose-texture" && !store.canAddFiles ? null : warning.fix;
  const removable = warning.fix?.kind === "retry" ? removableMember(warning, modelName) : null;
  const runFix = () => {
    if (fix?.kind === "choose-texture") void store.chooseTexture(session.assetId, fix.material, fix.slot);
    else void session.fixWarning(warning);
  };
  const message = <span className="warn-msg">{warning.message}</span>;
  return (
    <li
      className="warn-row"
      onPointerEnter={() => session.pointAtWarning(warning)}
      onPointerLeave={() => session.pointAtWarning(null)}
    >
      <Icon name="alert" />
      {warning.detail ? <Tip label={warning.detail}>{message}</Tip> : message}
      <div className="warn-sub">
        <span className="warn-subject">{subjectText(warning)}</span>
        <span className="warn-actions">
          {fix ? (
            <button type="button" className="warn-fix warn-hover" onClick={runFix}>
              {fixLabels[fix.kind]}
            </button>
          ) : null}
          {removable !== null ? (
            <button
              type="button"
              className="warn-fix warn-hover"
              onClick={() => void store.removeFileFromView(session.assetId, removable)}
            >
              Remove from view
            </button>
          ) : null}
          {number !== null ? (
            <Tip label={`Draft ${number}`}>
              <span className="warn-draft">{number}</span>
            </Tip>
          ) : (
            <IconButton
              small
              icon="comment"
              label="Add as comment"
              className="warn-hover"
              onClick={() => void session.commentOnWarning(warning.id)}
            />
          )}
          <IconButton
            small
            icon="trash"
            label="Dismiss"
            className="warn-hover"
            onClick={() => void session.dismissWarning(warning.id)}
          />
        </span>
      </div>
    </li>
  );
}
