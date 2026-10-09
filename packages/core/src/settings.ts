import type { Settings } from "@arcue/protocol";
import { settingsSchema } from "@arcue/protocol";
import { joinPath } from "./paths";
import type { Platform } from "./platform";

const storedSettingsSchema = settingsSchema.extend({
  coordinates: settingsSchema.shape.coordinates.catch("y-up"),
  authorName: settingsSchema.shape.authorName.catch(undefined),
});

export const defaultSettings: Settings = { coordinates: "y-up" };

/** App settings in `settings.json` in the app data folder. A missing or unreadable file gives the defaults. */
export class SettingsStore {
  readonly #platform: Platform;
  #settings: Settings = defaultSettings;

  constructor(platform: Platform) {
    this.#platform = platform;
  }

  get path(): string {
    return joinPath(this.#platform.appDataDir, "settings.json");
  }

  get current(): Settings {
    return this.#settings;
  }

  async load(): Promise<Settings> {
    try {
      if ((await this.#platform.stat(this.path))?.kind === "file") {
        const parsed = storedSettingsSchema.safeParse(JSON.parse(await this.#platform.readText(this.path)));
        if (parsed.success) this.#settings = parsed.data;
      }
    } catch {
      this.#settings = defaultSettings;
    }
    return this.#settings;
  }

  /** Saves the settings with the change applied. The registry has already validated the change. */
  async update(change: Partial<Settings>): Promise<Settings> {
    const next: Settings = { ...this.#settings, ...change };
    await this.#platform.writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`);
    this.#settings = next;
    return next;
  }
}
