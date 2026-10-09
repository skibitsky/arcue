import { useCallback, useSyncExternalStore } from "react";

export interface Readable<State> {
  get(): State;
  subscribe(listener: () => void): () => void;
}

export class Store<State extends object> implements Readable<State> {
  #state: State;
  readonly #listeners = new Set<() => void>();

  constructor(initial: State) {
    this.#state = initial;
  }

  get = (): State => this.#state;

  set(next: State): void {
    if (Object.is(next, this.#state)) return;
    this.#state = next;
    for (const listener of [...this.#listeners]) listener();
  }

  /** Merges the fields that changed; does nothing when none did. */
  patch(partial: Partial<State>): void {
    const current = this.#state;
    const changed = (Object.keys(partial) as (keyof State)[]).some((key) => !Object.is(partial[key], current[key]));
    if (changed) this.set({ ...current, ...partial });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
}

/** Re-renders when the selected value changes. The selector must return stored values or primitives. */
export function useSelect<State, Selected>(store: Readable<State>, selector: (state: State) => Selected): Selected {
  const read = useCallback(() => selector(store.get()), [store, selector]);
  return useSyncExternalStore(store.subscribe, read, read);
}
