import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import { startServer } from "./server.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === "darwin";

console.log("Starting Happy App Router Electron process...");
console.log("Base directory:", __dirname);

let mainWindow = null;
let tray = null;
let serverPort = null;
let httpServer = null;
app.isQuitting = false;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 940,
    minHeight: 640,
    title: "Happy App Router",
    icon: join(__dirname, "assets", "logo_rendered.png"),
    titleBarStyle: "hiddenInset",
    vibrancy: "sidebar",
    visualEffectState: "active",
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`, { extraHeaders: "pragma: no-cache\ncache-control: no-cache" });
  mainWindow.webContents.session.clearCache();
  // mainWindow.webContents.openDevTools();

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    import("electron").then(({ shell }) => shell.openExternal(url));
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = join(__dirname, "assets", "trayTemplate.png");
  let icon = nativeImage.createFromPath(iconPath);
  
  if (isMac) {
    icon.setTemplateImage(true);
  }

  if (icon.isEmpty()) {
    console.error("Failed to load Tray icon from:", iconPath);
  }

  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: "Happy App Router", enabled: false },
    { type: "separator" },
    { label: "显示主界面", click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow(serverPort);
        }
    }},
    { type: "separator" },
    { label: "退出应用", click: () => {
        app.isQuitting = true;
        app.quit();
    }}
  ]);

  tray.setToolTip("Happy App Router");
  tray.setContextMenu(contextMenu);
  
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow(serverPort);
    }
  });
}

function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "quit" },
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
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  createMenu();
  createTray();

  if (isMac) {
    const iconPath = join(__dirname, "assets", "logo_rendered.png");
    console.log("Setting Dock icon from:", iconPath);
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      console.error("Failed to load Dock icon: Image is empty!");
    } else {
      app.dock.setIcon(icon);
      console.log("Dock icon set successfully.");
    }
  }

  try {
    const result = await startServer(3456);
    serverPort = result.port;
    httpServer = result.server;
    console.log(`Server on port ${serverPort}`);
    createWindow(serverPort);
  } catch (err) {
    console.error(`Failed to start server: ${err.message}`);
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(serverPort);
    }
  });
});

app.on("window-all-closed", () => {
  // Keep app running in tray on macOS
  if (!isMac) {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
});
