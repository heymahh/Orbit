const { contextBridge, ipcRenderer } = require('electron');

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('orbitDesktop', {
    updateState: () => ipcRenderer.invoke('orbit:update-state'),
    checkUpdate: () => ipcRenderer.invoke('orbit:check-update'),
    installUpdate: () => ipcRenderer.invoke('orbit:install-update'),
    trayPreference: () => ipcRenderer.invoke('orbit:tray-preference'),
    setTrayPreference: enabled => ipcRenderer.invoke('orbit:set-tray-preference',enabled),
    onUpdate: callback => { ipcRenderer.on('orbit:update-state', (_event, state) => callback(state)); }
  });
}
