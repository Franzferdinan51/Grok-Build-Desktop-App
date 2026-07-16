/**
 * main/menu.ts — Application menu builder
 *
 * Standard macOS/Windows/Linux menu bar with app, file, edit, view, help menus.
 */

import { Menu, MenuItemConstructorOptions, BrowserWindow, app, shell } from "electron"

export function createMenu(mainWindow: BrowserWindow): Menu {
  const isMac = process.platform === "darwin"

  const template: MenuItemConstructorOptions[] = [
    // macOS: app menu (Services, Hide, Quit)
    ...(isMac
      ? [
          {
            label: app.name,
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
    // File menu
    {
      label: "File",
      submenu: [
        {
          label: "New Task",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow.webContents.send("menu:command", "new-task"),
        },
        { type: "separator" },
        {
          label: "Open Project...",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow.webContents.send("menu:command", "open-project"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    // Edit menu
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" as const },
              { role: "delete" as const },
              { role: "selectAll" as const },
            ]
          : [{ role: "delete" as const }, { type: "separator" as const }, { role: "selectAll" as const }]),
      ],
    },
    // View menu
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // Grok Build is the sole coding runtime. LM Studio is configured as a local
    // endpoint, never presented as a second agent backend.
    {
      label: "Coding",
      submenu: [
        {
          label: "Grok Build Status",
          click: () => mainWindow.webContents.send("menu:command", "grok-status"),
        },
        { type: "separator" },
        {
          label: "LM Studio Endpoint Settings...",
          click: () => mainWindow.webContents.send("menu:command", "lmstudio-settings"),
        },
      ],
    },
    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
    // Help menu
    {
      label: "Help",
      submenu: [
        {
          label: "Grok Build CLI Docs",
          click: () => shell.openExternal("https://docs.x.ai/build/overview"),
        },
        {
          label: "GitHub Repository",
          click: () => shell.openExternal("https://github.com/Franzferdinan51/Grok-Build-Desktop-App"),
        },
        { type: "separator" },
        {
          label: "About Grok Build Desktop",
          click: () => mainWindow.webContents.send("menu:command", "about"),
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
