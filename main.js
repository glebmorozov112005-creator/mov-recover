const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const diskinfo = require('node-disk-info');
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
    try {
        const disks = diskinfo.getDiskInfoSync();
        return disks.map(disk => ({
            device: disk.mounted,
            description: `${disk.filesystem} (${disk.mounted})`,
            model: disk.filesystem,
            size: disk.blocks * 512, // Approximation if blocks not available
            isSystem: disk.mounted === '/' || disk.mounted === 'C:'
        }));
    } catch (e) {
        console.error('Disk info error:', e);
        return [];
    }
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
        }
    });
});

ipcMain.handle('deep-scan', async (event, { drivePath, outputDir }) => {
    return new Promise(async (resolve, reject) => {
        const bufferSize = 4 * 1024 * 1024; // 4MB buffer
        const buffer = Buffer.alloc(bufferSize);
        // Signature: ....ftyp (hex: ?? ?? ?? ?? 66 74 79 70)
        // We look for 'ftyp' at offset 4.

        let fdIn;
        let totalSize = 0;
        let bytesReadTotal = 0;
        let filesFound = 0;

        try {
            const stats = fs.statSync(drivePath);
            totalSize = stats.size;
            fdIn = fs.openSync(drivePath, 'r');
        } catch (err) {
            reject(`Failed to open drive: ${err.message}. Run as Administrator.`);
            return;
        }

        const scanLoop = () => {
            fs.read(fdIn, buffer, 0, bufferSize, null, (err, bytesRead) => {
                if (err || bytesRead === 0) {
                    fs.closeSync(fdIn);
                    resolve({ success: true, filesFound });
                    return;
                }

                // Simple signature search in the current buffer
                // Note: accurate scanning requires handling signatures crossing buffer boundaries, 
                // but for a basic version, checking the buffer is sufficient.
                for (let i = 0; i < bytesRead - 8; i++) {
                    // Check for 'ftyp' ASCII bytes: 0x66, 0x74, 0x79, 0x70
                    // MOV atom: 4 bytes size, 4 bytes type ('ftyp')
                    if (buffer[i + 4] === 0x66 && buffer[i + 5] === 0x74 && buffer[i + 6] === 0x79 && buffer[i + 7] === 0x70) {
                        // Found potential MOV header
                        filesFound++;

                        // Carving Strategy:
                        // Since we can't easily determine the file size without complex parsing (and atoms might be scattered),
                        // we will save a fixed chunk (e.g., 512MB) or until the drive ends.
                        // For this MVP, we just notify the frontend of a "hit".
                        // In a full implementation, we would pause scanning and write to a file.

                        // To make this functional for the user right now without freezing:
                        // We will attempt to save a 256MB chunk from this position.
                        try {
                            const recoveryPath = path.join(outputDir, `Recovered_${Date.now()}_${filesFound}.mov`);
                            const saveBuffer = Buffer.alloc(256 * 1024 * 1024); // 256MB chunk
                            // We need to read from the current position (bytesReadTotal + i)
                            // This requires a synchronous read from the *main* file descriptor at a specific position.
                            // However, fs.read updates the position pointer if null is passed.
                            // Since we are continuously reading, we should use a separate FD or position calculation.
                            // For safety and speed in this loop, we mark it.

                            // REALISTIC MVP: Save 256MB chunk
                            try {
                                const chunkLen = 256 * 1024 * 1024;
                                const chunkBuffer = Buffer.alloc(chunkLen);
                                const bytesRead = fs.readSync(fdIn, chunkBuffer, 0, chunkLen, bytesReadTotal + i);

                                if (bytesRead > 0) {
                                    fs.writeFileSync(recoveryPath, chunkBuffer.slice(0, bytesRead));
                                }
                            } catch (writeErr) {
                                console.error('Failed to write recovered file:', writeErr);
                            }
                        } catch (saveErr) {
                            console.error('Carve error', saveErr);
                        }
                    }
                }

                bytesReadTotal += bytesRead;
                const progress = totalSize ? (bytesReadTotal / totalSize * 100).toFixed(4) : 0;

                // Throttle updates to every ~10MB or so
                if (bytesReadTotal % (10 * 1024 * 1024) < bufferSize) {
                    event.sender.send('deep-scan-progress', { progress, bytesReadTotal, totalSize, filesFound });
                }

                scanLoop();
            });
        };

        scanLoop();
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
