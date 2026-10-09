import type { Comment } from "@arcue/protocol";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clipDisplayName, formatWhen, modShortcut, targetLabel, timeLabel } from "../format";
import type { AssetSession } from "../store/asset-session";
import type { HistoryItem } from "../store/history";
import { currentMessage, historyRounds, pendingFollowUp, queuedComments, roundSummaryText } from "../store/history";
import { useSelect } from "../store/observable";
import { Chip, fitHeight, IconButton, Tip } from "./controls";
import { Icon } from "./Icon";

export function CommentsPanel({ session, now }: { session: AssetSession; now: () => Date }) {
  const review = useSelect(session.state, (state) => state.review);
  const queue = useMemo(() => (review ? queuedComments(review) : []), [review]);
  const rounds = useMemo(() => (review ? historyRounds(review) : []), [review]);
  return (
    <aside className="panel" aria-label="Comments">
      <div className="panel-head">
        <span className="panel-title">Comments</span>
      </div>
      <div className="panel-body">
        {queue.length > 0 ? (
          <ol className="queue" aria-label="Drafts">
            {queue.map((comment, index) => (
              <QueueItem key={comment.id} session={session} comment={comment} number={index + 1} />
            ))}
          </ol>
        ) : null}
        {rounds.length > 0 ? (
          <>
            <div className="sec-label">History</div>
            <HistoryList session={session} rounds={rounds} now={now} />
          </>
        ) : null}
      </div>
      <div className="panel-foot">
        <NoteField session={session} />
        <CopyPromptButton session={session} count={queue.length} />
      </div>
    </aside>
  );
}

function CommentChips({ session, comment }: { session: AssetSession; comment: Comment }) {
  const scene = useSelect(session.state, (state) => state.scene);
  const time = timeLabel(comment.time, (clip) => clipDisplayName(scene, clip)) ?? "Rest pose";
  const followUp = pendingFollowUp(comment);
  return (
    <span className="qi-chips">
      <Chip small label={time} />
      {comment.target ? (
        <Chip small label={targetLabel(comment.target, comment.context.bones[0]?.name ?? null)} />
      ) : null}
      {followUp ? <Chip small label={`Follow-up · round ${followUp.afterRound}`} /> : null}
      <AnchorStateChip comment={comment} />
    </span>
  );
}

function AnchorStateChip({ comment }: { comment: Comment }) {
  if (comment.anchorState === "exact") return null;
  return <Chip small tone="alert" label={comment.anchorState === "moved" ? "Moved" : "Detached"} />;
}

function QueueItem({ session, comment, number }: { session: AssetSession; comment: Comment; number: number }) {
  const selected = useSelect(session.state, (state) => state.selection === comment.id);
  const added = useSelect(session.state, (state) => state.added === comment.id);
  const thumbnail = useSelect(session.thumbnails, (state) => state.urls[comment.id] ?? null);
  const itemRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    void session.loadThumbnail(comment);
  }, [session, comment]);
  useEffect(() => {
    if (selected) itemRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  const classes = ["qi", selected ? "is-selected" : "", added ? "is-added" : ""].filter(Boolean).join(" ");
  const text = currentMessage(comment);
  return (
    <li className={classes} ref={itemRef}>
      <button
        type="button"
        className="qi-main"
        aria-label={`Comment ${number}: ${text}`}
        aria-current={selected ? "true" : undefined}
        onClick={() => session.selectComment(comment.id)}
      >
        <span className="qi-n">{number}</span>
        {thumbnail ? (
          <img className="qi-thumb" src={thumbnail} alt="" />
        ) : (
          <span className={comment.warning ? "qi-thumb is-blank is-alert" : "qi-thumb is-blank"}>
            <Icon name={comment.warning ? "alert" : comment.target ? "pin" : "clock"} />
          </span>
        )}
        <span className="qi-body">
          <span className="qi-text">{text}</span>
          <CommentChips session={session} comment={comment} />
        </span>
      </button>
      <IconButton
        small
        icon="trash"
        className="qi-del"
        label={`Delete comment ${number}`}
        shortcut={modShortcut("⌫")}
        onClick={() => void session.deleteDraft(comment.id)}
      />
    </li>
  );
}

const statusIcons = { sent: "sent", resolved: "check", reopened: "reopen" } as const;
const statusNames = { sent: "Sent", resolved: "Resolved", reopened: "Reopened" } as const;
const statusNotes = { sent: "", resolved: "", reopened: "Reopened" } as const;

function HistoryList({
  session,
  rounds,
  now,
}: {
  session: AssetSession;
  rounds: ReturnType<typeof historyRounds>;
  now: () => Date;
}) {
  const newest = rounds[0]?.number ?? null;
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(newest === null ? [] : [newest]));
  const seenNewest = useRef(newest);
  useEffect(() => {
    if (newest !== null && newest !== seenNewest.current) {
      seenNewest.current = newest;
      setOpen((previous) => new Set([...previous, newest]));
    }
  }, [newest]);
  return (
    <div className="history">
      {rounds.map((round) => (
        <details
          key={round.number}
          className="round"
          open={open.has(round.number)}
          onToggle={(event) => {
            const isOpen = event.currentTarget.open;
            setOpen((previous) => {
              if (previous.has(round.number) === isOpen) return previous;
              const next = new Set(previous);
              if (isOpen) next.add(round.number);
              else next.delete(round.number);
              return next;
            });
          }}
        >
          <summary>
            <Icon name="chevronRight" className="round-chevron" />
            <span className="round-name">Round {round.number}</span>
            <span className="round-when">{formatWhen(round.createdAt, now())}</span>
            <span className="round-stat">{roundSummaryText(round.counts)}</span>
          </summary>
          <ul className="hlist">
            {round.items.map((item) => (
              <HistoryRow key={item.comment.id} session={session} item={item} round={round.number} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function HistoryRow({ session, item, round }: { session: AssetSession; item: HistoryItem; round: number }) {
  const selected = useSelect(session.state, (state) => state.selection === item.comment.id);
  const note = statusNotes[item.status];
  return (
    <li className={`hi is-${item.status}${selected ? " is-selected" : ""}`}>
      <span className="hi-ic" role="img" aria-label={statusNames[item.status]}>
        <Icon name={statusIcons[item.status]} />
      </span>
      <button
        type="button"
        className="hi-text"
        aria-label={`Round ${round}: ${item.text}`}
        aria-current={selected ? "true" : undefined}
        onClick={() => session.selectComment(item.comment.id)}
      >
        {item.text}
        {note || item.comment.anchorState !== "exact" ? (
          <span className="hi-note">
            {note}
            {item.comment.anchorState !== "exact" ? (
              <span className="hi-alert">
                {note ? " · " : ""}
                {item.comment.anchorState === "moved" ? "Moved" : "Detached"}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      {item.action === "resolve" ? (
        <IconButton small icon="check" label="Mark resolved" onClick={() => void session.resolve(item.comment.id)} />
      ) : item.action === "reopen" ? (
        <IconButton
          small
          icon="reopen"
          label="Reopen with a follow-up"
          onClick={() => session.reopen(item.comment.id)}
        />
      ) : (
        <span />
      )}
    </li>
  );
}

function NoteField({ session }: { session: AssetSession }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const scene = useSelect(session.state, (state) => state.scene);
  useSelect(session.state, (state) => state.clip);
  useSelect(session.state, (state) => state.range);
  useSelect(session.time, () => session.currentFrame());
  const label = timeLabel(session.currentTime(), (clip) => clipDisplayName(scene, clip));
  const placeholder = label ? `Comment on ${label}` : "Comment on the model";

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const added = await session.addTextComment(text);
    setBusy(false);
    if (added) {
      setText("");
      if (fieldRef.current) fieldRef.current.style.height = "auto";
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };
  return (
    <form
      className="note"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        ref={fieldRef}
        rows={1}
        value={text}
        placeholder={placeholder}
        aria-label="Comment without a pin"
        onChange={(event) => {
          setText(event.target.value);
          fitHeight(event.target, 110);
        }}
        onKeyDown={onKeyDown}
      />
      <Tip label="Add to queue" shortcut="↵">
        <button type="submit" className="cbox-send" aria-label="Add to queue" disabled={!text.trim() || busy}>
          <Icon name="send" />
        </button>
      </Tip>
    </form>
  );
}

function CopyPromptButton({ session, count }: { session: AssetSession; count: number }) {
  return (
    <Tip label="Copy prompt" shortcut={modShortcut("C", { shift: true })}>
      <button type="button" className="primary" disabled={count === 0} onClick={() => void session.copyPrompt()}>
        <Icon name="copy" />
        <span>Copy prompt</span>
        {count > 0 ? <span className="badge">{count}</span> : null}
      </button>
    </Tip>
  );
}
