import { Tooltip } from "radix-ui";
import type { ComponentProps, ReactElement, ReactNode } from "react";
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

interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  icon: IconName;
  label: string;
  shortcut?: string | undefined;
  tipSide?: TipSide;
  pressed?: boolean;
  small?: boolean;
}

export function IconButton({ icon, label, shortcut, tipSide, pressed, small, className, ...rest }: IconButtonProps) {
  const classes = ["ibtn", small ? "ibtn-sm" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <Tip label={label} shortcut={shortcut} side={tipSide ?? "top"}>
      <button type="button" className={classes} aria-label={label} aria-pressed={pressed} {...rest}>
        <Icon name={icon} />
      </button>
    </Tip>
  );
}

export function Chip({
  icon,
  label,
  onRemove,
  removeLabel,
  tone,
  small,
}: {
  icon?: IconName;
  label: string;
  onRemove?: () => void;
  removeLabel?: string;
  tone?: "alert";
  small?: boolean;
}) {
  const classes = ["chip", small ? "chip-sm" : "", onRemove ? "" : "chip-static", tone ? `chip-${tone}` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes}>
      {icon ? <Icon name={icon} /> : null}
      <span>{label}</span>
      {onRemove && removeLabel ? (
        <Tip label={removeLabel}>
          <button type="button" className="chip-x" aria-label={removeLabel} onClick={onRemove}>
            <Icon name="x" />
          </button>
        </Tip>
      ) : null}
    </span>
  );
}

/** Grows a text field with its content, up to `max` pixels. */
export function fitHeight(field: HTMLTextAreaElement, max: number): void {
  field.style.height = "auto";
  field.style.height = `${Math.min(field.scrollHeight, max)}px`;
}
