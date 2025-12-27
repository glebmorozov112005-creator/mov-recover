const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#0f172a'
    });

    // In development, load from Vite dev server. 
    // In production, load from the built dist folder.
    const isDev = !app.isPackaged;
    if (isDev) {
        win.loadURL('http://localhost:5173');
    } else {
        win.loadFile(path.join(__dirname, 'dist/index.html'));
    }

    // Check for updates
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();
    }
}

// Auto-updater events
autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: 'A new version of MOV Recover is available. It is being downloaded in the background.',
    });
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. It will be installed on restart.',
        buttons: ['Restart Now', 'Later']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

const isDev = !app.isPackaged;
let ffmpegPath;

if (isDev) {
    ffmpegPath = require('ffmpeg-static');
} else {
    if (process.platform === 'win32') {
        // Path for packaged Windows app
        ffmpegPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'bin/win/ffmpeg.exe');
    } else {
        // Path for packaged Mac app
        ffmpegPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules/ffmpeg-static/ffmpeg');
    }
}

// IPC Handler for file recovery
ipcMain.handle('repair-video', async (event, { brokenPath, referencePath }) => {
    const outputDir = path.join(app.getPath('userData'), 'recovered');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFilename = `fixed-${path.basename(brokenPath)}`;
    const outputPath = path.join(outputDir, outputFilename);

    // Use the bundled FFmpeg path
    const ffmpegCmd = `"${ffmpegPath}" -i "${referencePath}" -i "${brokenPath}" -map 1 -c copy -movflags faststart "${outputPath}"`;

    console.log('Running FFmpeg Command:', ffmpegCmd);
    console.log('FFmpeg Path exists:', fs.existsSync(ffmpegPath));

    return new Promise((resolve, reject) => {
        if (!fs.existsSync(ffmpegPath)) {
            reject(`FFmpeg binary not found at: ${ffmpegPath}`);
            return;
        }

        exec(ffmpegCmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`Repair error: ${error}`);
                console.error(`Stderr: ${stderr}`);
                reject(`FFmpeg Error: ${error.message}\n\nStderr: ${stderr}`);
            } else {
                resolve({ outputPath });
            }
        });
    });
});

ipcMain.handle('select-file', async (event) => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Videos', extensions: ['mov', 'mp4'] }]
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('save-file', async (event, sourcePath) => {
    const result = await dialog.showSaveDialog({
        defaultPath: path.basename(sourcePath),
        filters: [{ name: 'Videos', extensions: ['mov', 'mp4'] }]
    });

    if (result.canceled) return null;

    fs.copyFileSync(sourcePath, result.filePath);
    return result.filePath;
});
