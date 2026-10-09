import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { z } from "zod";
import type { DesktopBridge, WindowTabs } from "../shared/ipc";
import {
  adoptTabSchema,
  CORE_PORT_MESSAGE,
  channels,
  menuCommandSchema,
  openDialogResultSchema,
  openPathsSchema,
  textEditSchema,
  windowInitSchema,
} from "../shared/ipc";

/** Subscribes to a channel from the main process, dropping payloads that do not match the schema. */
function on<Schema extends z.ZodType>(
  channel: string,
  schema: Schema,
  listener: (payload: z.output<Schema>) => void,
): () => void {
  const handler = (_event: IpcRendererEvent, payload: unknown) => {
    const parsed = schema.safeParse(payload);
    if (parsed.success) listener(parsed.data);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.off(channel, handler);
  };
}

ipcRenderer.on(channels.corePort, (event) => {
  const [port] = event.ports;
  if (port) window.postMessage(CORE_PORT_MESSAGE, window.location.origin, [port]);
});

const bridge: DesktopBridge = {
  init: async () => windowInitSchema.parse(await ipcRenderer.invoke(channels.init)),
  connectCore: () => ipcRenderer.send(channels.connectCore),
  onCoreLost: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(channels.coreLost, handler);
    return () => {
      ipcRenderer.off(channels.coreLost, handler);
    };
  },
  windowReady: () => ipcRenderer.send(channels.windowReady),
  reportTabs: (tabs: WindowTabs) => ipcRenderer.send(channels.reportTabs, tabs),
  openDialog: async () => openDialogResultSchema.parse(await ipcRenderer.invoke(channels.openDialog)),
  pickFiles: async (kind) => openDialogResultSchema.parse(await ipcRenderer.invoke(channels.pickFiles, kind)),
  onOpenPaths: (listener) => on(channels.openPaths, openPathsSchema, ({ paths }) => listener(paths)),
  onAdoptTab: (listener) => on(channels.adoptTab, adoptTabSchema, ({ assetId }) => listener(assetId)),
  pathForFile: (file) => webUtils.getPathForFile(file),
  tabDragEnd: (assetId, dropped) => ipcRenderer.send(channels.tabDragEnd, { assetId, dropped }),
  onMenuCommand: (listener) => on(channels.menuCommand, menuCommandSchema, listener),
  editText: (edit) => ipcRenderer.send(channels.editText, textEditSchema.parse(edit)),
  onCloseRequest: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(channels.closeRequest, handler);
    return () => {
      ipcRenderer.off(channels.closeRequest, handler);
    };
  },
  closeReady: (tabs) => ipcRenderer.send(channels.closeReady, tabs),
};

contextBridge.exposeInMainWorld("arcueDesktop", bridge);
