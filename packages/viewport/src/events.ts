/** A typed event emitter. A listener that throws does not stop the others; its error is rethrown on a microtask. */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<Name extends keyof Events>(name: Name, listener: (payload: Events[Name]) => void): () => void {
    const set = this.listeners.get(name) ?? new Set();
    set.add(listener);
    this.listeners.set(name, set);
    return () => {
      set.delete(listener);
    };
  }

  has(name: keyof Events): boolean {
    return (this.listeners.get(name)?.size ?? 0) > 0;
  }

  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set] as ((payload: Events[Name]) => void)[]) {
      try {
        listener(payload);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
