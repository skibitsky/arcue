import type { ListenerErrorHandler, Settings } from "@arcue/protocol";
import { settingsSchema } from "@arcue/protocol";
import { joinPath } from "./paths";
import type { Platform } from "./platform";
import { SETTINGS_LOCK } from "./review-store";
import { Serial } from "./serial";

const storedSettingsSchema = settingsSchema.extend({
  coordinates: settingsSchema.shape.coordinates.catch("y-up"),
  authorName: settingsSchema.shape.authorName.catch(undefined),
});

export const defaultSettings: Settings = { coordinates: "y-up" };

/** Where a `settings.json` that is not a JSON object goes, so the next write starts afresh without losing it. */
export const BROKEN_SETTINGS_FILE = "settings.broken.json";

/**
 * App settings in `settings.json` in the app data folder, which every Arcue that uses the folder shares. A missing file
 * gives the defaults, and a value this build cannot use gives that setting's default.
 */
export class SettingsStore {
  readonly #platform: Platform;
  readonly #changed: ((settings: Settings) => void) | undefined;
  readonly #serial = new Serial();
  #settings: Settings = defaultSettings;
  #stopWatching: (() => void) | null = null;

  constructor(platform: Platform, changed?: (settings: Settings) => void) {
    this.#platform = platform;
    this.#changed = changed;
  }

  get path(): string {
    return joinPath(this.#platform.appDataDir, "settings.json");
  }

  get current(): Settings {
    return this.#settings;
  }

  /**
   * Reads the file: a missing one gives the defaults, a broken one keeps the settings in effect. Calls `changed` when
   * they differ. Never rejects.
   */
  async load(): Promise<Settings> {
    this.#set(await this.#read());
    return this.#settings;
  }

  /** `load`, in turn with updates. */
  reload(): Promise<Settings> {
    return this.#serial.run(() => this.load());
  }

  /** Reloads whenever settings.json changes on disk. */
  watch(onError: ListenerErrorHandler): void {
    this.#stopWatching?.();
    this.#stopWatching = this.#platform.watch(this.path, () => {
      this.reload().catch(onError);
    });
  }

  /**
   * Holds the settings lock, reads the file again, and writes it with `change` applied, every key it does not know
   * kept and the keys it knows made valid. A file that is not a JSON object is first renamed to settings.broken.json.
   * Calls `changed` when the settings differ. A read that fails for another reason rejects and writes nothing.
   */
  update(change: Partial<Settings>): Promise<Settings> {
    return this.#serial.run(async () => {
      const unlock = await this.#platform.lock(this.#platform.appDataDir, SETTINGS_LOCK);
      try {
        const merged: Record<string, unknown> = { ...(await this.#readRaw()), ...change };
        const known = storedSettingsSchema.parse(merged);
        for (const key of Object.keys(storedSettingsSchema.shape)) merged[key] = known[key as keyof Settings];
        const written = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
        await this.#platform.writeFileAtomic(this.path, `${JSON.stringify(written, null, 2)}\n`);
        this.#set(known);
        return this.#settings;
      } finally {
        await unlock();
      }
    });
  }

  /** Stops watching the file. */
  dispose(): void {
    this.#stopWatching?.();
    this.#stopWatching = null;
  }

  #set(settings: Settings): void {
    if (sortedJson(settings) === sortedJson(this.#settings)) return;
    this.#settings = settings;
    this.#changed?.(settings);
  }

  async #read(): Promise<Settings> {
    try {
      const stat = await this.#platform.stat(this.path);
      if (stat === null) return defaultSettings;
      if (stat.kind !== "file") return this.#settings;
      const parsed = storedSettingsSchema.safeParse(JSON.parse(await this.#platform.readText(this.path)));
      return parsed.success ? parsed.data : this.#settings;
    } catch {
      return this.#settings;
    }
  }

  /** The object the file holds as written, `{}` without a file. One that is not a JSON object moves aside first. */
  async #readRaw(): Promise<Record<string, unknown>> {
    if ((await this.#platform.stat(this.path)) === null) return {};
    const raw = parseObject(await this.#platform.readText(this.path));
    if (raw !== null) return raw;
    const broken = joinPath(this.#platform.appDataDir, BROKEN_SETTINGS_FILE);
    await this.#platform.remove(broken);
    await this.#platform.rename(this.path, broken);
    return {};
  }
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : null;
  } catch {
    return null;
  }
}

function sortedJson(settings: Settings): string {
  return JSON.stringify(Object.fromEntries(Object.entries(settings).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}
