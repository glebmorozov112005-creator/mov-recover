const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    repairVideo: (data) => ipcRenderer.invoke('repair-video', data),
    selectFile: () => ipcRenderer.invoke('select-file'),
    saveFile: (sourcePath) => ipcRenderer.invoke('save-file', sourcePath),
});
