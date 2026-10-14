interface Copy {
  path: string;
  users: number;
}

/**
 * The copies dropped and picked files made beside assets. A file placed where another file's copy already holds the
 * same bytes shares that copy, so the copy is removed only once every file that uses it is released.
 */
export class PlacedCopies<Item extends object> {
  readonly #ofItem = new WeakMap<Item, Copy>();
  readonly #atPath = new Map<string, Copy>();

  /** Records where an item went: a copy it made, or a path that already held its bytes. */
  place(item: Item, path: string, created: boolean): void {
    if (this.#ofItem.has(item)) return;
    const copy = created ? { path, users: 0 } : this.#atPath.get(path);
    if (!copy) return;
    copy.users += 1;
    this.#ofItem.set(item, copy);
    this.#atPath.set(path, copy);
  }

  /** Forgets the items and returns the paths of their copies that no other placed item uses. */
  release(items: readonly Item[]): string[] {
    return items.flatMap((item) => {
      const copy = this.#ofItem.get(item);
      if (!copy) return [];
      this.#ofItem.delete(item);
      copy.users -= 1;
      if (copy.users > 0 || this.#atPath.get(copy.path) !== copy) return [];
      this.#atPath.delete(copy.path);
      return [copy.path];
    });
  }
}
