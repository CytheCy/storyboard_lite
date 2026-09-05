const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("frameforge", {
  openPath: options => ipcRenderer.invoke("dialog:open-path", options),
  runStoryboard: job => ipcRenderer.invoke("storyboard:run", job),
  onProgress: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("storyboard:progress", listener);
    return () => ipcRenderer.removeListener("storyboard:progress", listener);
  }
});
