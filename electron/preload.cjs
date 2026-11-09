const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("frameforge", {
  openPath: options => ipcRenderer.invoke("dialog:open-path", options),
  loadProject: folder => ipcRenderer.invoke("project:load", folder),
  saveProject: (folder, state) => ipcRenderer.invoke("project:save", folder, state),
  runStoryboard: job => ipcRenderer.invoke("storyboard:run", job),
  onProgress: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("storyboard:progress", listener);
    return () => ipcRenderer.removeListener("storyboard:progress", listener);
  }
});
