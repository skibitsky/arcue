import type { MenuItemConstructorOptions } from "electron";
import { app, Menu } from "electron";
import { installCommand } from "./install-command";
import type { WindowManager } from "./windows";

/**
 * The native menus. Tab commands go to the focused window; the rest run in the main process. Undo and redo go to the
 * focused window too, which undoes text in a focused text field and the visible tab's review otherwise; the window
 * leaves those keys to these items, so one key press never undoes twice. The update item, when the app updates, goes
 * in the app menu on macOS and in Help elsewhere; install the menu again when it changes.
 */
export function installMenu(windows: WindowManager, update: MenuItemConstructorOptions | null): void {
  const mac = process.platform === "darwin";
  const developer = !app.isPackaged;
  const updateItem = update ? [{ id: "update", ...update }] : [];
  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            role: "appMenu" as const,
            submenu: [
              { role: "about" as const },
              ...updateItem,
              ...(developer
                ? []
                : [
                    { type: "separator" as const },
                    { id: "install-command", label: "Install arcue Command…", click: () => void installCommand() },
                  ]),
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
        { id: "undo", label: "Undo", accelerator: "CmdOrCtrl+Z", click: () => windows.editHistory("undo") },
        {
          id: "redo",
          label: "Redo",
          accelerator: "Shift+CmdOrCtrl+Z",
          click: () => windows.editHistory("redo"),
        },
        ...(mac
          ? []
          : [{ label: "Redo", accelerator: "Ctrl+Y", visible: false, click: () => windows.editHistory("redo") }]),
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
    ...(!mac && updateItem.length > 0 ? [{ label: "Help", submenu: updateItem }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
