import type { MenuItemConstructorOptions } from "electron";
import { app, Menu } from "electron";
import type { WindowManager } from "./windows";

/** The native menus. Tab commands go to the focused window; the rest run in the main process. */
export function installMenu(windows: WindowManager): void {
  const mac = process.platform === "darwin";
  const developer = !app.isPackaged;
  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            role: "appMenu" as const,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => void windows.showOpenDialog() },
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => windows.sendMenuCommand("new-tab") },
        { label: "New Window", accelerator: "CmdOrCtrl+Shift+N", click: () => windows.create() },
        { type: "separator" },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => windows.sendMenuCommand("close-tab") },
        { label: "Close Window", accelerator: "CmdOrCtrl+Shift+W", role: "close" },
        ...(mac ? [] : [{ type: "separator" as const }, { role: "quit" as const }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        ...(developer
          ? [{ role: "reload" as const }, { role: "toggleDevTools" as const }, { type: "separator" as const }]
          : []),
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
