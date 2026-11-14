type Child = Node | string | null | false | undefined;

interface Props {
  class?: string;
  title?: string;
  src?: string;
  alt?: string;
  /** Names the element across renders, so that focus stays on it. */
  key?: string;
  /** Marks a button unavailable with `aria-disabled`, so that it keeps focus, and leaves out its `onclick`. */
  disabled?: boolean;
  onclick?: () => void;
}

/** An element with its props and children; falsy children are left out. */
export function h<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  props: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (props?.class) element.className = props.class;
  if (props?.title) element.title = props.title;
  if (props?.src !== undefined) element.setAttribute("src", props.src);
  if (props?.alt !== undefined) element.setAttribute("alt", props.alt);
  if (props?.key) element.dataset.key = props.key;
  if (props?.disabled) element.setAttribute("aria-disabled", "true");
  else if (props?.onclick) element.addEventListener("click", props.onclick);
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue;
    element.append(child);
  }
  return element;
}

export function count(value: number, noun: string, plural = `${noun}s`): string {
  return `${value.toLocaleString("en-US")} ${value === 1 ? noun : plural}`;
}
