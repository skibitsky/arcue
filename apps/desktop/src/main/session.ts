import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import { windowTabsSchema } from "../shared/ipc";

export const boundsSchema = z.object({
  x: z.int(),
  y: z.int(),
  width: z.int().min(200).max(100_000),
  height: z.int().min(150).max(100_000),
});

export const savedWindowSchema = z.object({
  bounds: boundsSchema,
  maximized: z.boolean(),
  tabs: windowTabsSchema,
});

/** The windows and tabs to restore on the next launch, kept in `session.json` in the user data folder. */
export const sessionSchema = z.object({
  version: z.literal(1),
  windows: z.array(savedWindowSchema).max(50),
});

export type Bounds = z.output<typeof boundsSchema>;
export type SavedWindow = z.output<typeof savedWindowSchema>;
export type Session = z.output<typeof sessionSchema>;

export const SESSION_FILE = "session.json";

export const emptySession = (): Session => ({ version: 1, windows: [] });

/** Reads the saved session; a missing or invalid file is an empty session. */
export async function loadSession(path: string): Promise<Session> {
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : emptySession();
  } catch {
    return emptySession();
  }
}

/** Writes through a temporary file and a rename, so a crash never leaves half a session. */
export async function saveSession(path: string, session: Session): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Keeps saved bounds when at least a corner strip of the window lands on a display, so the title bar can be grabbed.
 * Otherwise only the size survives, clamped to the first display, and the system places the window.
 */
export function fitBounds(
  bounds: Bounds,
  workAreas: readonly Bounds[],
): Partial<Bounds> & Pick<Bounds, "width" | "height"> {
  const grab = 48;
  const visible = workAreas.some(
    (area) =>
      bounds.x + bounds.width - grab >= area.x &&
      bounds.x + grab <= area.x + area.width &&
      bounds.y >= area.y &&
      bounds.y + grab <= area.y + area.height,
  );
  if (visible) return bounds;
  const first = workAreas[0];
  return {
    width: first ? Math.min(bounds.width, first.width) : bounds.width,
    height: first ? Math.min(bounds.height, first.height) : bounds.height,
  };
}
