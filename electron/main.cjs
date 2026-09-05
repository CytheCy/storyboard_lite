const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const { runStoryboardPipeline } = require("./storyboard.cjs");

const isDevelopment = process.argv.includes("--dev");

function createWindow() {
  const window = new BrowserWindow({
    title: "Frameforge — Storyboard Studio",
    width: 1180,
    height: 820,
    minWidth: 840,
    minHeight: 620,
    center: true,
    show: false,
    backgroundColor: "#f2f0eb",
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", event => event.preventDefault());

  if (isDevelopment) window.loadURL("http://127.0.0.1:1420");
  else window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

ipcMain.handle("dialog:open-path", async (_event, options = {}) => {
  const directory = Boolean(options.directory);
  const result = await dialog.showOpenDialog({
    title: directory ? "Choose a folder" : "Choose a file",
    properties: directory ? ["openDirectory", "createDirectory"] : ["openFile"],
    filters: options.proseOnly
      ? [{ name: "Prose", extensions: ["txt", "md"] }]
      : undefined
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
});

ipcMain.handle("storyboard:run", async (event, job) => {
  return runStoryboardPipeline(job, update => {
    if (!event.sender.isDestroyed()) event.sender.send("storyboard:progress", update);
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
