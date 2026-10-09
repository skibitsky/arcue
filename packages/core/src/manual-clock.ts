import type { Clock } from "./platform";

interface Timer {
  id: number;
  due: number;
  callback: () => void;
}

/** A clock that moves only when told to, for deterministic tests. */
export class ManualClock implements Clock {
  #now: number;
  #nextId = 1;
  #timers: Timer[] = [];

  constructor(startMs = Date.UTC(2026, 0, 1)) {
    this.#now = startMs;
  }

  now(): number {
    return this.#now;
  }

  setTimer(delayMs: number, callback: () => void): () => void {
    const timer = { id: this.#nextId++, due: this.#now + Math.max(0, delayMs), callback };
    this.#timers.push(timer);
    return () => {
      this.#timers = this.#timers.filter((other) => other !== timer);
    };
  }

  get pendingTimers(): number {
    return this.#timers.length;
  }

  /** Moves time forward, running each timer that falls due in order of due time. */
  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      const next = this.#timers.filter((timer) => timer.due <= target).sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!next) break;
      this.#timers = this.#timers.filter((timer) => timer !== next);
      this.#now = next.due;
      next.callback();
    }
    this.#now = target;
  }
}
