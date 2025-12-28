import React, { useState, useEffect } from 'react';
import { Upload, FileVideo, CheckCircle, AlertCircle, Loader2, Download, HardDrive, Cpu, Video, Save, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const App = () => {
  const [brokenPath, setBrokenPath] = useState('');
  const [referencePath, setReferencePath] = useState('');
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [fixedFilePath, setFixedFilePath] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('repair'); // repair, disk

  // Disk Recovery States
  const [drives, setDrives] = useState([]);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [imagingProgress, setImagingProgress] = useState(0);
  const [scanStats, setScanStats] = useState({ found: 0, progress: 0 });
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (activeTab === 'disk') {
      loadDrives();
    }

    // Listen for disk imaging progress
    const removeImageListener = window.electronAPI.onDiskImageProgress((data) => {
      setImagingProgress(data.progress);
    });

    // Listen for deep scan progress
    const removeScanListener = window.electronAPI.onDeepScanProgress((data) => {
      setScanStats({ found: data.filesFound, progress: data.progress });
      setImagingProgress(data.progress); // Reuse the progress bar
    });

    return () => {
      removeImageListener && removeImageListener();
      removeScanListener && removeScanListener();
    };
  }, [activeTab]);

  const loadDrives = async () => {
    try {
      const driveList = await window.electronAPI.listDrives();
      setDrives(driveList.filter(d => !d.isSystem)); // Only show non-system drives by default
    } catch (err) {
      console.error('Failed to load drives:', err);
    }
  };

  const handleCreateDiskImage = async () => {
    if (!selectedDrive) return;

    const outputPath = await window.electronAPI.selectSavePath({
      title: 'Save Disk Image',
      defaultPath: `disk_image_${Date.now()}.img`,
      filters: [{ name: 'Disk Images', extensions: ['img'] }]
    });

    if (!outputPath) return;

    setStatus('processing');
    setImagingProgress(0);

    try {
      await window.electronAPI.createDiskImage({
        drivePath: selectedDrive.device,
        outputPath
      });
      setFixedFilePath(outputPath);
      setStatus('success');
    } catch (err) {
      setErrorMessage(err || 'Failed to create disk image.');
      setStatus('error');
    }
  };

  const handleDeepScan = async () => {
    if (!selectedDrive) return;

    // Select output directory
    const outputDir = await window.electronAPI.selectSavePath({
      title: 'Select Recovery Folder',
      properties: ['openDirectory', 'createDirectory']
    });

    setStatus('processing');
    setIsScanning(true);
    setScanStats({ found: 0, progress: 0 });

    try {
      await window.electronAPI.deepScan({
        drivePath: selectedDrive.device,
        outputDir: outputDir || 'C:\\RecoveredData' // Use selected path or fallback
      });
      setStatus('success');
    } catch (err) {
      setErrorMessage(err || 'Scan failed');
      setStatus('error');
    }
    setIsScanning(false);
  };

  const handleSelectFile = async (type) => {
    try {
      const path = await window.electronAPI.selectFile();
      if (path) {
        if (type === 'broken') setBrokenPath(path);
        else setReferencePath(path);
      }
    } catch (err) {
      console.error('File selection error:', err);
    }
  };

  const handleRepair = async () => {
    if (!brokenPath || !referencePath) return;

    setStatus('processing');
    setErrorMessage('');

    try {
      const result = await window.electronAPI.repairVideo({ brokenPath, referencePath });
      setFixedFilePath(result.outputPath);
      setStatus('success');
    } catch (err) {
      console.error('Repair error:', err);
      setStatus('error');
      setErrorMessage(err || 'An error occurred during recovery.');
    }
  };

  const handleDownload = async () => {
    if (!fixedFilePath) return;
    try {
      await window.electronAPI.saveFile(fixedFilePath);
    } catch (err) {
      console.error('Save error:', err);
    }
  };

  return (
    <div className="container relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="glass-card"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-50" />

        <h1 className="title">MOV Recover</h1>
        <p className="subtitle">Professional-grade local video repair & forensic disk imaging.</p>

        {/* Custom Tabs */}
        <div className="tabs-container">
          <button
            onClick={() => { setStatus('idle'); setActiveTab('repair'); }}
            className={`tab-btn ${activeTab === 'repair' ? 'active' : ''}`}
          >
            Video Repair
          </button>
          <button
            onClick={() => { setStatus('idle'); setActiveTab('disk'); }}
            className={`tab-btn ${activeTab === 'disk' ? 'active' : ''}`}
          >
            Disk Imaging
          </button>

          <motion.div
            className="tab-indicator"
            layoutId="activeTab"
            initial={false}
            animate={{
              left: activeTab === 'repair' ? '6px' : 'calc(50% + 3px)',
              width: 'calc(50% - 9px)'
            }}
          />
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'repair' ? (
            <motion.div
              key="repair-tab"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="upload-grid"
            >
              <div
                className={`upload-box ${brokenPath ? 'active' : ''}`}
                onClick={() => handleSelectFile('broken')}
              >
                <div className="icon-wrapper">
                  <FileVideo className="w-8 h-8 text-blue-400" />
                </div>
                <div>
                  <h3>Corrupted File</h3>
                  <p className="file-info font-mono text-xs opacity-70">
                    {brokenPath ? brokenPath.split(/[\\/]/).pop() : 'Click to browse .mov/.mp4'}
                  </p>
                </div>
              </div>

              <div
                className={`upload-box ${referencePath ? 'active' : ''}`}
                onClick={() => handleSelectFile('reference')}
              >
                <div className="icon-wrapper">
                  <CheckCircle className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <h3>Reference File</h3>
                  <p className="file-info font-mono text-xs opacity-70">
                    {referencePath ? referencePath.split(/[\\/]/).pop() : 'Select healthy file from same cam'}
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="disk-tab"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="space-y-4 mb-8"
            >
              <div className="drive-list custom-scrollbar">
                {drives.length === 0 ? (
                  <div className="text-center py-12">
                    <Loader2 className="animate-spin w-8 h-8 mx-auto mb-3 text-dim" />
                    <p className="text-dim">Scanning for drives...</p>
                  </div>
                ) : (
                  drives.map((drive, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedDrive(drive)}
                      className={`drive-item ${selectedDrive?.device === drive.device ? 'selected' : ''}`}
                    >
                      <HardDrive size={24} className={`mr-4 ${selectedDrive?.device === drive.device ? 'text-blue-400' : 'text-dim'}`} />
                      <div className="flex-1">
                        <p className="font-medium text-white">{drive.description || drive.model}</p>
                        <p className="text-xs text-dim font-mono mt-1">{drive.device} • <span className="text-blue-300">{(drive.size / 1024 / 1024 / 1024).toFixed(2)} GB</span></p>
                      </div>
                      {selectedDrive?.device === drive.device && <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={loadDrives}
                className="text-xs text-dim hover:text-white transition-colors block mx-auto flex items-center gap-1"
              >
                <Loader2 size={12} /> Refresh List
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 mt-8"
            >
              {activeTab === 'repair' ? (
                <button
                  onClick={handleRepair}
                  disabled={!brokenPath || !referencePath}
                  className="btn-primary"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Cpu size={20} /> Start Repair Analysis
                  </span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCreateDiskImage}
                    disabled={!selectedDrive}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2"
                  >
                    <Save size={18} /> Create Image
                  </button>
                  <button
                    onClick={handleDeepScan}
                    disabled={!selectedDrive}
                    className="btn-primary flex-1"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <HardDrive size={18} /> Deep Scan
                    </span>
                  </button>
                </>
              )}
            </motion.div>
          )}

          {status === 'processing' && (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="progress-container"
            >
              <div className="flex justify-between text-xs text-dim mb-2 uppercase tracking-wider font-semibold">
                <span>Processing</span>
                <span>{activeTab === 'disk' && isScanning ? scanStats.filesFound : ''} {isScanning ? 'Files Found' : `${Math.round(imagingProgress)}%`}</span>
              </div>
              <div className="progress-track">
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${activeTab === 'repair' ? '100%' : imagingProgress + '%'}` }}
                  transition={activeTab === 'repair' ? { duration: 15, ease: "linear" } : { duration: 0.5 }}
                />
              </div>
              <p className="status text-sm text-dim animate-pulse">
                {activeTab === 'repair'
                  ? 'Analyzing atoms & reconstructing indices...'
                  : (isScanning ? `Carving sectors for MOV signatures...` : `Cloning sector-by-sector...`)
                }
              </p>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="download-section mt-8 bg-green-500/10 border border-green-500/20 rounded-2xl p-6"
            >
              <div className="flex flex-col items-center gap-2 text-green-400 mb-6">
                <CheckCircle size={48} className="drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]" />
                <span className="text-xl font-bold text-white">Operation Successful</span>
              </div>
              <button
                onClick={handleDownload}
                className="btn-primary bg-gradient-to-r from-emerald-500 to-green-600"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <Download /> Save Recovered Data
                </span>
              </button>
              <button
                onClick={() => setStatus('idle')}
                className="mt-4 text-sm text-dim hover:text-white transition-colors"
              >
                Start New Session
              </button>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 bg-red-500/10 border border-red-500/20 rounded-2xl p-6"
            >
              <div className="flex items-center gap-3 text-red-400 mb-4">
                <AlertCircle size={24} />
                <span className="font-bold text-lg">Process Failed</span>
              </div>
              <div className="bg-black/30 rounded-lg p-4 font-mono text-xs text-red-200 mb-6 max-h-32 overflow-auto custom-scrollbar">
                {errorMessage}
              </div>
              <button
                onClick={() => setStatus('idle')}
                className="btn-secondary w-full"
              >
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default App;
