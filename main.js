const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const drivelist = require('drivelist');
const sudo = require('sudo-prompt');

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
    app.quit();
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

ipcMain.handle('list-drives', async () => {
    const drives = await drivelist.list();
    return drives;
});

ipcMain.handle('create-disk-image', async (event, { drivePath, outputPath }) => {
    return new Promise((resolve, reject) => {
        // Raw disk access often requires elevation/sudo
        // On Windows, we need to use \\.\PhysicalDriveX
        // On Mac, we need to use /dev/rdiskX

        const isWindows = process.platform === 'win32';
        const bufferSize = 4 * 1024 * 1024; // 4MB buffer
        const buffer = Buffer.alloc(bufferSize);

        let fdIn, fdOut;
        let totalSize = 0;
        let bytesReadTotal = 0;

        try {
            // Get drive size first
            const stats = fs.statSync(drivePath);
            totalSize = stats.size;
        } catch (e) {
            // stat might fail for raw devices, we'll try to read until EOF
        }

        const readWriteLoop = () => {
            fs.read(fdIn, buffer, 0, bufferSize, null, (err, bytesRead) => {
                if (err) {
                    fs.closeSync(fdIn);
                    fs.closeSync(fdOut);
                    reject(`Read Error: ${err.message}`);
                    return;
                }

                if (bytesRead === 0) {
                    fs.closeSync(fdIn);
                    fs.closeSync(fdOut);
                    resolve({ success: true, outputPath });
                    return;
                }

                fs.write(fdOut, buffer, 0, bytesRead, null, (err) => {
                    if (err) {
                        fs.closeSync(fdIn);
                        fs.closeSync(fdOut);
                        reject(`Write Error: ${err.message}`);
                        return;
                    }

                    bytesReadTotal += bytesRead;
                    const progress = totalSize ? (bytesReadTotal / totalSize * 100).toFixed(2) : bytesReadTotal;
                    event.sender.send('disk-image-progress', { progress, bytesReadTotal, totalSize });

                    readWriteLoop();
                });
            });
        };

        try {
            fdIn = fs.openSync(drivePath, 'r');
            fdOut = fs.openSync(outputPath, 'w');
            readWriteLoop();
        } catch (err) {
            reject(`Failed to open drive: ${err.message}. You may need to run as Administrator.`);
        }
    });
});

ipcMain.handle('select-save-path', async (event, options) => {
    const result = await dialog.showSaveDialog(options);
    return result.filePath;
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
