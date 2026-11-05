import type { WindowTabs } from "@arcue/protocol";
import { windowTabsSchema } from "@arcue/protocol";
import { z } from "zod";

export type { SavedTab, WindowTabs } from "@arcue/protocol";
export { savedTabSchema, windowTabsSchema } from "@arcue/protocol";

/** IPC channel names between the main process and the preload. Every payload is checked against its schema. */
export const channels = {
  init: "arcue:init",
  connectCore: "arcue:connect-core",
  corePort: "arcue:core-port",
  coreLost: "arcue:core-lost",
  windowReady: "arcue:window-ready",
  reportTabs: "arcue:report-tabs",
  openDialog: "arcue:open-dialog",
  pickFiles: "arcue:pick-files",
  openPaths: "arcue:open-paths",
  adoptTab: "arcue:adopt-tab",
  tabDragEnd: "arcue:tab-drag-end",
  menuCommand: "arcue:menu-command",
  editText: "arcue:edit-text",
  closeRequest: "arcue:close-request",
  closeReady: "arcue:close-ready",
  updateState: "arcue:update-state",
  updateAction: "arcue:update-action",
  notice: "arcue:notice",
} as const;

/** The message the preload posts to the page with the core's port, since a port cannot cross the context bridge. */
export const CORE_PORT_MESSAGE = "arcue:core-port";

const pathSchema = z.string().min(1).max(4096);
const assetIdSchema = z.string().min(1).max(200);

export const windowInitSchema = z.object({
  platform: z.string(),
  /** Tabs to open when the window starts: a restored session, or the tabs the window had before it reloaded. */
  restore: windowTabsSchema.nullable(),
  /** An asset to take from another window, for a tab torn off into this new window. */
  adopt: assetIdSchema.nullable(),
});

export const openPathsSchema = z.object({ paths: z.array(pathSchema).max(100) });

export const adoptTabSchema = z.object({ assetId: assetIdSchema });

export const tabDragEndSchema = z.object({ assetId: assetIdSchema, dropped: z.boolean() });

export const menuCommandSchema = z.enum(["new-tab", "close-tab", "undo", "redo"]);

/** The native text edits a window asks for when Edit > Undo or Redo reaches it while a text field has focus. */
export const textEditSchema = z.enum(["undo", "redo"]);

export const openDialogResultSchema = z.array(pathSchema);

/** What the open dialog offers when a file is added to a view: models, or images for a texture slot. */
export const fileKindSchema = z.enum(["model", "image"]);

const versionSchema = z.string().min(1).max(64);
const pageSchema = z.url({ protocol: /^https?$/ });

/**
 * What the window shows of the app's updates: nothing, an update to restart into, one to download from its release
 * page because this app cannot install it, or one that is installing as the app restarts.
 */
export const updateStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("ready"), version: versionSchema, page: pageSchema }),
  z.object({ status: z.literal("manual"), version: versionSchema, page: pageSchema, reason: z.string().max(500) }),
  z.object({ status: z.literal("installing"), version: versionSchema }),
]);

/** What the window asks of an update: restart into it, or download it, which says why the app cannot install it. */
export const updateActionSchema = z.enum(["restart", "download"]);

/** A message the main process has for the person, such as how the last update went. */
export const noticeSchema = z.object({ message: z.string().min(1).max(500), kind: z.enum(["info", "alert"]) });

export type WindowInit = z.output<typeof windowInitSchema>;
export type UpdateState = z.output<typeof updateStateSchema>;
export type UpdateAction = z.output<typeof updateActionSchema>;
export type Notice = z.output<typeof noticeSchema>;
export type MenuCommand = z.output<typeof menuCommandSchema>;
export type TextEdit = z.output<typeof textEditSchema>;
export type FileKind = z.output<typeof fileKindSchema>;

/** What the preload exposes to the page as `window.arcueDesktop`. */
export interface DesktopBridge {
  init(): Promise<WindowInit>;
  /** Asks for a port to the core. It arrives as a window message whose data is `CORE_PORT_MESSAGE`. */
  connectCore(): void;
  /** Called when the main process sees the core stop; ask for a new port with `connectCore`. */
  onCoreLost(listener: () => void): () => void;
  /** Tells the main process that this window is connected and can take forwarded opens. */
  windowReady(): void;
  reportTabs(tabs: WindowTabs): void;
  openDialog(): Promise<string[]>;
  /** Shows the open dialog for files to add to a view: several models, or one image. */
  pickFiles(kind: FileKind): Promise<string[]>;
  onOpenPaths(listener: (paths: string[]) => void): () => void;
  /** Asks this window to take an asset's tab from the window that shows it. */
  onAdoptTab(listener: (assetId: string) => void): () => void;
  /** The file system path of a dropped file, or "" when it has none. */
  pathForFile(file: File): string;
  /** A tab drag ended; `dropped` is false when no tab strip took it, so the main process may tear it off. */
  tabDragEnd(assetId: string, dropped: boolean): void;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  /** Runs the native undo or redo of the focused text field. */
  editText(edit: TextEdit): void;
  /** The main process asks the window to close its assets before the window closes; answer with `closeReady`. */
  onCloseRequest(listener: () => void): () => void;
  closeReady(tabs: WindowTabs): void;
  /** Calls the listener with the app's update state now and whenever it changes. */
  onUpdateState(listener: (state: UpdateState) => void): () => void;
  updateAction(action: UpdateAction): void;
  onNotice(listener: (notice: Notice) => void): () => void;
}
