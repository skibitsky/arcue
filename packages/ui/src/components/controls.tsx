import { Tooltip } from "radix-ui";
import type { ComponentProps, FocusEvent, ReactElement, ReactNode } from "react";
import { useRef } from "react";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

export type TipSide = "top" | "bottom" | "left" | "right";

/** A tooltip with the control's name and, when it has one, its shortcut. */
export function Tip({
  label,
  shortcut,
  side = "top",
  children,
}: {
  label: ReactNode;
  shortcut?: string | undefined;
  side?: TipSide;
  children: ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tip" side={side} sideOffset={8} collisionPadding={6}>
          <span>{label}</span>
          {shortcut ? <kbd>{shortcut}</kbd> : null}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * Keeps the tooltip of a menu's trigger closed when the menu closes and focuses the trigger again, so it opens only on
 * hover and keyboard focus. Pass `onFocus` to the trigger and `onCloseAutoFocus` to the menu's content. The tooltip
 * does not open on a focus event whose default was prevented.
 */
export function useQuietFocusReturn() {
  const returning = useRef(false);
  return {
    onFocus: (event: FocusEvent) => {
      if (returning.current) event.preventDefault();
    },
    onCloseAutoFocus: () => {
      returning.current = true;
      queueMicrotask(() => {
        returning.current = false;
      });
    },
  };
}

interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  icon: IconName;
  label: string;
  shortcut?: string | undefined;
  tipSide?: TipSide;
  pressed?: boolean;
  small?: boolean;
  /** Why the button does nothing now. It shows dimmed with this as its tooltip, which a disabled button could not show. */
  unavailable?: string | undefined;
}

export function IconButton({
  icon,
  label,
  shortcut,
  tipSide,
  pressed,
  small,
  unavailable,
  className,
  onClick,
  ...rest
}: IconButtonProps) {
  const classes = ["ibtn", small ? "ibtn-sm" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <Tip label={unavailable ?? label} shortcut={unavailable ? undefined : shortcut} side={tipSide ?? "top"}>
      <button
        type="button"
        className={classes}
        aria-label={label}
        aria-pressed={pressed}
        aria-disabled={unavailable ? true : undefined}
        onClick={unavailable ? undefined : onClick}
        {...rest}
      >
        <Icon name={icon} />
      </button>
    </Tip>
  );
}

export function Chip({
  icon,
  label,
  tip,
  onRemove,
  removeLabel,
  tone,
  small,
}: {
  icon?: IconName;
  label: string;
  /** A tooltip for the whole chip. */
  tip?: string;
  onRemove?: () => void;
  removeLabel?: string;
  tone?: "alert";
  small?: boolean;
}) {
  const classes = ["chip", small ? "chip-sm" : "", onRemove ? "" : "chip-static", tone ? `chip-${tone}` : ""]
    .filter(Boolean)
    .join(" ");
  const chip = (
    <span className={classes}>
      {icon ? <Icon name={icon} /> : null}
      <span>{label}</span>
      {onRemove && removeLabel ? (
        <Tip label={removeLabel}>
          <button type="button" className="chip-x" aria-label={removeLabel} onClick={onRemove}>
            <Icon name="trash" />
          </button>
        </Tip>
      ) : null}
    </span>
  );
  return tip ? <Tip label={tip}>{chip}</Tip> : chip;
}

/** Grows a text field with its content, up to `max` pixels. */
export function fitHeight(field: HTMLTextAreaElement, max: number): void {
  field.style.height = "auto";
  field.style.height = `${Math.min(field.scrollHeight, max)}px`;
}
