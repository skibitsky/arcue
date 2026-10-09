import type { KeyboardEvent } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { clipDisplayName, targetLabel, timeLabel } from "../format";
import type { AssetSession, CommentBox as CommentBoxState } from "../store/asset-session";
import { placeBox } from "../store/box-placement";
import { useSelect } from "../store/observable";
import { Chip, fitHeight, IconButton, Tip } from "./controls";
import { Icon } from "./Icon";

/** The layer over the 3D view that holds the comment box beside its pin. */
export function CommentBoxLayer({ session }: { session: AssetSession }) {
  const box = useSelect(session.state, (state) => state.box);
  if (!box) return <div className="box-layer" />;
  return (
    <div className="box-layer">
      <CommentBox key={box.id} session={session} box={box} />
    </div>
  );
}

function CommentBox({ session, box }: { session: AssetSession; box: CommentBoxState }) {
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scene = useSelect(session.state, (state) => state.scene);
  const queue = useSelect(session.state, (state) => state.review?.queue ?? null);
  const number =
    box.mode === "edit" && box.commentId && queue ? queue.indexOf(box.commentId) + 1 : (queue?.length ?? 0) + 1;

  useLayoutEffect(() => {
    const form = formRef.current;
    const layer = form?.parentElement;
    if (!form || !layer) return;
    const place = () => {
      const position = box.target ? session.screenPosition(box.target) : null;
      const placement = placeBox(
        position,
        { width: form.offsetWidth, height: form.offsetHeight },
        { width: layer.clientWidth, height: layer.clientHeight },
      );
      form.style.transform = `translate3d(${Math.round(placement.x)}px, ${Math.round(placement.y)}px, 0)`;
      form.dataset.side = placement.side;
    };
    place();
    const unsubscribers = [session.camera.subscribe(place), session.time.subscribe(place)];
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(form);
    observer?.observe(layer);
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      observer?.disconnect();
    };
  }, [session, box.target]);

  useEffect(() => {
    if (box.mode === "edit") return;
    const frame = requestAnimationFrame(() => textRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [box.mode]);

  useLayoutEffect(() => {
    if (textRef.current) fitHeight(textRef.current, 132);
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form || box.nudge === 0) return;
    form.classList.remove("is-nudge");
    void form.offsetWidth;
    form.classList.add("is-nudge");
    textRef.current?.focus({ preventScroll: true });
  }, [box.nudge]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void session.submitBox();
    } else if (event.key === "Escape") {
      event.preventDefault();
      session.closeBox();
    }
  };

  const time = timeLabel(box.time, (clip) => clipDisplayName(scene, clip));
  const placeLocked = box.mode === "reopen";
  const removeAndFocus = (chip: "time" | "target" | "followUp") => {
    session.removeBoxChip(chip);
    textRef.current?.focus({ preventScroll: true });
  };
  const chips = [
    time ? (
      <Chip
        key="time"
        icon="clock"
        label={time}
        {...(placeLocked
          ? {}
          : {
              removeLabel: "Remove the time. The comment then applies to the model itself.",
              onRemove: () => removeAndFocus("time"),
            })}
      />
    ) : box.restPose ? (
      <Chip key="time" icon="clock" label="Rest pose" />
    ) : null,
    box.needsRepick ? (
      <Chip
        key="target"
        icon="alert"
        tone="alert"
        label="Model changed · pick again"
        removeLabel="Comment without a surface target instead"
        onRemove={() => removeAndFocus("target")}
      />
    ) : box.target ? (
      <Chip
        key="target"
        icon={box.target.kind === "region" ? "region" : "pin"}
        label={targetLabel(box.target, box.targetBone)}
        {...(placeLocked ? {} : { removeLabel: "Remove the surface target", onRemove: () => removeAndFocus("target") })}
      />
    ) : null,
    box.followUpRound !== null ? (
      box.mode === "reopen" ? (
        <Chip
          key="follow"
          icon="follow"
          label={`Follow-up · round ${box.followUpRound}`}
          removeLabel="Remove the link to the earlier comment"
          onRemove={() => removeAndFocus("followUp")}
        />
      ) : (
        <Chip key="follow" icon="follow" label={`Follow-up · round ${box.followUpRound}`} />
      )
    ) : null,
  ].filter((chip) => chip !== null);

  const sendLabel = box.mode === "edit" ? "Save" : "Add to queue";
  return (
    <form
      ref={formRef}
      className="cbox"
      aria-label={`Comment ${number}`}
      data-mode={box.mode}
      onSubmit={(event) => {
        event.preventDefault();
        void session.submitBox();
      }}
    >
      <div className="cbox-top">
        <span className="cbox-n">{number}</span>
        <div className="cbox-chips">{chips.length > 0 ? chips : <Chip label="No anchor" />}</div>
      </div>
      <textarea
        ref={textRef}
        className="cbox-text"
        rows={2}
        value={box.text}
        placeholder={box.mode === "reopen" ? "What still needs to change?" : "What should change?"}
        aria-label="Comment text"
        onChange={(event) => {
          session.setBoxText(event.target.value);
          fitHeight(event.target, 132);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="cbox-foot">
        <IconButton
          small
          icon="trash"
          label={box.mode === "edit" ? "Delete comment" : "Discard"}
          onClick={() => {
            if (box.mode === "edit" && box.commentId) void session.deleteDraft(box.commentId);
            else session.closeBox();
          }}
        />
        <span className="cbox-hint" />
        <Tip label={sendLabel} shortcut="↵">
          <button type="submit" className="cbox-send" aria-label={sendLabel} disabled={!box.text.trim() || box.busy}>
            <Icon name="send" />
          </button>
        </Tip>
      </div>
    </form>
  );
}
