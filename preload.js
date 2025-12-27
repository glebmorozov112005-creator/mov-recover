const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    repairVideo: (data) => ipcRenderer.invoke('repair-video', data),
    selectFile: () => ipcRenderer.invoke('select-file'),
    saveFile: (sourcePath) => ipcRenderer.invoke('save-file', sourcePath),
    listDrives: () => ipcRenderer.invoke('list-drives'),
    createDiskImage: (data) => ipcRenderer.invoke('create-disk-image', data),
    selectSavePath: (options) => ipcRenderer.invoke('select-save-path', options),
    onDiskImageProgress: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('disk-image-progress', listener);
        return () => ipcRenderer.removeListener('disk-image-progress', listener);
    },
});
